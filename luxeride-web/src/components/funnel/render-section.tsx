import type { Section } from "@/data/funnel/sections";
import CtaBand from "./CtaBand";
import ComparisonTable from "./ComparisonTable";
import CostCards from "./CostCards";
import FaqBlock from "./FaqBlock";
import MechanismGrid from "./MechanismGrid";
import ProofStrip from "./ProofStrip";
import ProseSection from "./ProseSection";
import RiskReversal from "./RiskReversal";
import SectionHeading from "./SectionHeading";
import StepProcess from "./StepProcess";

/**
 * The one place a `Section` becomes a component.
 *
 * The switch is EXHAUSTIVE — the `default` branch assigns the remainder to `never`,
 * so a new member of the `Section` union will not compile here until it is handled.
 * That is what stops a content module from naming a section nothing renders, and it
 * is why pages call this rather than importing components directly (Requirement 2.1).
 */
export default function renderSection(section: Section) {
  switch (section.kind) {
    case "heading":
      return (
        <SectionHeading
          level={section.level}
          eyebrow={section.eyebrow}
          title={section.title}
          body={section.body}
        />
      );
    case "prose":
      return <ProseSection heading={section.heading} paragraphs={section.paragraphs} />;
    case "mechanism":
      return <MechanismGrid items={section.items} />;
    case "comparison":
      return <ComparisonTable columns={section.columns} rows={section.rows} />;
    case "cost":
      return <CostCards items={section.items} footnote={section.footnote} />;
    case "steps":
      return <StepProcess steps={section.steps} />;
    case "risk":
      return <RiskReversal items={section.items} />;
    case "faq":
      return <FaqBlock items={section.items} />;
    case "proof":
      return <ProofStrip items={section.items} />;
    case "cta":
      return <CtaBand primary={section.primary} secondary={section.secondary} />;
    default: {
      // Reached only if `Section` gains a member this switch has not handled. The
      // assignment fails to compile in that case, which is the intent.
      const unhandled: never = section;
      return unhandled;
    }
  }
}
