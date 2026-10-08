"use client";

/**
 * THE LAST BOUNDARY — and the reason the raw 500 was showing.
 *
 * `error.tsx` sits INSIDE the root layout, so it can only catch failures in the
 * page segments beneath it. `src/app/layout.tsx` reads the catalogue from
 * Postgres, so when the database is unreachable it is the LAYOUT that throws —
 * above `error.tsx` — and nothing catches it. The Worker then returns a bare 500
 * and Cloudflare renders its own generic page.
 *
 * Next.js only lets `global-error.tsx` wrap the root layout, so this is the file
 * that renders in that case.
 *
 * WHY THE STYLES ARE INLINE, NOT TAILWIND. When this boundary runs, the root
 * layout did not render — and that is where `globals.css` and the font variables
 * are imported. So a Tailwind class here would have no stylesheet behind it and
 * the page would render unstyled. Inline styles are the only ones guaranteed to
 * exist at this point.
 *
 * The message stays generic on purpose: a stack trace or a database error is an
 * information leak. The digest goes to the console so it can be matched to the
 * server log, exactly as `error.tsx` does.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#0b0d10",
          color: "#e8eaed",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.7rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#8b93a1",
            }}
          >
            LuxeRide
          </p>
          <h1 style={{ margin: "0.75rem 0 0", fontSize: "1.5rem", fontWeight: 600 }}>
            This page couldn&apos;t load
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#b6bcc6" }}>
            The problem is on our side. Reload to try again, or message us on WhatsApp and we&apos;ll take
            your order by hand.
          </p>
          {error.digest && (
            <p style={{ marginTop: "0.5rem", fontSize: "0.7rem", fontFamily: "monospace", color: "#8b93a1" }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              padding: "0.75rem 1.5rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              color: "#0b0d10",
              background: "#e8eaed",
              border: "none",
              borderRadius: "0.75rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
