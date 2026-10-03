"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { validateConfirmation, validateExclusion, type Failure } from "./confirm-guard";

/**
 * Every mutation the admin console can perform (`fitment-engine` §8.9).
 *
 * ONE OPERATOR. THERE IS NO AUTHORISATION STEP AND THERE IS NOT GOING TO BE ONE.
 *
 * Locked decision 1: the owner is the only person who edits fitment data. So
 * there are no roles, no permission matrix, no second editor seat and nothing to
 * check after `requireAdmin()` returns. `src/proxy.ts` says the same thing from
 * the other end. If a later change ever needs a second seat, that is a decision
 * to take deliberately and rewrite this comment in — not something to discover as
 * an `if (user.role === ...)` somebody added because it seemed tidy. Requirement
 * 14.1 asks for exactly that to be recorded here rather than implied.
 *
 * WHY `requireAdmin()` IS THE FIRST STATEMENT OF EVERY FUNCTION BELOW
 *
 * A Server Action is a POST endpoint. The Next Server Actions guide is explicit
 * that it "is reachable to anyone who can send the same POST", so a button that
 * only renders for an authenticated operator is a UI convenience and not a
 * boundary. `requireAdmin()` throws rather than returning a falsy value, so the
 * mistake of writing `await requireAdmin()` and ignoring the result cannot be
 * made. Nothing is read from `formData` before the check: an unauthenticated POST
 * reaches the credential comparison and nothing else.
 *
 * WHY THE REQUEST IS REBUILT FROM `headers()`
 *
 * `requireAdmin(request)` takes a `Request` — that is the signature §7.3 fixed,
 * in a module this workstream does not own and must not edit. A Server Action has
 * no `Request` object of its own, so the incoming headers are wrapped in one.
 * Only the headers are copied: `requireAdmin` reads nothing else off it, and a
 * synthetic Request pretending to have a body would be a lie.
 *
 * WHY A REFUSAL REDIRECTS INSTEAD OF RETURNING A RESULT
 *
 * There is no client-side state anywhere in this console: no `'use client'`, no
 * `useActionState`, no form library. That is a deliberate choice, not an
 * oversight. It means the refusal path is identical with JavaScript disabled,
 * enabled, half-loaded or blocked, so there is no second implementation of the
 * gate that only one of the two paths enforces — and the field-level messages
 * this form exists to produce are the same HTML either way. The cost is that a
 * refusal travels back as a query string, which is why `confirm-guard.ts` bounds
 * the free-text fields.
 *
 * WHY EVERY DECISION WRITES AN `AuditEntry`
 *
 * `fitment-engine` §6.3: `AuditEntry` is append-only by construction — no
 * `updatedAt`, and no edit or delete affordance anywhere in this file — because a
 * mutable audit log is not an audit log. It is also the only place the owner's own
 * words survive: `confirmationNote` is stored verbatim beside `confirmedOn`
 * (§10.2), so a fat-fingered confirmation is legible a week later.
 *
 * `fitment-engine` §10.1 would put the writer in `src/lib/audit.ts`; it lives
 * here instead because this workstream owns `src/app/admin/**` and nothing else.
 */

/**
 * A syntactically valid absolute URL used only to satisfy `requireAdmin`'s
 * signature. No Request built from it is ever sent anywhere, so the host is a
 * constant rather than a mistake waiting to happen.
 */
const ACTION_REQUEST_URL = "https://admin.invalid/";

/** Reads one text field. `FormData` values are `FormDataEntryValue`, never trusted. */
function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Every string the submission actually carried, keyed by field name.
 *
 * A key the caller invented that the form never rendered is simply absent and
 * reads as `""`, which the guard then refuses. `layoutId` is dropped from the
 * echo because an id does not belong in a URL a person can see.
 */
function submittedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value === "string") values[name] = value;
  }
  return values;
}

function pick(values: Record<string, string>, name: string): string {
  return values[name] ?? "";
}

/**
 * Send the owner back where they came from, carrying what they typed and what is
 * wrong with it.
 *
 * `never` because `redirect()` throws: Next documents it as a control-flow
 * exception, so nothing after a call to this runs. The return type is what stops a
 * later edit from putting a database write after a redirect and finding out at
 * runtime that it never executed.
 */
function backTo(path: string, params: URLSearchParams): never {
  const query = params.toString();
  redirect(query === "" ? path : `${path}?${query}`);
}

/**
 * `e=<field>~<code>`, repeated. Deliberately short: these travel in a URL bar,
 * and the sentence that explains them is looked up from one table in
 * `confirm-guard.ts` rather than sent in the query string.
 */
