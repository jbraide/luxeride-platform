"use client";

import { usePathname } from "next/navigation";

/**
 * Renders the STOREFRONT chrome only where it belongs, and nothing at all under
 * `/admin`.
 *
 * THE PROBLEM IT SOLVES
 *
 * `/admin` is a back-office tool. It was rendering the customer header, the cart
 * badge with its live item count, the mobile shop menu and the whole footer — a
 * cart badge inside a tool where nobody shops, and a "Fit Finder" link that walks an
 * operator out of the console into the public site. The owner put it as: *"admin nav
 * and public nav should be different."*
 *
 * WHY A CLIENT COMPONENT AND NOT A ROUTE GROUP
 *
 * The architecturally tidier answer is two root layouts — `app/(storefront)/layout.tsx`
 * and `app/admin/layout.tsx` — which Next supports by having no `app/layout.tsx` at
 * all. It was not worth doing here: every page, `not-found.tsx`, `error.tsx`, the root
 * Open Graph image, `robots.ts` and `sitemap.ts` would all have to move, and a global
 * `not-found.tsx` with no `app/layout.tsx` above it is a build error. That is a large
 * mechanical diff for a rendering decision, and a large mechanical diff is exactly
 * where an unreviewed mistake hides.
 *
 * This is twenty lines, it cannot break routing, and it produces the identical
 * result. If the two shells ever genuinely need different `<html>` attributes —
 * a different font, a different `<body>` class, a different lang — then the route
 * group becomes the right answer and this file is deleted.
 *
 * WHY IT IS SAFE TO GATE ON THE PATHNAME
 *
 * `usePathname()` is available during SSR in the App Router, so this does not cause a
 * flash of the wrong chrome: the server already knows the route and renders the
 * admin without the header in the initial HTML. A gate that only worked after
 * hydration would show every operator the customer header for one frame on every
 * page load, which would be worse than the problem.
 *
 * CHILDREN ARE SERVER-RENDERED AND STAY THAT WAY. `<Header>` and `<Footer>` are
 * passed in as `children` rather than imported here, so `<Footer>` — which reads the
 * catalogue from Postgres — keeps running on the server. A client component importing
 * them would drag a database read into the browser.
 */
export default function PublicChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // `/admin/login` and `/admin/session` are included: the sign-in page is part of
  // the console, and a login screen with a shop cart badge above it is nonsense.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return <>{children}</>;
}