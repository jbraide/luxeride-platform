"use client";

import { useEffect } from "react";
import Link from "next/link";
import NotFoundActions from "@/components/NotFoundActions";

/**
 * The error boundary for every segment beneath the root layout.
 *
 * `{ error, retry }`, not `{ error, reset }` — Next 16 renamed the recovery
 * callback (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`).
 *
 * The message shown is deliberately generic: a stack trace or a database error
 * string is an information leak, not a help. The digest goes to the console so
 * the owner can match it against the server log.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Unhandled error at the route boundary:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-5 py-20 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-accent-dim">Something went wrong</p>
      <h1 className="font-display mt-3 text-2xl font-semibold">This page didn&apos;t load</h1>
      <p className="mt-2 text-sm text-fg-muted">
        The problem is on our side. Your cart is saved in this browser, so nothing you picked is lost.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-fg-muted">Reference: {error.digest}</p>}

      <div className="mt-8 space-y-3">
        <button
          onClick={() => retry()}
          className="w-full rounded-xl bg-accent px-5 py-3 text-center text-sm font-semibold text-on-accent"
        >
          Try again
        </button>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/cart"
            className="flex-1 rounded-xl border border-fg-muted/40 px-5 py-3 text-center text-sm font-semibold hover:border-accent"
          >
            View my cart
          </Link>
          <Link
            href="/"
            className="flex-1 rounded-xl border border-fg-muted/40 px-5 py-3 text-center text-sm font-semibold hover:border-accent"
          >
            Back to home
          </Link>
        </div>
        <NotFoundActions kind="error" />
      </div>
    </div>
  );
}
