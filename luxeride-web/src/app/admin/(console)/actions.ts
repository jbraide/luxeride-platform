"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { flashBack } from "./flash";
import { requireAdmin } from "@/lib/admin-auth";
import { HERO_LAYOUTS, getSetting, setSetting, type HeroLayout } from "@/lib/settings";
import {
  rangePriceKey,
  validateConfirmation,
  validateExclusion,
  validateImage,
  validateRange,
  type Failure,
} from "./confirm-guard";

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
      make: { select: { name: true } },
      variants: {
        // `rangePrices` is read here so the confirmation can tell an unchanged
        // per-range price from an edited one — which is what keeps a re-confirmation
        // from writing an audit row nobody changed anything to earn.
        include: {
          product: { select: { slug: true } },
          rangePrices: { select: { vehicleId: true, priceFrom: true } },
        },
      },
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
      rangePriceByKey: Object.fromEntries(
        vehicles.flatMap((vehicle) =>
          variants.map((variant) => [
            rangePriceKey(vehicle.vehicleId, variant.variantId),
            pick(values, `rangePrice__${rangePriceKey(vehicle.vehicleId, variant.variantId)}`),
          ]),
        ),
      ),
    },
    {
      vehicles,
      variants,
      confirmedCodes,
      today: todayIso(),
      // For `deriveInternalCode()`. Both come from the database, never the form:
      // the ticker is derived from names the owner never typed on this screen.
      make: layout.make.name,
      model: layout.mappings[0]?.vehicle.model ?? layout.customerName.trim(),
    },
  );

  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  const { value } = check;

  /** Only the fields that actually move. A null previous value is a real before. */
  const layoutChanges: { field: string; before: string | null; after: string | null }[] = [];
  const pushLayoutChange = (field: string, before: string | null, after: string | null): void => {
    if (before !== after) layoutChanges.push({ field, before, after });
  };

  pushLayoutChange("status", layout.status, "confirmed");
  pushLayoutChange("internalCode", layout.internalCode, value.internalCode);
  // `?? null` on both: evidence and the note became OPTIONAL on 2026-10-04, so the
  // narrowed type is `T | undefined` where a blank submission is the honest answer.
  // `pushLayoutChange` takes `string | null` for `after`, so an omitted note is
  // written as null — which is also what it must become in the column.
  pushLayoutChange("evidence", layout.evidence, value.evidence ?? null);
  pushLayoutChange("confirmationNote", layout.confirmationNote, value.confirmationNote ?? null);
  pushLayoutChange(
    "confirmedOn",
    layout.confirmedOn ? layout.confirmedOn.toISOString().slice(0, 10) : null,
    value.confirmedOn,
  );
  // `value.leadTime` is undefined when the box was left blank, which means "keep
  // whatever is stored, and let `DEFAULT_LEAD_TIME` cover a row that has none".
  // `before === after` for an untouched blank, so this records nothing — which is
  // correct: leaving an optional field alone is not a change.
  if (value.leadTime !== undefined) {
    pushLayoutChange("leadTime", layout.leadTime, value.leadTime);
  }

  /** The layout-level DEFAULT. Not the quote — see `ConfirmationInput`. */
  const defaultPriceChanges = value.defaultPrices
    .map((price) => {
      const row = layout.variants.find((variant) => variant.id === price.variantId);
      return row && row.priceFrom !== price.priceFrom ? { row, priceFrom: price.priceFrom } : null;
    })
    .filter((change): change is NonNullable<typeof change> => change !== null);

  /**
   * THE QUOTE: one `RangePrice` per (year range, offered variant).
   *
   * The pre-existing price for the cell is read from `layout.variants[].rangePrices`
   * rather than from a second query, so the whole comparison is against data this
   * request already loaded. `upsert` rather than `create`: the unique key is
   * `(layoutVariantId, vehicleId)` and a re-confirmation of an already-priced cell
   * is not a new row.
   */
  const rangePriceChanges = value.rangePrices.flatMap((price) => {
    const variant = layout.variants.find((row) => row.id === price.variantId);
    const mapping = layout.mappings.find((row) => row.vehicle.id === price.vehicleId);
    if (!variant || !mapping) return [];
    const existing = variant.rangePrices.find((row) => row.vehicleId === price.vehicleId);
    return existing && existing.priceFrom === price.priceFrom
      ? []
      : [{ variant, vehicleId: price.vehicleId, priceFrom: price.priceFrom, before: existing?.priceFrom ?? null }];
  });

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
    layoutChanges.length > 0 ||
    defaultPriceChanges.length > 0 ||
    rangePriceChanges.length > 0 ||
    yearChanges.length > 0 ||
    mappingChanges.length > 0;

  if (changedAnything) {
    const who = process.env.ADMIN_USER ?? null;
    const confirmedAt = new Date(`${value.confirmedOn}T00:00:00Z`);

    await prisma.$transaction(async (tx) => {
      await tx.layout.update({
        where: { id: layout.id },
        data: {
          status: "confirmed",
          internalCode: value.internalCode,
          evidence: value.evidence ?? null,
          confirmationNote: value.confirmationNote ?? null,
          confirmedOn: confirmedAt,
          // Undefined means "leave it alone". Not `?? null`, which would CLEAR a
          // lead time the owner set on an earlier pass just because they left the
          // optional box alone this time.
          ...(value.leadTime === undefined ? {} : { leadTime: value.leadTime }),
        },
      });

      for (const change of defaultPriceChanges) {
        await tx.layoutVariant.update({
          where: { id: change.row.id },
          data: { priceFrom: change.priceFrom },
        });
      }

      // One row per (offer, year range). `upsert` so a re-confirmation of an
      // unchanged cell is a no-op rather than a unique-violation, which is the same
      // reasoning `Order.idempotencyKey` exists for: a double-click is two real
      // sequential POSTs.
      for (const change of rangePriceChanges) {
        await tx.rangePrice.upsert({
          where: {
            layoutVariantId_vehicleId: {
              layoutVariantId: change.variant.id,
              vehicleId: change.vehicleId,
            },
          },
          create: {
            layoutVariantId: change.variant.id,
            vehicleId: change.vehicleId,
            priceFrom: change.priceFrom,
          },
          update: { priceFrom: change.priceFrom },
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
            // Same reason as `before`: a cleared optional field (`evidence`, the
            // note) has no `after` value, and `undefined` leaves the column NULL —
            // which reads correctly, because `field` already names which field went
            // from something to nothing.
            after: change.after ?? undefined,
            note:
              change.field === "status"
                ? `confirmationNote: ${value.confirmationNote ?? "(not recorded)"} | confirmedOn: ${value.confirmedOn} | evidence: ${value.evidence ?? "(not recorded)"}`
                : null,
            who,
          },
        });
      }
      for (const change of defaultPriceChanges) {
        await tx.auditEntry.create({
          data: {
            entity: "LayoutVariant",
            entityId: change.row.id,
            action: "update",
            field: "priceFrom (default for new ranges)",
            before: change.row.priceFrom,
            after: change.priceFrom,
            note: `on layout ${value.internalCode}`,
            who,
          },
        });
      }
      // The quote path. A separate entity from `LayoutVariant` because a per-range
      // price is a DIFFERENT fact from the layout default, and a week later "what
      // did the 2011 Corolla actually cost?" is answerable from this row alone.
      for (const change of rangePriceChanges) {
        const label =
          layout.mappings.find((mapping) => mapping.vehicle.id === change.vehicleId)?.vehicle.model ??
          change.vehicleId;
        await tx.auditEntry.create({
          data: {
            entity: "RangePrice",
            entityId: change.variant.id,
            action: "update",
            field: `priceFrom · ${label}`,
            // A null `before` means this cell had NO price — the row did not exist.
            // `undefined` rather than null because Prisma's `Json` input rejects a
            // bare null, and omitting the key is the honest way to say "nothing was
            // here to change from": the column stays null and the entry reads as a
            // creation rather than a move from an unknown number.
            before: change.before ?? undefined,
            after: change.priceFrom,
            note: `layout ${value.internalCode}`,
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

  await flashBack(back, changedAnything ? "confirmed" : "unchanged");
}

/**
 * Turn ONE CAR on and off.
 *
 * The control the owner asked for on 2026-10-05: "the ability to deactivate for each
 * model and for the year, without deleting". One boolean, one click, reversible — and
 * it is the ONLY thing that decides whether a car is offered, since it replaced
 * `Layout.status` as the gate in the same change.
 *
 * Turning a car off does NOT touch its year ranges, its prices or its photographs. They
 * stay exactly as they are, because turning a car back on has to restore it to what it
 * was — and because a sold-out generation is a different question from a car we do
 * not stock at all.
 */
export async function setLayoutActive(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const layoutId = text(formData, "layoutId");
  const back = `/admin/layouts/${encodeURIComponent(layoutId)}`;
  const requested = text(formData, "active") === "on";

  const layout = await prisma.layout.findUnique({ where: { id: layoutId }, select: { id: true, active: true } });
  if (!layout) backTo("/admin/layouts", refusalParams(values, [{ field: "layoutId", code: "layoutNotFound" }]));

  if (layout.active !== requested) {
    const who = process.env.ADMIN_USER ?? null;
    await prisma.$transaction([
      prisma.layout.update({ where: { id: layoutId }, data: { active: requested } }),
      prisma.auditEntry.create({
        data: {
          entity: "Layout",
          entityId: layoutId,
          action: "update",
          field: "active",
          before: layout.active,
          after: requested,
          note: requested ? "the car is offered to customers again" : "the car is withdrawn — it stops answering fit checks",
          who,
        },
      }),
    ]);
  }

  revalidatePath(back);
  revalidatePath("/admin");
  revalidatePath("/admin/layouts");
  revalidatePath("/admin/vehicles");
  revalidatePath("/fit-finder");

  await flashBack(back, layout.active === requested ? "unchanged" : requested ? "live" : "withdrawn");
}

/**
 * Turn ONE YEAR RANGE of one car on and off.
 *
 * "Deactivate years without deleting" — the owner's exact words, 2026-10-05. A
 * `Vehicle` row IS a year span, so this is the control that says "we have that
 * generation, not this one": a Corolla keeps selling for 2014–2020 with its prices and
 * its photographs, and simply stops answering for 2003–2008.
 *
 * Deactivating rather than deleting is the whole point. The range carries its
 * `RangePrice` rows, its photographs and its mapping history; a delete loses all three
 * and a switch brings them straight back when stock returns.
 */
export async function setVehicleActive(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const layoutId = text(formData, "layoutId");
  const vehicleId = text(formData, "vehicleId");
  // The layout page is the default home for this switch, and `back` overrides it for
  // the other screen that renders it — `/admin/vehicles`, which must return the
  // operator to the filtered list they were working in, not to one car's layout.
  const back = text(formData, "back") || (layoutId ? `/admin/layouts/${encodeURIComponent(layoutId)}` : "/admin/vehicles");
  const requested = text(formData, "active") === "on";

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, active: true } });
  if (!vehicle) backTo(back, refusalParams(values, [{ field: "vehicleId", code: "vehicleNotFound" }]));

  if (vehicle.active !== requested) {
    const who = process.env.ADMIN_USER ?? null;
    await prisma.$transaction([
      prisma.vehicle.update({ where: { id: vehicleId }, data: { active: requested } }),
      prisma.auditEntry.create({
        data: {
          entity: "Vehicle",
          entityId: vehicleId,
          action: "update",
          field: "active",
          before: vehicle.active,
          after: requested,
          note: requested ? "this year range is offered again" : "this year range withdrawn — its prices and photographs are kept",
          who,
        },
      }),
    ]);
  }

  revalidatePath(back);
  revalidatePath("/admin");
  revalidatePath("/admin/vehicles");
  revalidatePath("/fit-finder");

  await flashBack(back, vehicle.active === requested ? "unchanged" : requested ? "live" : "withdrawn");
}

/**
 * Turn MANY year ranges on or off in one submission — the batch half of the per-range
 * switch, on `/admin/vehicles`.
 *
 * WHY IT IS A SEPARATE ACTION AND NOT `setVehicleActive` IN A LOOP
 *
 * Because a loop of redirects is not a batch: the first call redirects and the rest
 * never run. This reads every ticked id once, writes the ones that actually move in one
 * transaction, and audits each change as its own row — the same per-row audit trail the
 * single switch leaves, so a bulk withdrawal is not a blank in the log.
 *
 * Reads are unchanged by definition: a range already in the requested state records
 * nothing, which is what makes a second click say "nothing changed" instead of
 * inventing work nobody did.
 */
export async function setVehiclesActive(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const requested = text(formData, "active") === "on";
  const back = text(formData, "back") || "/admin/vehicles";

  // `getAll`, not `get`: a checkbox group posts one entry per ticked box. Ids are
  // de-duplicated because a box the operator double-clicked is still one range.
  const ids = [...new Set(formData.getAll("vehicleIds").filter((value): value is string => typeof value === "string"))];
  if (ids.length === 0) backTo(back, refusalParams(values, [{ field: "vehicleIds", code: "nothingSelected" }]));

  const rows = await prisma.vehicle.findMany({
    where: { id: { in: ids } },
    select: { id: true, active: true },
  });
  const toFlip = rows.filter((row) => row.active !== requested);

  if (toFlip.length > 0) {
    const who = process.env.ADMIN_USER ?? null;
    await prisma.$transaction([
      prisma.vehicle.updateMany({ where: { id: { in: toFlip.map((row) => row.id) } }, data: { active: requested } }),
      prisma.auditEntry.createMany({
        data: toFlip.map((row) => ({
          entity: "Vehicle",
          entityId: row.id,
          action: "update",
          field: "active",
          before: row.active,
          after: requested,
          note: requested
            ? "this year range is offered again (bulk)"
            : "this year range withdrawn (bulk) — its prices and photographs are kept",
          who,
        })),
      }),
    ]);
  }

  revalidatePath("/admin/vehicles");
  revalidatePath("/admin");
  revalidatePath("/admin/layouts");
  revalidatePath("/fit-finder");

  await flashBack(back, toFlip.length === 0 ? "bulkUnchanged" : requested ? "bulkLive" : "bulkWithdrawn");
}

/**
 * WITHDRAW EVERY YEAR RANGE OF ONE CAR, in one submission.
 *
 * The owner's ask: "a button to withdraw all the vehicles for a particular car".
 *
 * KEYED BY MAKE + MODEL, NOT BY A LIST OF IDS, and that is the whole point rather than
 * a shortcut. `/admin/vehicles` can be FILTERED (unmapped / mapped / excluded), and a
 * filter narrows each car to the ranges that match it — so a button built from the ids
 * on screen would withdraw only the matching subset while its label said "every range".
 * That is the kind of quiet half-action this console exists to avoid. Reading the car's
 * ranges from the database means "every range" cannot disagree with what it does.
 *
 * Only ranges that are still live are touched, and each one is audited as its own row —
 * the same per-row trail `setVehiclesActive` leaves, so a bulk withdrawal is never a
 * blank in the log. A car whose ranges are all already withdrawn is a success that
 * changed nothing, and says so (`bulkUnchanged`) rather than reporting a withdrawal
 * that did not happen.
 */
export async function withdrawCar(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const back = text(formData, "back") || "/admin/vehicles";
  const makeId = text(formData, "makeId");
  const model = text(formData, "model").trim();
  if (makeId === "" || model === "") {
    backTo(back, refusalParams(values, [{ field: "model", code: "required" }]));
  }

  const rows = await prisma.vehicle.findMany({
    where: { makeId, model, active: true },
    select: { id: true },
  });

  if (rows.length > 0) {
    const who = process.env.ADMIN_USER ?? null;
    await prisma.$transaction([
      prisma.vehicle.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { active: false } }),
      prisma.auditEntry.createMany({
        data: rows.map((row) => ({
          entity: "Vehicle",
          entityId: row.id,
          action: "update",
          field: "active",
          before: true,
          after: false,
          note: "every range of this car withdrawn at once — its prices and photographs are kept",
          who,
        })),
      }),
    ]);
  }

  revalidatePath("/admin/vehicles");
  revalidatePath("/admin");
  revalidatePath("/admin/layouts");
  revalidatePath("/fit-finder");

  await flashBack(back, rows.length === 0 ? "bulkUnchanged" : "bulkWithdrawn");
}

