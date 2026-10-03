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

  const [all, confirmed, layouts] = await Promise.all([
    prisma.layout.count(),
    prisma.layout.count({ where: { status: "confirmed" } }),
    prisma.layout.findMany({
      where,
      include: {
        make: { select: { name: true } },
        _count: { select: { mappings: true, variants: true } },
      },
      orderBy: [{ make: { name: "asc" } }, { customerName: "asc" }],
    }),
  ]);

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
        <span className="font-mono text-[11px] uppercase tracking-widest text-gold-dim">
          {layouts.length} shown of {all} · {confirmed} confirmed
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        {["", "inferred", "confirmed", "draft", "retired"].map((value) => (
          <Link
            key={value || "all"}
            href={statusHref(value)}
            aria-current={value === status ? "page" : undefined}
            className={`font-mono text-xs uppercase tracking-widest ${
              value === status ? "text-gold" : "text-muted hover:text-gold"
            }`}
          >
            {value || "all"}
          </Link>
        ))}
      </div>

      <form method="get" action="/admin/layouts" className="mt-4 flex max-w-md gap-2">
        {status !== "" && <input type="hidden" name="s" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={rawQuery}
          placeholder="Search code, name or make"
          aria-label="Search code, name or make"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white placeholder:text-muted focus:border-gold focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-line px-4 py-2 text-sm text-white hover:border-gold"
        >
          Search
        </button>
      </form>

      {layouts.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-panel/60 px-5 py-6 text-sm text-muted">
          Nothing matches this filter.
        </p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-widest text-gold-dim">
              <th className="py-2 pr-4 font-normal">Code</th>
              <th className="py-2 pr-4 font-normal">Customer name</th>
              <th className="py-2 pr-4 font-normal">Status</th>
              <th className="py-2 font-normal">Mapped</th>
            </tr>
          </thead>
          <tbody>
            {layouts.map((layout) => (
              <tr key={layout.id} className="border-t border-line align-top">
                <td className="py-2 pr-4 font-mono text-xs">
                  <Link
                    href={`/admin/layouts/${encodeURIComponent(layout.id)}`}
                    className="text-gold underline-offset-4 hover:underline"
                  >
                    {layout.internalCode}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  {layout.customerName}
                  <span className="block text-[11px] text-muted">{layout.make.name}</span>
                </td>
                <td className="py-2 pr-4 font-mono text-[11px] uppercase text-muted">
                  {layout.status}
                </td>
                <td className="py-2 font-mono text-[11px] text-gold-dim">
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