import type { ReactNode } from "react";

/**
 * A STATUS CHIP. Tone, never colour alone — the label inside carries the meaning, which
 * is what keeps this legible to a colour-blind operator and to a screen reader.
 *
 * `warn` and `danger` are the same hue at two intensities: `warn` is "this is a to-do",
 * `danger` is "this is destructive". `good` and `accent` are both the brand gold,
 * because on this site the brand colour IS the affirmative one — a green would be a
 * second palette nobody asked for.
 */
const TONES = {
  neutral: "border-border text-fg-muted",
  accent: "border-accent/50 text-accent",
  good: "border-accent/50 text-accent",
  warn: "border-danger/40 text-danger",
  danger: "border-danger/60 text-danger",
} as const;

export type StatusTone = keyof typeof TONES;

export default function StatusChip({
  tone = "neutral",
  title,
  children,
}: {
  tone?: StatusTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
