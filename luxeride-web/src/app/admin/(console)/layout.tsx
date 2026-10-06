import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import AdminNotice from "@/components/AdminNotice";
import { readFlash } from "./flash";

/**
 * The admin console shell (`fitment-engine` §8.1).
 *
 * WHY A ROUTE GROUP AND NOT `src/app/admin/layout.tsx`
 *
 * `(console)` contributes nothing to the URL: these pages are `/admin`,
 * `/admin/vehicles`, `/admin/layouts/[id]` and nothing more. The folder exists so
 * the console's shell is organisational — one place that owns the nav, the sign-out
 * note and the noindex policy, rather than five — and so the group can be moved or
 * renamed later without touching a single URL or breaking a link somebody wrote
 * down. The route-groups doc is explicit that the parentheses are not part of the
 * path, and that two groups must not resolve to the same URL: `(console)/page.tsx`
 * therefore REPLACES `src/app/admin/page.tsx` rather than sitting beside it.
 *
 * NO `'use client'` ANYWHERE IN THIS CONSOLE
 *
 * Not an accident and not laziness. There is no `useActionState`, no client-side
 * validation and no optimistic UI, so the server is the only implementation of the
 * evidence gate and there is no second code path that only runs when JavaScript
 * does. It also means every refusal renders as the same HTML whether the browser
 * has script or not, which is what makes the confirm form verifiable at all.
 *
 * THE COST, STATED PLAINLY: no active-link highlighting, because knowing the current
 * route in a Server Component means reading the pathname from the client. The nav
 * is short enough that not knowing which one is current costs very little.
 *
 * WHY THE SIGN-OUT IS A BUTTON NOW
 *
 * It used to be a paragraph explaining that there was no logout route, because
 * there was no session — only HTTP Basic Auth, which the browser holds until it
 * closes. There is a session now (`src/lib/admin-session.ts`), so there is
 * something to end, so there is a form that posts to `/admin/logout`. Still no
 * client component: it is a plain `<form method="post">`, because the console has
 * no `'use client'` anywhere and a logout button is not worth breaking that for.
 */
export const metadata: Metadata = {
  title: "Admin",
  // Stated on the layout rather than per page so a screen added tomorrow is
  // unindexed by default. §7.7: the console must disclose nothing to a crawler.
  robots: { index: false, follow: false },
};

/**
 * The nav. Four groups, because they are four different jobs.
 *
 * ORDERS is money that came IN: what was bought, by whom, and in what state. FITMENT
 * is what the owner checks: which cars are covered, and what each one is priced at per
 * year range. CATALOGUE is what the shop sells: the categories, the products, and their
 * variations. PRICE is what a customer pays less than the confirmed figure, and when —
 * its own group because it is the only other screen that moves money. Grouping (§8.4) is deliberately NOT here yet: the
 * screen cannot be built honestly until §9.3's conflict rule is settled, because
 * every one of the 212 seeded layouts is `inferred` and §9.3 as written treats
 * `inferred` as conflicting — which would refuse every possible selection. A link
 * to a screen that refuses everything is worse than no link. See
 * `fitment-engine/tasks.md` §9.3.
 */
const NAV: { href: string; label: string; group: "Orders" | "Fitment" | "Catalogue" | "Price" }[] = [
  // Orders first: it is the one screen that is about money coming IN, and the one
  // the owner went looking for and could not find before it existed.
  { href: "/admin/orders", label: "Orders", group: "Orders" },
  { href: "/admin", label: "Dashboard", group: "Fitment" },
  { href: "/admin/vehicles", label: "Vehicles", group: "Fitment" },
  { href: "/admin/layouts", label: "Layouts", group: "Fitment" },
  { href: "/admin/exclusions", label: "Exclusions", group: "Fitment" },
  { href: "/admin/demand", label: "Demand", group: "Fitment" },
  { href: "/admin/audit", label: "Audit", group: "Fitment" },
  { href: "/admin/categories", label: "Categories", group: "Catalogue" },
  { href: "/admin/products", label: "Products", group: "Catalogue" },
  // Price, not catalogue: what a customer pays less than the confirmed figure, and
  // when. Its own group because it is the only screen here that moves money.
  { href: "/admin/promotions", label: "Promotions", group: "Price" },
  { href: "/admin/coupons", label: "Coupons", group: "Price" },
];