/**
 * Remove ONE year range from the catalogue — the destructive half of the pair the
 * owner asked for on `/admin/vehicles` ("a withdraw button and a delete button … so I
 * can remove what I don't need").
 *
 * WHY A DELETE EXISTS AT ALL, WHEN THE SWITCH IS THE BETTER DEFAULT
 *
 * `Vehicle.active = false` is the reversible answer, and it is why the switch is the
 * primary control: a withdrawn range keeps its prices and its photographs and comes
 * back the moment stock does. But a range that is not a car we will ever sell — a
 * duplicate an import left behind, a name the file spelled wrong — is not work waiting
 * to be done, and leaving it in the list is a queue that never empties. So the delete
 * is here, deliberately, and it is the button that loses data.
 *
 * WHAT THE SCHEMA DOES WITH THE CHILDREN, since that is the whole risk:
 *   - `Mapping` and `ImageSet` CASCADE — they are the range's own claims, and a claim
 *     with no range is nothing.
 *   - `RangePrice` and `OrderItem.vehicleId` go NULL — an order keeps its frozen
 *     snapshot of what was bought, and a stray price row stops being quoted rather
 *     than blocking the delete.
 * Nothing else refers to a range, so there is no dangling reference to clean up.
 *
 * The removal is audited as a `delete` carrying the range as it was, because the audit
 * log is the record that this range existed — which is the one thing a delete would
 * otherwise take with it.
 */
