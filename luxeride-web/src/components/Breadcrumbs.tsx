import Link from "next/link";

export interface Crumb {
  name: string;
  path: string;
}

/**
 * The visible breadcrumb trail.
 *
 * The trail and the `BreadcrumbList` JSON-LD are built from this ONE array, so
 * they cannot drift: a `BreadcrumbList` that does not match what a visitor can
 * see is a structured-data policy violation, and it is exactly the kind of thing
 * that happens when the two are written separately.
 *
 * The last crumb is the current page, so it is rendered as text rather than a
 * link — linking a page to itself is noise for a screen reader.
 */
export default function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;

          return (
            <li key={crumb.path} className="flex items-center gap-2">
              {isLast ? (
                <span aria-current="page" className="text-accent">
                  {crumb.name}
                </span>
              ) : (
                <>
                  <Link href={crumb.path} className="hover:text-accent">
                    {crumb.name}
                  </Link>
                  <span aria-hidden className="text-accent-dim">
                    /
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}