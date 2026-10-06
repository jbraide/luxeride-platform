"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { isOrderStatus } from "@/lib/order-status";
import { MAX_NOTE_LENGTH } from "./confirm-guard";
import { flashBack } from "./flash";

/**
 * The one mutation `/admin/orders` can perform: change an order's status.
 *
 * ── WHY IT IS ITS OWN FILE, NOT `actions.ts` ─────────────────────────────────
 *
 * `actions.ts` is the FITMENT console — confirming layouts, adding ranges, the hero
 * layout switch, and every write is about a floor pan or the shop. An order is a
 * different kind of fact: nothing here decides what a car costs or whether it fits,
 * so mixing it into that file would make the evidence gate harder to find in a file
 * about orders. The refusal vocabulary is shared (`confirm-guard.ts`) for the reason
 * that file states: one table, so a sentence cannot be worded one way here and
 * another way there.
 *
 * ── THE SAME DISCIPLINE AS EVERY OTHER ACTION ────────────────────────────────
 *
 * `requireAdmin()` is the first statement, because a Server Action is a POST
 * endpoint reachable by anyone who can send the same POST. The status is checked
 * against `ORDER_STATUSES` rather than stored blind: `Order.status` has no
 * constraint, so a typo would become a fifth status that every future report drops.
 * An UNCHANGED status writes nothing and records nothing — an audit row describing
 * a change nobody made is worse than no row, in the one table whose value is that
 * it cannot lie.
 */

const ACTION_REQUEST_URL = "https://admin.invalid/";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Send the operator back to the order with the refusal in the query string.
 *
 * `never` because `redirect()` throws. `v.status` echoes what was submitted so the
 * radio comes back on the choice that was refused rather than resetting — the same
 * round trip every other console form uses.
 */
function backTo(path: string, params: URLSearchParams): never {
  const query = params.toString();
  redirect(query === "" ? path : `${path}?${query}`);
}

export async function setOrderStatus(formData: FormData): Promise<void> {
  requireAdmin(new Request(ACTION_REQUEST_URL, { headers: await headers() }));

  const orderId = text(formData, "orderId");
  const requested = text(formData, "status");
  const note = text(formData, "note").trim();
  const back = `/admin/orders/${encodeURIComponent(orderId)}`;

  if (!isOrderStatus(requested)) {
    const params = new URLSearchParams();
    params.set("e", `status~badOrderStatus`);
    params.set("v.status", requested);
    backTo(back, params);
  }

  if (note.length > MAX_NOTE_LENGTH) {
    const params = new URLSearchParams();
    params.set("e", "note~noteTooLong");
    params.set("v.status", requested);
    backTo(back, params);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) {
    const params = new URLSearchParams();
    params.set("e", "status~orderNotFound");
    backTo("/admin/orders", params);
  }

  if (order.status !== requested) {
    const who = process.env.ADMIN_USER ?? null;
    await prisma.$transaction([
      prisma.order.update({ where: { id: orderId }, data: { status: requested } }),
      prisma.auditEntry.create({
        data: {
          entity: "Order",
          entityId: orderId,
          action: "update",
          field: "status",
          before: order.status,
          after: requested,
          // The operator's own words, stored verbatim or left null. A status change
          // that says why is legible a week later; one that does not is a word.
          note: note === "" ? null : note,
          who,
        },
      }),
    ]);
  }

  revalidatePath(back);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");

  await flashBack(back, order.status === requested ? "unchanged" : `order-${requested}`);
}
