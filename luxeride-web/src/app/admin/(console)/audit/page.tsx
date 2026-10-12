import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import PageHeader from "@/components/admin/PageHeader";
import EmptyState from "@/components/admin/EmptyState";
import StatusChip, { type StatusTone } from "@/components/admin/StatusChip";
import { TABLE, TABLE_HEAD, TABLE_HEAD_CELL, TABLE_ROW, chip } from "@/components/admin/ui";

/**
 * `/admin/audit` — the append-only record of who changed what (`fitment-engine`
 * §8.8, §10.1–10.3).
 *
 * A Server Component and a read-only one. There is no edit control, no delete
 * control and no "undo" on this page, which is §10.3's requirement stated as an
 * absence rather than a promise: `AuditEntry` has no `updatedAt` and nothing in
 * `actions.ts` updates or deletes a row, because a mutable audit log is not an
 * audit log. The one thing this screen must never grow is a tidy-up button.
 *
 * WHY IT IS THE SCREEN THAT MAKES ONE OPERATOR SAFE
 *
 * Locked decision 1 gives exactly one person the keys, so there is no second
 * person to notice a mistake — the log is the only second opinion available. §9.7
 * makes `confirmationNote` and `confirmedOn` mandatory on a confirmation for the
 * same reason: a week later, "did I check this, and what did I check it against"
 * has to be answerable without reconstructing anything. The note is rendered here
 * verbatim, in full, and not truncated — `confirmationNote` is capped at
 * `MAX_NOTE_LENGTH` precisely so it can be shown whole.
 *
 * WHY BEFORE AND AFTER ARE SHOWN AS TWO COLUMNS AND NOT A DIFF
 *
 * `fitment-engine` §6.3 asks for the pair per field so that "a fat-fingered status
 * change is legible a week later". A highlighted diff is a rendering opinion about
 * which side is right; two plain values are the record. Where a field moved, both
 * are shown, and where only one side exists the missing one is a real `—` rather
 * than an empty cell that could be read as zero or as blank.
 */

/**
 * Fixed to the owner's timezone rather than the server's.
 *
 * WHY THIS IS NOT `toLocaleString()` WITH NO ARGUMENT: that formats in whatever
 * timezone the host happens to have, so the same row would read differently after
 * a deploy to a UTC box — and an audit log whose timestamps shift is one nobody
 * can line up against a WhatsApp message. Lagos is not a guess: the prices are in
 * naira, the delivery zones are Nigerian and `NEXT_PUBLIC_SITE_URL` is a `.com.ng`
 * domain. A business that moves should change this one constant, deliberately.
 */
const TIMESTAMP = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * A stored value as text. `before`/`after` are `Json?`, so a value is a string, a
 * number, a boolean, an array or an object — the year-span change above writes
 * `{ "yearFrom": null, "yearTo": null }`, which is why this is not a `<td>{value}`
 * and cannot be.
 *
 * `null` renders as an em dash and NOT as the string "null": a null here is a
 * meaningful value — "there was no evidence before this change" — and printing
 * the word `null` next to a real value invites it to be read as one.
 */
function asText(value: Prisma.JsonValue | null): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Compact rather than pretty-printed: these sit in a table cell, and a
  // multi-line object would make one row three times the height of its neighbours.
  return JSON.stringify(value);
}

/** `confirm` is the action that matters, so it is the only one that gets the gold. */
function actionTone(action: string): StatusTone {
  if (action === "confirm") return "good";
  if (action === "delete" || action === "retire") return "danger";
  return "neutral";
}

