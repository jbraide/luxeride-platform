"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` during server rendering and on the very first client paint, `true`
 * afterwards.
 *
 * Needed because `zustand/persist` hydrates **synchronously** on the client
 * (`createJSONStorage(() => window.localStorage)` runs at store creation) while
 * the server has no `window` and therefore an empty store. Any component that
 * renders store contents during the first paint produces different HTML on the
 * server and on the client — defect D1, which used to make `/cart` say "Your
 * cart is empty" while the client's first render already had items.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: it is the
 * hydration-safe way to say "the server snapshot differs from the client one",
 * and it does not schedule an extra render pass.
 *
 * Callers must render something inert while this returns `false`. Never render
 * the store's contents and hide them afterwards — the mismatch is the bug.
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}

export default useHasMounted;
