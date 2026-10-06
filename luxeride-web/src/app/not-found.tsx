import NotFoundActions from "@/components/NotFoundActions";
import { LinkButton } from "@/components/Button";

/**
 * The 404 boundary. A Server Component: it takes no props and does no thinking,
 * so there is no reason to ship it to the browser.
 *
 * Next.js injects `noindex` on a 404 response, so no hand-written robots
 * directive is needed here.
 *
 * Below 640 px this page is one of the few places a lost visitor can reach, so
 * the three forward routes are the ones that actually sell something, and the
 * WhatsApp escape sits alongside them rather than behind a menu.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-5 py-20 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-accent-dim">Error 404</p>
      <h1 className="font-display mt-3 text-2xl font-semibold">That page isn&apos;t here</h1>
      <p className="mt-2 text-sm text-fg-muted">
        The link may be old, or the address may have a typo. Nothing is broken on your side.
      </p>

      <div className="mt-8 space-y-3">
        <LinkButton href="/fit-finder">Find the fit for my car</LinkButton>
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton href="/shop" variant="outline" className="flex-1">
            Browse all products
          </LinkButton>
          <LinkButton href="/cart" variant="outline" className="flex-1">
            View my cart
          </LinkButton>
        </div>
        <NotFoundActions />
      </div>
    </div>
  );
}
