import type { ReactNode } from "react";

/**
 * AN EMPTY STATE, AND THE ONE RULE THAT MAKES IT WORTH HAVING.
 *
 * The skill's rule is that "there is nothing here" and "nothing matches your filters"
 * are different states, and the second must offer to undo the filter. So the copy is
 * always passed in by the call site — this component only owns the shell.
 *
 * It is deliberately not a `<section>` or a card: an empty state is a sentence, not a
 * container, and giving it the same weight as real content is how a screen with nothing
 * on it still looks busy.
 */
export default function EmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`rounded-xl border border-border bg-surface/60 px-5 py-6 text-sm text-fg-muted ${className}`}>
      {children}
    </p>
  );
}