const GROUPS = ["Orders", "Fitment", "Catalogue", "Price"] as const;

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  // One number in the nav, because it is the one that decides whether the console
  // is doing its job: a refused car nobody has checked yet is still a refusal.
  //
  // The pathname is read so the Dismiss link can return to THIS screen rather than
  // the dashboard. It comes from the header Next already sends, so it costs nothing
  // and needs no client component.
  const [confirmed, key, pathname] = await Promise.all([
    prisma.layout.count({ where: { status: "confirmed" } }),
    readFlash(),
    headers().then((h) => h.get("x-invoke-path") ?? h.get("next-url") ?? "/admin"),
  ]);

  /**
   * WHICH LINK IS "HERE", so the sidebar can mark it.
   *
   * Longest matching prefix, so `/admin/layouts/abc` highlights **Layouts** rather than
   * the dashboard: `/admin` is a prefix of every route, and a naive `startsWith` would
   * mark all eleven links at once on any nested screen.
   *
   * `x-invoke-path` is the header Next sets on a Server Action POST; `next-url` is set
   * on an ordinary render. Both are supplied by the framework, so this costs no client
   * component and no extra round trip.
   */
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/admin";
  const currentPath = NAV.map((item) => item.href)
    .filter((href) => path === href || path.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="lg:flex lg:h-dvh lg:w-full lg:overflow-hidden">
      {/*
        THE SIDEBAR, and why it is a column and not a row of links.

        The nav was a wrapped horizontal row of eleven links in three labelled groups.
        With eleven items it became two ragged lines whose only structure was a `/`
        between groups — you had to read it to know which screen you were on and where
        anything else was. A tool with this many screens wants its navigation in one
        place, stacked, where the groups are headings rather than separators.

        NO ACTIVE-LINK HIGHLIGHTING, and that is a real cost stated rather than hidden:
        a Server Component cannot read the pathname without a client component, and the
        console has none. Everything here still works with scripting disabled — which is
        why the sidebar below `lg` is a `<details>` disclosure and not a hamburger
        button. See the header of this file for why the console has no `'use client'`.

        THE LAYOUT IS A GRID, NOT A FIXED SIDEBAR. `sticky top-0` on the column means
        the nav stays put while a long list scrolls past it, and `self-start` is what
        stops the column stretching to the height of the content it sits beside.
      */}
      <aside className="lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-hidden lg:border-r lg:border-border">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-6 lg:shrink-0 lg:block">
          <div className="lg:pb-5">
            <h1 className="font-display text-xl font-semibold">
              LuxeRide <span className="text-accent">admin</span>
            </h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-accent-dim">
              {confirmed} confirmed — one operator
            </p>
          </div>
          {/* A real form, not a link: signing out must not be reachable by a GET,
              or a prefetching browser could end the session by rendering a link. */}
          <form method="post" action="/admin/logout">
            <button
              type="submit"
              className="font-mono text-[11px] uppercase tracking-widest text-fg-muted underline-offset-4 hover:text-accent hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>

        {/* Below `lg` the sidebar becomes a disclosure. `<details>`, so it opens and
            closes with no JavaScript — the same reason the year ranges and the seat-row
            buttons are `<details>` and `<form>`. */}
        <details className="mt-4 px-5 lg:hidden" open>
          <summary className="cursor-pointer list-none rounded-lg border border-border px-3 py-2 text-sm text-fg/85 marker:content-none">
            Menu
          </summary>
          <nav className="mt-3">
            {GROUPS.map((group) => (
              <div key={group} className="mb-4 last:mb-0">
                <p className="px-3 font-mono text-[10px] uppercase tracking-widest text-accent-dim">
                  {group}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {NAV.filter((item) => item.group === group).map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-accent"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </details>

        {/*
          THE NAV SCROLLS IN ITS OWN COLUMN, and the content beside it scrolls in
          another. `lg:overflow-y-auto` on a `lg:flex-1` child of a `lg:h-dvh` parent is
          what makes them independent: the document itself no longer scrolls, so each
          pane owns its own scrollbar.

          This was WRONG before and `position: sticky` was the wrong fix for it — sticky
          pins an element inside a scrolling document, which still means one scrollbar
          and one shared scroll position. The owner asked for them not to be tied
          together, and that needs two scroll CONTAINERS, not a pinned column.

          Below `lg` none of these apply and the console is an ordinary page that
          scrolls as one: two side-by-side panes on a phone would be unusable, and the
          `<details>` disclosure above is the mobile navigation.

          THE NAV IS `block`, NOT `flex`, AND THAT IS THE WHOLE FIX FOR THE HORIZONTAL
          SCROLL THE OWNER REPORTED. This className used to carry `lg:flex` beside
          `lg:block`. They are the same property at the same specificity, so the one
          Tailwind emits LAST wins — measured in the built stylesheet, the `.lg\:block`
          rule sits 46 bytes *before* `.lg\:flex`, so `display:flex` took it. A row flex
          container lays the four group blocks out side by side, and `overflow-y-auto`
          forces `overflow-x:visible` to compute to `auto` (CSS Overflow §3), which is
          what put a horizontal scrollbar under the sidebar. ONE DISPLAY VALUE PER
          BREAKPOINT: `lg:block` here, `lg:flex` only where a flex container is actually
          wanted — and `lg:flex-1` / `lg:min-h-0` are still correct, because they are
          flex-ITEM properties applied by the `lg:flex lg:flex-col` aside above.
        */}
        <nav className="mt-6 hidden lg:block lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-5 lg:pb-8">
          {GROUPS.map((group) => (
            <div key={group} className="mb-5 last:mb-0">
              <p className="px-3 font-mono text-[10px] uppercase tracking-widest text-accent-dim">
                {group}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {NAV.filter((item) => item.group === group).map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={item.href === currentPath ? "page" : undefined}
                      className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                        item.href === currentPath
                          ? "bg-accent/10 font-medium text-accent"
                          : "text-fg-muted hover:bg-surface-2 hover:text-accent"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 lg:flex-1 lg:overflow-y-auto">
        <div className="px-5 py-6 lg:px-8">
        {/*
          ONE NOTICE, FOR THE WHOLE CONSOLE.

          There used to be a banner on each of seven screens, each mapping its own
          slugs to its own sentences. That is how seven screens end up saying seven
          different things for one action, and it is why no screen had a consistent
          notification. This reads the flash cookie in the SHELL, so every action on
          every screen reports the same way.

          Server-rendered and dismissible by LINK, because the console has no
          JavaScript: the dismiss goes to `/admin/flash/clear`, which deletes the
          cookie and comes back.
        */}
          {/* The ONE notice for the whole console: resolved and rendered by the
              server, timed out by the client. `AdminNotice` explains why it is the
              console's only Client Component, and why every form still works without JS. */}
          <AdminNotice flashKey={key} currentPath={pathname} />

          {children}
        </div>
      </div>
    </div>
  );
}