export async function deleteVehicle(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const vehicleId = text(formData, "vehicleId");
  const back = text(formData, "back") || "/admin/vehicles";

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, model: true, yearFrom: true, yearTo: true, make: { select: { name: true } } },
  });
  if (!vehicle) backTo(back, refusalParams(values, [{ field: "vehicleId", code: "vehicleNotFound" }]));

  await prisma.$transaction([
    prisma.vehicle.delete({ where: { id: vehicleId } }),
    prisma.auditEntry.create({
      data: {
        entity: "Vehicle",
        entityId: vehicleId,
        action: "delete",
        note: `${vehicle.make.name} ${vehicle.model} ${vehicle.yearFrom ?? "?"}-${vehicle.yearTo ?? "?"} removed from the catalogue`,
        who: process.env.ADMIN_USER ?? null,
      },
    }),
  ]);

  revalidatePath("/admin/vehicles");
  revalidatePath("/admin");
  revalidatePath("/admin/layouts");
  revalidatePath("/fit-finder");

  await flashBack(back, "removed");
}

/**
 * Remove MANY year ranges in one submission.
 *
 * The audit rows are written in the SAME transaction as the delete, so a `deleteMany`
 * that fails cannot leave a log claiming ranges were removed. `createMany` carries the
 * whole set as one statement — which is also why the make/model of each row is read
 * first: once the rows are gone there is nothing left to name them by.
 */
