/**
 * The console's navigation fallback.
 *
 * A Server Action or a `<Link>` that reshapes the URL is a round trip to Postgres, and
 * without this the content column simply froze on the old screen until the new one was
 * ready. That is the same "did my click do anything?" problem the submit buttons have, on
 * the controls that are NOT buttons — the nav links, the filter chips and the search forms.
 *
 * It replaces ONLY the page inside the console shell: the sidebar stays put, because the
 * shell is the layout and this sits one level below it. So the operator keeps their
 * bearings while the screen they asked for arrives.
 *
 * A Server Component, no `'use client'` — it is static markup and costs nothing.
 */
export default function ConsoleLoading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[30vh] items-center justify-center">
      <span className="flex items-center gap-3 text-sm text-fg-muted">
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 animate-spin text-accent">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
          <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Loading…
      </span>
    </div>
  );
}