function entityHref(entity: string): string {
  return `/admin/audit?entity=${encodeURIComponent(entity)}`;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawEntity = typeof params.entity === "string" ? params.entity : "";

  /**
   * The filter set is DERIVED from the table rather than hard-coded.
   *
   * A literal list of entities would be a second place that has to know which
   * models the console writes to, and it would silently stop offering a filter the
   * day a new action logs something. Deriving it cannot drift — and it also means
   * an entity appears here only once something has actually been logged against
   * it, so the filter bar is a summary of what has happened rather than a list of
   * what could.
   */
  const byEntity = await prisma.auditEntry.groupBy({
    by: ["entity"],
    _count: { _all: true },
    orderBy: { entity: "asc" },
  });

  // Whitelisted against what the database actually holds, so an arbitrary
  // `?entity=` cannot be echoed back into the page.
  const filter = byEntity.some((row) => row.entity === rawEntity) ? rawEntity : "";
  const where = filter === "" ? {} : { entity: filter };

  const [total, entries] = await Promise.all([
    prisma.auditEntry.count(),
    prisma.auditEntry.findMany({
      where,
      // Newest first: the last thing that happened is the thing being checked.
      // `id` breaks a same-millisecond tie so the order is stable between loads
      // rather than merely sorted.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        meta={
          <>
            Every decision the console records, newest first. Rows are appended and never rewritten, so
            nothing here can be tidied up — including by you. There is no edit and no delete control on
            this page, and none in <code className="font-mono text-accent-dim">actions.ts</code> either.{" "}
            {entries.length} shown of {total}.
          </>
        }
      />

      <nav aria-label="Filter audit entries" className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/admin/audit" aria-current={filter === "" ? "page" : undefined} className={chip(filter === "")}>
          All <span className={filter === "" ? "text-accent" : "text-accent-dim"}>{total}</span>
        </Link>
        {byEntity.map((row) => (
          <Link
            key={row.entity}
            href={entityHref(row.entity)}
            aria-current={filter === row.entity ? "page" : undefined}
            className={chip(filter === row.entity)}
          >
            {row.entity}{" "}
            <span className={filter === row.entity ? "text-accent" : "text-accent-dim"}>{row._count._all}</span>
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <EmptyState className="mt-6">
          {total === 0 ? (
            "Nothing has been changed yet, and that is the correct reading of an empty log rather than a broken page — 212 layouts and 212 mappings are loaded as inferred rows and none has been confirmed, so no decision has been taken that would need recording."
          ) : (
            <>
              {`Nothing has been logged against ${filter}.`}{" "}
              <Link href="/admin/audit" className="text-accent underline-offset-4 hover:underline">
                Clear the filter
              </Link>{" "}
              to see the others.
            </>
          )}
        </EmptyState>
      ) : (
        <table className={`mt-6 ${TABLE}`}>
          <thead>
            <tr className={TABLE_HEAD}>
              <th className={TABLE_HEAD_CELL}>When</th>
              <th className={TABLE_HEAD_CELL}>What</th>
              <th className={TABLE_HEAD_CELL}>Field</th>
              <th className={TABLE_HEAD_CELL}>Before</th>
              <th className={TABLE_HEAD_CELL}>After</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className={TABLE_ROW}>
                <td className="whitespace-nowrap py-2 pr-4 font-mono text-[11px] text-accent-dim">
                  {TIMESTAMP.format(entry.createdAt)}
                </td>
                <td className="py-2 pr-4">
                  <StatusChip tone={actionTone(entry.action)}>{entry.action}</StatusChip>
                  <span className="block text-xs text-fg/80">{entry.entity}</span>
                  {entry.who !== null && (
                    <span className="block font-mono text-[11px] text-accent-dim">{entry.who}</span>
                  )}
                </td>
                <td className="py-2 pr-4 font-mono text-[11px] text-fg-muted">{entry.field ?? "—"}</td>
                <td className="py-2 pr-4 text-xs text-fg-muted break-all">{asText(entry.before)}</td>
                <td className="py-2 text-xs text-fg/80 break-all">
                  {asText(entry.after)}
                  {/*
                    The note carries the owner's own words verbatim — §10.2 requires
                    `confirmationNote` beside `confirmedOn` on a confirmed transition,
                    and `confirmLayout` writes it into the status row's note for
                    exactly that reason. Rendered in full and not clamped: this is the
                    sentence the whole log exists to preserve.
                  */}
                  {entry.note !== null && entry.note !== "" && (
                    <span className="mt-1 block text-[11px] leading-relaxed text-accent-dim">
                      {entry.note}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-6 text-xs leading-relaxed text-fg-muted">
        Capped at the most recent 200 rows, and the filter above narrows within that
        cap rather than past it. That is a display limit and not a retention one —
        nothing prunes this table, and the oldest entry is still the oldest entry.
      </p>
    </div>
  );
}