function refusalParams(values: Record<string, string>, failures: Failure[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (name === "layoutId") continue;
    params.set(`v.${name}`, value);
  }
  for (const failure of failures) params.append("e", `${failure.field}~${failure.code}`);
  return params;
}

/**
 * The `AuditEntry` writer. Append-only, and the only place in the console that
 * touches the table outside a transaction.
 *
 * `before`/`after` are stored per field rather than as one snapshot, which is what
 * `AuditEntry`'s own doc comment asks for: a week later, "what did this price used
 * to be" must be answerable without reconstructing anything.
 */
async function audit(entry: {
  entity: string;
  entityId: string;
  action: string;
  field?: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  note?: string;
}): Promise<void> {
  await prisma.auditEntry.create({
    data: {
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      field: entry.field ?? null,
      // `undefined` leaves the column at its default NULL; passing an explicit
      // null would need `Prisma.DbNull` and would mean something different.
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      note: entry.note ?? null,
      // `ADMIN_USER` rather than a session: locked decision 1 gives one actor, and
      // `Mapping.confirmedBy` is documented as "one name, not an identity" for
      // exactly this reason.
      who: process.env.ADMIN_USER ?? null,
    },
  });
}

/** `YYYY-MM-DD` in the server's own timezone, which is what a person means by "today". */
function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * Confirm one layout: the screen where an `inferred` row becomes a `confirmed`
 * one (`fitment-engine` §8.5, gate in §9.7).
 *
 * WHY IT ALSO RAISES THE MAPPINGS
 *
 * `/fit-check` is `checkFitLive` in `src/lib/fitment-live.ts`, and it loads
 * `Mapping` rows `where: { confidence: "confirmed" }`. Confirming a layout and
 * leaving its mapping `inferred` would save the work and change nothing a customer
 * is told — the exact dead end §6.10 was written to close. The confirmation is
 * therefore one transaction over the layout, its variants, its vehicles' year
 * spans and its mappings, or none of it.
 *
 * WHY IT IS IDEMPOTENT
 *
 * A double-click is two real sequential POSTs — a disabled button is not a guard,
 * which is why `Order.idempotencyKey` exists. Submitting the same confirmation
 * twice therefore finds every field already equal, writes nothing and says so.
 * There is no `create` on any Layout, LayoutVariant or Mapping in this function,
 * so a duplicate cannot be created; the equality comparison is there so the second
 * submission is also not recorded as a change somebody made.
 *
 * WHY THE AUDIT ROWS ARE INSIDE THE TRANSACTION
 *
 * An audit row recording a change the database then rolled back is worse than no
 * row: it is a record of something that did not happen, in the one table whose
 * entire value is that it cannot lie.
 */
