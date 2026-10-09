/**
 * The funnel section model — `funnel-pages` §Components and Interfaces.
 *
 * A CLOSED SET, expressed as a discriminated union. A funnel page's copy lives in a
 * typed data module, and a data module can only express the section kinds declared
 * here. That is what makes "no free-form HTML" structural rather than a rule someone
 * has to remember (Requirement 2.1): there is no prop anywhere that accepts markup, a
 * Markdown string or an embed, so there is nothing to inject.
 *
 * NO PRICES LIVE HERE. A section carries words; a figure is read from the catalogue
 * (`src/lib/catalogue.ts`) or computed by the pricing helpers at render time
 * (Requirement 4.1), which is what stops a funnel page from quoting a number the
 * checkout would not charge.
 *
 * This module is deliberately import-free at runtime. `scripts/funnel-content.test.mjs`
 * loads it, and the content modules beside it, under `node --test` — and Node's type
 * stripping does not implement tsconfig path aliases, so anything that reached `@/`
 * could not be loaded there.
 */

/** A customer statement. `ProofStrip` renders only the ones marked `verified`. */
export interface Testimonial {
  quote: string;
  name: string;
  car: string;
  location?: string;
  /**
   * `false` for anything not produced by a real customer interaction.
   *
   * `ProofStrip` shows only `true`, and renders nothing at all when the list holds
   * none — a placeholder where a review should be is worse than no section
   * (Requirement 3.2).
   */
  verified: boolean;
}

export interface SectionHeadingProps {
  /** Renders an `h1` when `1`, an `h2` otherwise. Exactly one `h1` per page. */
  level?: 1 | 2;
  eyebrow?: string;
  title: string;
  body?: string;
}

export interface ProseSectionProps {
  heading: string;
  paragraphs: string[];
}

export interface MechanismGridProps {
  /** `icon` is an emoji or symbol rendered `aria-hidden`; optional. */
  items: { title: string; body: string; icon?: string }[];
}

export interface ComparisonTableProps {
  columns: string[];
  rows: { label: string; cells: string[] }[];
}

export interface CostCardsProps {
  items: { label: string; value: string; note?: string }[];
  footnote?: string;
}

export interface StepProcessProps {
  steps: { title: string; body: string }[];
}

export interface RiskReversalProps {
  items: string[];
}

export interface FaqBlockProps {
  items: { q: string; a: string }[];
}

export interface ProofStripProps {
  items: Testimonial[];
}

export interface CtaBandProps {
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

export type Section =
  | ({ kind: "heading" } & SectionHeadingProps)
  | ({ kind: "prose" } & ProseSectionProps)
  | ({ kind: "mechanism" } & MechanismGridProps)
  | ({ kind: "comparison" } & ComparisonTableProps)
  | ({ kind: "cost" } & CostCardsProps)
  | ({ kind: "steps" } & StepProcessProps)
  | ({ kind: "risk" } & RiskReversalProps)
  | ({ kind: "faq" } & FaqBlockProps)
  | ({ kind: "proof" } & ProofStripProps)
  | ({ kind: "cta" } & CtaBandProps);

/** The metadata a page hands to `pageMetadata` in `src/lib/seo.tsx`. */
export interface FunnelMetadata {
  title: string;
  description: string;
  path: string;
}

export interface FunnelPage {
  slug: string;
  metadata: FunnelMetadata;
  sections: Section[];
}

/**
 * Every section kind, one entry each.
 *
 * `render-section.tsx` switches over the union exhaustively, and this record is
 * `Record<Section["kind"], true>` — so adding a member to `Section` without adding it
 * here is a `tsc` error, which is what stops the three places that must agree (the
 * union, the renderer and the guard test) from drifting apart.
 */
export const SECTION_KINDS: Record<Section["kind"], true> = {
  heading: true,
  prose: true,
  mechanism: true,
  comparison: true,
  cost: true,
  steps: true,
  risk: true,
  faq: true,
  proof: true,
  cta: true,
};