export async function deleteVehicles(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const back = text(formData, "back") || "/admin/vehicles";
  const ids = [...new Set(formData.getAll("vehicleIds").filter((value): value is string => typeof value === "string"))];
  if (ids.length === 0) backTo(back, refusalParams(values, [{ field: "vehicleIds", code: "nothingSelected" }]));

  const rows = await prisma.vehicle.findMany({
    where: { id: { in: ids } },
    select: { id: true, model: true, yearFrom: true, yearTo: true, make: { select: { name: true } } },
  });

  if (rows.length > 0) {
    const who = process.env.ADMIN_USER ?? null;
    await prisma.$transaction([
      prisma.vehicle.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } }),
      prisma.auditEntry.createMany({
        data: rows.map((row) => ({
          entity: "Vehicle",
          entityId: row.id,
          action: "delete",
          note: `${row.make.name} ${row.model} ${row.yearFrom ?? "?"}-${row.yearTo ?? "?"} removed from the catalogue (bulk)`,
          who,
        })),
      }),
    ]);
  }

  revalidatePath("/admin/vehicles");
  revalidatePath("/admin");
  revalidatePath("/admin/layouts");
  revalidatePath("/fit-finder");

  await flashBack(back, "bulkRemoved");
}

/**
 * Set how many rows of seats a car has (`fitment-engine`, 2026-10-04).
 *
 * A SEPARATE ACTION, NOT A FIELD ON `confirmLayout`
 *
 * Because it does not describe the FLOOR PAN and it does not need anything else on
 * that form. It is a fact about the car's seating that can be set on its own, from
 * any screen, without re-entering four prices — and making it part of the
 * confirmation would mean the owner had to confirm a car to say "this is a 3-row",
 * which is a much bigger claim than the one they were making.
 *
 * "mixed" means "ask the customer", and it is the honest default: a Toyota Highlander
 * really is sold as both a 2-row and a 3-row, and nobody should guess which one a
 * particular owner has. Setting 2 or 3 tells the Fit Finder it already knows, and it
 * then skips the question and applies the right surcharge by itself.
 *
 * It is NOT a pricing field: it never sets a price. It only decides whether to ask,
 * and what to assume when not asking. The surcharge still comes from the price grid.
 */