export async function confirmLayout(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const layoutId = text(formData, "layoutId");
  const back = `/admin/layouts/${encodeURIComponent(layoutId)}`;

  const layout = await prisma.layout.findUnique({
    where: { id: layoutId },
    include: {
      variants: { include: { product: { select: { slug: true } } } },
      mappings: { include: { vehicle: { include: { make: { select: { name: true } } } } } },
    },
  });

  if (!layout) {
    const params = new URLSearchParams();
    params.set("e", "layout~layoutNotFound");
    backTo("/admin/layouts", params);
  }

  if (layout.status === "retired") {
    const params = new URLSearchParams();
    params.set("e", "layout~retired");
    backTo(back, params);
  }

  const values = submittedValues(formData);

  // Ids are read from the database and never taken from the form. The form says
  // what the numbers are; which rows those numbers belong to is not something a
  // client gets to decide.
  const vehicles = layout.mappings.map((mapping) => ({
    vehicleId: mapping.vehicle.id,
    label: `${mapping.vehicle.make.name} ${mapping.vehicle.model}`,
  }));
  const variants = layout.variants.map((variant) => ({
    variantId: variant.id,
    label: `${variant.product.slug} (${variant.kind})`,
  }));

  // Every code already spoken for by a confirmed layout, minus this layout's own,
  // so re-confirming at an unchanged code is not a self-collision.
  // `assertLiveLayouts` throws on a duplicate and `scripts/fitment-guard.mjs`
  // fails the database on one. This is the same invariant, enforced at the one
  // moment it can still be refused, in the one place a person can act on it.
  const confirmedCodes = (
    await prisma.layout.findMany({
      where: { status: "confirmed", NOT: { id: layoutId } },
      select: { internalCode: true },
    })
  ).map((row) => row.internalCode);

  const check = validateConfirmation(
    {
      internalCode: pick(values, "internalCode"),
      evidence: pick(values, "evidence"),
      confirmationNote: pick(values, "confirmationNote"),
      confirmedOn: pick(values, "confirmedOn"),
      leadTime: pick(values, "leadTime"),
      yearFromByVehicle: Object.fromEntries(
        vehicles.map((vehicle) => [vehicle.vehicleId, pick(values, `yearFrom__${vehicle.vehicleId}`)]),
      ),
      yearToByVehicle: Object.fromEntries(
        vehicles.map((vehicle) => [vehicle.vehicleId, pick(values, `yearTo__${vehicle.vehicleId}`)]),
      ),
      priceFromByVariant: Object.fromEntries(
        variants.map((variant) => [variant.variantId, pick(values, `price__${variant.variantId}`)]),
      ),
    },
    { vehicles, variants, confirmedCodes, today: todayIso() },
  );

  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  const { value } = check;

  /** Only the fields that actually move. A null previous value is a real before. */
  const layoutChanges: { field: string; before: string | null; after: string }[] = [];
  const pushLayoutChange = (field: string, before: string | null, after: string): void => {
    if (before !== after) layoutChanges.push({ field, before, after });
  };

  pushLayoutChange("status", layout.status, "confirmed");
  pushLayoutChange("internalCode", layout.internalCode, value.internalCode);
  pushLayoutChange("evidence", layout.evidence, value.evidence);
  pushLayoutChange("confirmationNote", layout.confirmationNote, value.confirmationNote);
  pushLayoutChange(
    "confirmedOn",
    layout.confirmedOn ? layout.confirmedOn.toISOString().slice(0, 10) : null,
    value.confirmedOn,
  );
  pushLayoutChange("leadTime", layout.leadTime, value.leadTime);

  const priceChanges = value.prices
    .map((price) => {
      const row = layout.variants.find((variant) => variant.id === price.variantId);
      return row && row.priceFrom !== price.priceFrom ? { row, priceFrom: price.priceFrom } : null;
    })
    .filter((change): change is NonNullable<typeof change> => change !== null);

  const yearChanges = value.years
    .map((year) => {
      const row = layout.mappings.find((mapping) => mapping.vehicle.id === year.vehicleId);
      return row && (row.vehicle.yearFrom !== year.yearFrom || row.vehicle.yearTo !== year.yearTo)
        ? { row, yearFrom: year.yearFrom, yearTo: year.yearTo }
        : null;
    })
    .filter((change): change is NonNullable<typeof change> => change !== null);

  const mappingChanges = layout.mappings.filter((mapping) => mapping.confidence !== "confirmed");

  const changedAnything =
    layoutChanges.length > 0 || priceChanges.length > 0 || yearChanges.length > 0 || mappingChanges.length > 0;

  if (changedAnything) {
    const who = process.env.ADMIN_USER ?? null;
    const confirmedAt = new Date(`${value.confirmedOn}T00:00:00Z`);

    await prisma.$transaction(async (tx) => {
      await tx.layout.update({
        where: { id: layout.id },
        data: {
          status: "confirmed",
          internalCode: value.internalCode,
          evidence: value.evidence,
          confirmationNote: value.confirmationNote,
          confirmedOn: confirmedAt,
          leadTime: value.leadTime,
        },
      });

      for (const change of priceChanges) {
        await tx.layoutVariant.update({
          where: { id: change.row.id },
          data: { priceFrom: change.priceFrom },
        });
      }

      for (const change of yearChanges) {
        await tx.vehicle.update({
          where: { id: change.row.vehicle.id },
          data: { yearFrom: change.yearFrom, yearTo: change.yearTo },
        });
      }

      for (const mapping of mappingChanges) {
        await tx.mapping.update({
          where: { id: mapping.id },
          data: {
            confidence: "confirmed",
            confirmedBy: who ?? "admin",
            confirmedOn: confirmedAt,
          },
        });
      }

      for (const change of layoutChanges) {
        await tx.auditEntry.create({
          data: {
            entity: "Layout",
            entityId: layout.id,
            action: change.field === "status" ? "confirm" : "update",
            field: change.field,
            before: change.before ?? undefined,
            after: change.after,
            note:
              change.field === "status"
                ? `confirmationNote: ${value.confirmationNote} | confirmedOn: ${value.confirmedOn} | evidence: ${value.evidence}`
                : null,
            who,
          },
        });
      }
      for (const change of priceChanges) {
        await tx.auditEntry.create({
          data: {
            entity: "LayoutVariant",
            entityId: change.row.id,
            action: "update",
            field: "priceFrom",
            before: change.row.priceFrom,
            after: change.priceFrom,
            note: `on layout ${value.internalCode}`,
            who,
          },
        });
      }
      for (const change of yearChanges) {
        await tx.auditEntry.create({
          data: {
            entity: "Vehicle",
            entityId: change.row.vehicle.id,
            action: "update",
            field: "yearFrom/yearTo",
            before: { yearFrom: change.row.vehicle.yearFrom, yearTo: change.row.vehicle.yearTo },
            after: { yearFrom: change.yearFrom, yearTo: change.yearTo },
            note: `verified span for layout ${value.internalCode}`,
            who,
          },
        });
      }
      for (const mapping of mappingChanges) {
        await tx.auditEntry.create({
          data: {
            entity: "Mapping",
            entityId: mapping.id,
            action: "confirm",
            field: "confidence",
            before: mapping.confidence,
            after: "confirmed",
            note: `layout ${value.internalCode} confirmed`,
            who,
          },
        });
      }
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/vehicles");
  revalidatePath("/admin/layouts");
  revalidatePath(back);

  const params = new URLSearchParams();
  params.set("saved", changedAnything ? "confirmed" : "unchanged");
  backTo(back, params);
}

/**
 * Record a known non-fit (`fitment-engine` §8.6).
 *
 * `Exclusion.reason` is REQUIRED and is never generated. The schema says why in so
 * many words — "a customer is entitled to argue with a refusal, and a generated
 * reason is an argument they win" — so there is no fallback sentence anywhere on
 * this path, and a blank reason is refused rather than replaced with something
 * plausible.
 */
export async function createExclusion(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const input = {
    make: pick(values, "make"),
    model: pick(values, "model"),
    yearFrom: pick(values, "yearFrom"),
    yearTo: pick(values, "yearTo"),
    trim: pick(values, "trim"),
    reason: pick(values, "reason"),
  };

  const failures = validateExclusion(input);
  if (failures.length > 0) backTo("/admin/exclusions", refusalParams(values, failures));

  // `layoutId` is optional: it names the floor pan somebody wrongly assumed
  // covered this car. Left blank it stays null, which is the common case — an
  // exclusion is often about a car with no `Vehicle` row at all.
  const layoutId = pick(values, "layoutId").trim() || null;
  if (layoutId) {
    const target = await prisma.layout.findUnique({ where: { id: layoutId }, select: { id: true } });
    if (!target) {
      backTo(
        "/admin/exclusions",
        refusalParams(values, [{ field: "layoutId", code: "layoutNotFound" }]),
      );
    }
  }

  const created = await prisma.exclusion.create({
    data: {
      make: input.make.trim(),
      model: input.model.trim(),
      yearFrom: Number(input.yearFrom),
      yearTo: Number(input.yearTo),
      trim: input.trim.trim() === "" ? null : input.trim.trim(),
      layoutId,
      reason: input.reason.trim(),
    },
  });

  await audit({
    entity: "Exclusion",
    entityId: created.id,
    action: "create",
    note: `${created.make} ${created.model} ${created.yearFrom}-${created.yearTo}: ${created.reason}`,
  });

  revalidatePath("/admin/exclusions");
  // The dashboard counts recorded exclusions, so that number moves too.
  revalidatePath("/admin");

  const params = new URLSearchParams();
  params.set("saved", "exclusion");
  backTo("/admin/exclusions", params);
}

/**
 * Withdraw one exclusion.
 *
 * A removal is a decision somebody made and can be argued with, so it is audited
 * as a `delete` carrying the row as it was. `Exclusion` is `SetNull` from `Layout`
 * and has no children, so removing the row cannot take a claim with it — but the
 * record that a refusal was withdrawn stays in the log.
 *
 * A row that is already gone is a success, not an error: the goal was for that
 * refusal not to be there, and it is not. Re-submitting must not look like a
 * failure to somebody who only wanted it gone.
 */
export async function deleteExclusion(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const id = text(formData, "exclusionId");
  const existing = await prisma.exclusion.findUnique({ where: { id } });

  if (existing) {
    await prisma.exclusion.delete({ where: { id } });
    await audit({
      entity: "Exclusion",
      entityId: id,
      action: "delete",
      note: `${existing.make} ${existing.model} ${existing.yearFrom}-${existing.yearTo}: ${existing.reason}`,
    });
  }

  revalidatePath("/admin/exclusions");
  revalidatePath("/admin");

  const params = new URLSearchParams();
  params.set("saved", "removed");
  backTo("/admin/exclusions", params);
}