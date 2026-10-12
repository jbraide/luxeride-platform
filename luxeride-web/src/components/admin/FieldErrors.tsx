/**
 * THE "NOT SAVED" BLOCK, ONCE.
 *
 * Every mutating screen rendered this same panel by hand: a bordered box, a count, and
 * one line per refused field. They had drifted — the border colour, the padding and
 * whether the list was nested all varied — and none of them announced themselves, so a
 * screen reader got no signal that a save had just been refused.
 *
 * `role="alert"` is the fix for that last part: a refusal is the one message on an admin
 * page that has to interrupt, and it is the reason this is a component rather than a
 * class string like the rest of `ui.ts`.
 *
 * `message` is the guard's own `messageFor(code)`, passed in rather than imported,
 * because each screen's failures are decoded by the guard that produced them.
 */
export default function FieldErrors({
  failures,
  message,
}: {
  failures: ReadonlyMap<string, string>;
  message: (code: string) => string;
}) {
  if (failures.size === 0) return null;

  return (
    <div role="alert" className="mt-4 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm">
      <p className="font-medium text-danger">
        Not saved. {failures.size} field{failures.size === 1 ? "" : "s"} refused:
      </p>
      <ul className="mt-2 space-y-1 text-xs text-fg-muted">
        {[...failures].map(([field, code]) => (
          <li key={field}>
            <span className="font-mono text-fg/80">{field}</span> — {message(code)}
          </li>
        ))}
      </ul>
    </div>
  );
}