export async function setSeatRows(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const layoutId = text(formData, "layoutId");
  const back = `/admin/layouts/${encodeURIComponent(layoutId)}`;
  const requested = text(formData, "seatRows");

  if (requested !== "2" && requested !== "3" && requested !== "mixed") {
    backTo(back, refusalParams(values, [{ field: "seatRows", code: "badSeatRows" }]));
  }

  const layout = await prisma.layout.findUnique({ where: { id: layoutId }, select: { id: true, seatRows: true } });
  if (!layout) backTo("/admin/layouts", refusalParams(values, [{ field: "seatRows", code: "layoutNotFound" }]));

  // Same rule as every other write here: an unchanged value is not a change, so it
  // records no audit row and no timestamp.
  if (layout.seatRows !== requested) {
    const who = process.env.ADMIN_USER ?? null;
    await prisma.$transaction([
      prisma.layout.update({ where: { id: layoutId }, data: { seatRows: requested } }),
      prisma.auditEntry.create({
        data: {
          entity: "Layout",
          entityId: layoutId,
          action: "update",
          field: "seatRows",
          before: layout.seatRows,
          after: requested,
          note:
            requested === "mixed"
              ? "the Fit Finder will ask the customer how many rows they have"
              : `the Fit Finder will not ask, and will assume ${requested} rows`,
          who,
        },
      }),
    ]);
  }

  revalidatePath(back);
  revalidatePath("/admin/layouts");
  revalidatePath("/fit-finder");

  await flashBack(back, layout.seatRows === requested ? "unchanged" : "seatRows");
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

  await flashBack("/admin/exclusions", "exclusion");
}

