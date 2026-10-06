export function Chip({
  title,
  hint,
  selected,
  tag,
  onClick,
}: {
  title: string;
  hint?: string;
  selected?: boolean;
  tag?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border px-4 py-4 text-left text-sm font-medium transition ${
        selected
          ? "border-accent bg-surface-2 shadow-[0_0_0_1px_var(--gold)_inset]"
          : "border-fg-muted/25 bg-surface hover:border-accent"
      }`}
    >
      <span className="block">{title}</span>
      {hint && <span className="mt-1 block font-mono text-xs text-accent-dim">{hint}</span>}
      {tag && (
        <span className="mt-2 inline-block rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-accent-dim">
          {tag}
        </span>
      )}
    </button>
  );
}
