import Link from "next/link";

import { prisma } from "@/lib/db";

/**
 * `/admin/layouts` — every floor pan on file (`fitment-engine` §8.5).
 *
 * The index exists because `layouts/[id]` needs a stable way in: a UUID is not
 * something an operator can find, and §8.3's vehicle rows can only link to a
 * detail page for a layout they already have a mapping to. So this is the screen
 * that makes the 212 preloaded rows reachable by hand as well.
 *
 * `internalCode` is deliberately NOT the unique key in this database —
 * `prisma/schema.prisma` explains why (the catalogue derives codes from model
 * names and measures 13 collisions across 212 rows), and `scripts/fitment-report`
 * lists them. So this page links by `id` and shows the code as the WhatsApp
 * reference a customer would quote, which is what it is.
 */
export default async function LayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const rawStatus = typeof params.s === "string" ? params.s : "";
  const status = ["confirmed", "inferred", "draft", "retired"].includes(rawStatus) ? rawStatus : "";
  const rawQuery = typeof params.q === "string" ? params.q.trim() : "";
  const query = rawQuery === "" ? {} : { contains: rawQuery, mode: "insensitive" as const };

  const where =
    status !== ""
      ? { status }
      : rawQuery === ""
        ? {}
        : { OR: [{ customerName: query }, { internalCode: query }, { make: { name: query } }] };

  const [statusCounts, all, layouts] = await Promise.all([
    prisma.layout.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.layout.count(),
    prisma.layout.findMany({
      where,
      include: {
        make: { select: { name: true } },
        _count: { select: { mappings: true, variants: true } },
      },
      orderBy: [{ make: { name: "asc" } }, { customerName: "asc" }],
    }),
  ]);

  /**
   * The count behind each filter chip, so the bar carries the size of the queue
   * rather than making the operator click into a filter to find out it is empty —
   * the same thing `/admin/vehicles` does. `""` is the unfiltered total.
   */
  const countFor = (value: string): number =>
    value === "" ? all : (statusCounts.find((row) => row.status === value)?._count._all ?? 0);
  const confirmed = countFor("confirmed");

  const statusHref = (next: string): string => {
    const nextParams = new URLSearchParams();
    if (next !== "") nextParams.set("s", next);
    if (rawQuery !== "") nextParams.set("q", rawQuery);
    const search = nextParams.toString();
    return search === "" ? "/admin/layouts" : `/admin/layouts?${search}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Layouts</h2>
        <span className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
          {layouts.length} shown of {all} · {confirmed} confirmed
        </span>
      </div>

      <nav aria-label="Filter layouts" className="mt-4 flex flex-wrap items-center gap-2">
        {["", "inferred", "confirmed", "draft", "retired"].map((value) => {
          const active = value === status;
          return (
            <Link
              key={value || "all"}
              href={statusHref(value)}
              aria-current={active ? "page" : undefined}
              className={`flex items-baseline gap-2 rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                active
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-fg-muted hover:border-accent/50 hover:text-accent"
              }`}
            >
              {value || "all"}
              <span className={active ? "text-accent" : "text-accent-dim"}>{countFor(value)}</span>
            </Link>
          );
        })}
      </nav>

      <form method="get" action="/admin/layouts" className="mt-4 flex max-w-md gap-2">
        {status !== "" && <input type="hidden" name="s" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={rawQuery}
          placeholder="Search code, name or make"
          aria-label="Search code, name or make"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:border-accent"
        >
          Search
        </button>
      </form>

      {layouts.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-surface/60 px-5 py-6 text-sm text-fg-muted">
          Nothing matches this filter.
        </p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[11px] uppercase tracking-widest text-accent-dim">
              <th className="py-2 pr-4 font-normal">Code</th>
              <th className="py-2 pr-4 font-normal">Customer name</th>
              <th className="py-2 pr-4 font-normal">Status</th>
              <th className="py-2 font-normal">Mapped</th>
            </tr>
          </thead>
          <tbody>
            {layouts.map((layout) => (
              <tr key={layout.id} className="border-t border-border align-top">
                <td className="py-2 pr-4 font-mono text-xs">
                  <Link
                    href={`/admin/layouts/${encodeURIComponent(layout.id)}`}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {layout.internalCode}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  {layout.customerName}
                  <span className="block text-[11px] text-fg-muted">{layout.make.name}</span>
                </td>
                <td className="py-2 pr-4 font-mono text-[11px] uppercase text-fg-muted">
                  {layout.status}
                </td>
                <td className="py-2 font-mono text-[11px] text-accent-dim">
                  {layout._count.mappings} vehicle{layout._count.mappings === 1 ? "" : "s"} ·{" "}
                  {layout._count.variants} variants
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}