/**
 * Add a year range to a car (`fitment-engine` §8.4, the "add a range" step).
 *
 * A car is one `Layout`; its ranges are the `Vehicle` rows mapped onto it. This
 * creates a `Vehicle` for the same make and model at a NEW year span, and a
 * `Mapping` to this layout — which is exactly what a second range is. It does not
 * touch the layout's own fields: evidence, the note and the dates belong to the car
 * and are set once, on the confirmation form.
 *
 * IT DOES TOUCH PRICES, AND THAT IS THE ONE ADDITION
 *
 * Every `LayoutVariant` gets a `RangePrice` for the new range, seeded from that
 * variant's `priceFrom`. Without this the new range would be a car we hold, mapped
 * and priced by nobody — `checkFitLive` quotes from `RangePrice` alone, so a year
 * inside the new span would be refused with `nothingToQuote` the moment it was
 * added. Seeding the default is the right starting point precisely because it is
 * visible and editable: the owner opens the confirmation form and sees this
 * range's row pre-filled with the pan's default, and changes the cells that
 * differ. A silently absent price would be invisible, and an invisible price is
 * how a car that costs more than the default ends up quoted at the default.
 *
 * WHY THE MODEL COMES FROM AN EXISTING RANGE: the layout stores a make and a
 * customer name, not a structured model, so the car's model name is only knowable
 * from a range it already has. A layout with no ranges has no model to copy and is
 * refused rather than guessed at.
 */
