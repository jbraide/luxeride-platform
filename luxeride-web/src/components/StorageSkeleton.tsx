"use client";

/**
 * Post-hydration placeholder for the storage-backed screens.
 *
 * Deliberately renders no store-derived content: the whole point is that the
 * server HTML and the first client paint agree. Kept visually close to the
 * loaded layout so the swap does not shift the page.
 */
export default function StorageSkeleton({ title, note }: { title: string; note: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-20 text-center" aria-busy="true">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted">{note}</p>
    </div>
  );
}