export async function addRange(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const layoutId = text(formData, "layoutId");
  const back = `/admin/layouts/${encodeURIComponent(layoutId)}`;

  const layout = await prisma.layout.findUnique({
    where: { id: layoutId },
    include: {
      make: { select: { name: true } },
      variants: { select: { id: true, priceFrom: true, rowsSurcharge: true } },
      mappings: { include: { vehicle: { select: { model: true, yearFrom: true, yearTo: true } } } },
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

  // The car's model name: from a range it already has, or — when every range has
  // been removed — the model trimmed off the customer name ("Toyota Corolla" ->
  // "Corolla"). A layout with neither is refused rather than guessed at.
  const model =
    layout.mappings[0]?.vehicle.model ??
    (layout.customerName.startsWith(`${layout.make.name} `)
      ? layout.customerName.slice(layout.make.name.length + 1).trim()
      : layout.customerName.trim());
  if (!model) {
    backTo(back, refusalParams(values, [{ field: "yearTo", code: "noVehicles" }]));
  }

  const check = validateRange(
    { yearFrom: pick(values, "yearFrom"), yearTo: pick(values, "yearTo") },
    {
      today: todayIso(),
      existingSpans: layout.mappings.map((mapping) => ({
        yearFrom: mapping.vehicle.yearFrom,
        yearTo: mapping.vehicle.yearTo,
      })),
    },
  );
  if (!check.ok) backTo(back, refusalParams(values, check.failures));

  // Reuse a Vehicle that already exists at this exact make/model/span (the
  // `[makeId, model, yearFrom, yearTo]` unique key) rather than colliding with it,
  // and give a fresh one a source key that stays distinct from the catalogue's
  // `Make::Model` key. `sourceKey` is unique, so it is the upsert handle.
  const existingVehicle = await prisma.vehicle.findFirst({
    where: {
      makeId: layout.makeId,
      model,
      yearFrom: check.yearFrom,
      yearTo: check.yearTo,
    },
  });

  const vehicle =
    existingVehicle ??
    (await prisma.vehicle.create({
      data: {
        makeId: layout.makeId,
        model,
        sourceKey: `${layout.make.name}::${model}::${check.yearFrom}-${check.yearTo}`,
        yearFrom: check.yearFrom,
        yearTo: check.yearTo,
        status: "recognised",
      },
    }));

  const existingMapping = await prisma.mapping.findUnique({
    where: { layoutId_vehicleId: { layoutId, vehicleId: vehicle.id } },
  });

  if (!existingMapping) {
    const created = await prisma.mapping.create({
      data: { layoutId, vehicleId: vehicle.id, confidence: "inferred" },
    });
    await audit({
      entity: "Mapping",
      entityId: created.id,
      action: "create",
      note: `added range ${layout.make.name} ${model} ${check.yearFrom}-${check.yearTo} to ${layout.internalCode}`,
    });
  }

  // Seed a price for every offered variant on the new range, from that variant's
  // default. See the header: a range with no `RangePrice` cannot be quoted at all.
  // `upsert` because the range may have been added before, had its mapping removed
  // and be coming back — the unique key is `(layoutVariantId, vehicleId)`.
  for (const variant of layout.variants) {
    await prisma.rangePrice.upsert({
      where: {
        layoutVariantId_vehicleId: { layoutVariantId: variant.id, vehicleId: vehicle.id },
      },
      create: {
        layoutVariantId: variant.id,
        vehicleId: vehicle.id,
        priceFrom: variant.priceFrom,
        rowsSurcharge: variant.rowsSurcharge,
      },
      update: {},
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/vehicles");
  revalidatePath("/admin/layouts");
  revalidatePath(back);

  await flashBack(back, "range");
}

/**
 * Remove one range from a car.
 *
 * Deletes the `Mapping` (so the layout no longer covers those years) and the
 * range's photographs, which have no meaning without the range they were shot
 * for. The `Vehicle` row itself is LEFT IN PLACE: it is catalogue data that an
 * `OrderItem` may already point at, and removing a range from a car is not a
 * reason to forget that the car exists.
 */
export async function removeRange(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const layoutId = text(formData, "layoutId");
  const vehicleId = text(formData, "vehicleId");
  const back = `/admin/layouts/${encodeURIComponent(layoutId)}`;

  const mapping = await prisma.mapping.findUnique({
    where: { layoutId_vehicleId: { layoutId, vehicleId } },
  });

  if (mapping) {
    await prisma.$transaction([
      prisma.imageSet.deleteMany({ where: { layoutId, vehicleId } }),
      prisma.mapping.delete({ where: { id: mapping.id } }),
    ]);
    await audit({
      entity: "Mapping",
      entityId: mapping.id,
      action: "delete",
      note: `removed a range from layout ${layoutId}`,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/vehicles");
  revalidatePath("/admin/layouts");
  revalidatePath(back);

  await flashBack(back, "rangeRemoved");
}

/**
 * Attach a photograph to ONE OPTION of one range of a car (`fitment-engine` §11.1).
 *
 * The photo is keyed (layout, range, OPTION, angle) since 2026-10-05, so every option of
 * every range has its own slots and the same angle cannot be stored twice for one of
 * them. That is the owner's rule — “each year range should have the option for pics for
 * single and double, not one or the other” — and it is why `variationId` is REQUIRED:
 * a single-layer set and a double-layer set cut for the same car are different objects,
 * and a gallery holding one of them would be showing a customer evidence of something
 * they did not buy.
 *
 * `src` is a path or URL the operator supplies — there is no upload pipeline yet, and
 * inventing one would be a second, larger decision than this screen. Alt text is
 * mandatory and checked above.
 */
export async function addRangeImage(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const values = submittedValues(formData);
  const layoutId = text(formData, "layoutId");
  const vehicleId = text(formData, "vehicleId");
  const variationId = text(formData, "variationId");
  const back = `/admin/layouts/${encodeURIComponent(layoutId)}`;

  const failures = validateImage({
    angle: pick(values, "angle"),
    src: pick(values, "src"),
    alt: pick(values, "alt"),
    // An option is required, and "none" from a hand-written POST is refused rather
    // than defaulted: a photograph with no option attached would be evidence with
    // nothing to be evidence OF.
    variationId: variationId === "" ? "none" : variationId,
  });
  if (failures.length > 0) backTo(back, refusalParams(values, failures));

  // The range must actually belong to this layout, so a hand-written POST cannot
  // hang a photograph on another car's years.
  const mapping = await prisma.mapping.findUnique({
    where: { layoutId_vehicleId: { layoutId, vehicleId } },
  });
  if (!mapping) {
    backTo(back, refusalParams(values, [{ field: "angle", code: "rangeNotFound" }]));
  }

  // AND THE OPTION MUST BE ONE THIS FLOOR PAN ACTUALLY OFFERS. A photograph of a
  // double-layer set on a pan cut for single layer only is a claim about an object we
  // do not sell for this car, stored in the one table that is evidence.
  const offered = await prisma.layoutVariant.findFirst({
    where: { layoutId, variationId },
    select: { id: true },
  });
  if (!offered) {
    backTo(back, refusalParams(values, [{ field: "variationId", code: "variationNotOffered" }]));
  }

  const angle = pick(values, "angle").trim();
  const duplicate = await prisma.imageSet.findUnique({
    where: {
      layoutId_vehicleId_variationId_angle: { layoutId, vehicleId, variationId, angle },
    },
  });
  if (duplicate) {
    backTo(back, refusalParams(values, [{ field: "angle", code: "duplicateAngle" }]));
  }

  const created = await prisma.imageSet.create({
    data: {
      layoutId,
      vehicleId,
      variationId,
      angle,
      src: pick(values, "src").trim(),
      alt: pick(values, "alt").trim(),
    },
  });

  await audit({
    entity: "ImageSet",
    entityId: created.id,
    action: "create",
    note: `${angle} photograph for range ${vehicleId}, on option ${variationId}`,
  });

  revalidatePath(back);

  await flashBack(back, "image");
}

/** Withdraw one photograph. Audited as a `delete` carrying the row as it was. */
export async function removeRangeImage(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const layoutId = text(formData, "layoutId");
  const id = text(formData, "imageId");
  const back = `/admin/layouts/${encodeURIComponent(layoutId)}`;

  const existing = await prisma.imageSet.findUnique({ where: { id } });
  if (existing) {
    await prisma.imageSet.delete({ where: { id } });
    await audit({
      entity: "ImageSet",
      entityId: id,
      action: "delete",
      note: `${existing.angle} photograph removed`,
    });
  }

  revalidatePath(back);

  await flashBack(back, "imageRemoved");
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

  await flashBack("/admin/exclusions", "removed");
}

/**
 * Choose which hero layout the HOMEPAGE renders — the switch the owner went looking
 * for and could not find.
 *
 * WHY THIS EXISTED AS A COOKIE, AND WHY THAT WAS WORTHLESS
 *
 * The layout was a `POST /api/hero-layout` cookie. A cookie is per-VISITOR, so a switch
 * in the admin would have changed the layout on the operator's own screen and on
 * nobody else's: the control would have looked like it worked and changed what
 * customers see for no one. `SiteSetting` is the server-side replacement, and this
 * action is the half of it that was missing — `setSetting()` existed and was called
 * from nowhere, so the table stayed empty and `getHeroLayout()` returned `split`
 * forever.
 *
 * THE VALUE IS CHECKED AGAINST `HERO_LAYOUTS` RATHER THAN PERSISTED BLIND
 *
 * `SiteSetting.value` is `Json`. Storing anything unrecognised would read back as the
 * default — `getHeroLayout()` falls back to `split` for a value it does not know — so
 * a typo would look exactly like somebody had deliberately chosen `split`. Refusing it
 * says which word was wrong, which is the only useful thing to say.
 *
 * AN UNCHANGED CHOICE WRITES NOTHING AND RECORDS NO AUDIT ROW
 *
 * The same rule as every other write in this file: an audit row recording a change
 * nobody made is worse than no row, in the one table whose entire value is that it
 * cannot lie.
 *
 * `/` is revalidated because that is where the layout is read for the hero, and the
 * dashboard because this form lives on it. The attribute is written to `<html>` by the
 * ROOT layout on every page, so a stale document anywhere would keep the old layout —
 * but the layout only ever affects the homepage's `.hero-shell`, so `/` is the one
 * path whose output genuinely changes.
 */
export async function setHeroLayout(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const requested = text(formData, "heroLayout");

  if (!(HERO_LAYOUTS as readonly string[]).includes(requested)) {
    // `badHeroLayout` is a real code in `confirm-guard.ts`'s table. Inventing the code
    // inline instead would be silently DROPPED by `readFailures`, and the operator
    // would be redirected back with nothing on screen explaining why.
    const params = new URLSearchParams();
    params.set("e", "heroLayout~badHeroLayout");
    backTo("/admin", params);
  }

  const next = requested as HeroLayout;
  const current = await getSetting("heroLayout");

  if (current !== next) {
    const who = process.env.ADMIN_USER ?? null;
    await prisma.$transaction(async (tx) => {
      // The transaction's client is passed through, so the setting and the row
      // describing the change commit together. `$transaction([...])` cannot do this:
      // its array form takes `PrismaPromise`s, and `setSetting` is `async`. See the
      // header of `setSetting` in `src/lib/settings.ts`.
      await setSetting("heroLayout", next, who, tx);
      await tx.auditEntry.create({
        data: {
          entity: "SiteSetting",
          entityId: "heroLayout",
          action: "update",
          field: "heroLayout",
          before: current,
          after: next,
          note: `the homepage hero now renders as "${next}" for every visitor`,
          who,
        },
      });
    });
  }

  revalidatePath("/admin");
  revalidatePath("/");

  await flashBack("/admin", current === next ? "unchanged" : "heroLayout");
}
