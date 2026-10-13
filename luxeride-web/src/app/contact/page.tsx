import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import SocialLinks from "@/components/SocialLinks";
import { WHATSAPP_NUMBER } from "@/data/locations";
import { listDeliveryZones } from "@/lib/delivery";
import { business, published } from "@/data/business";
import { contact, guarantee, refusals } from "@/lib/copy";
import { pageMetadata } from "@/lib/seo";
import { whatsappLink } from "@/lib/whatsapp";

/**
 * `/contact` — the business-legitimacy surface (`trust-and-policies` §6.1–6.3).
 *
 * A Server Component with no state. The only client island is `ContactForm`,
 * which is a message box that hands off to WhatsApp; there is no server write.
 * It reads the delivery zones, so the service area it lists is the same
 * `Location` rows the checkout charges from — a hard-coded list here was the one
 * place a zone rename could leave behind.
 *
 * WHY THIS PAGE IS LOAD-BEARING RATHER THAN DECORATION
 *
 * The whole product asks a stranger to pay a business they have never met, and
 * the standard Nigerian objection is "is this site real". So this page does the
 * three things that actually answer it: it gives a phone number that works
 * without WhatsApp installed, it states the trading name the rest of the site
 * already uses, and it publishes the two facts a customer can check — the
 * registered entity and the service area.
 *
 * WHAT IT REFUSES TO DO
 *
 * `src/data/business.ts` holds the registration number, hours and response
 * expectation as owner markers, and `published()` returns `null` for a marker.
 * Those render as an honest "ask us and we will confirm" rather than as the
 * marker itself or an invented value. That lesson was learned the hard way: the
 * policy pages were rendering `[[OWNER INPUT REQUIRED: …]]` straight to
 * customers, which on a trust page is the worst possible place for it.
 */

export const metadata: Metadata = pageMetadata({
  title: "Contact LuxeRide Nigeria",
  description:
    "Message us on WhatsApp, call, or check our service area and registered details. We confirm every fit before we take your money.",
  path: "/contact",
});

/** `2347049621694` -> `0704 962 1694`, which is how a Nigerian customer reads it. */
function readableNumber(e164: string): string {
  const local = e164.startsWith("234") ? `0${e164.slice(3)}` : e164;
  return local.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3");
}

/** One row of the contact card. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-border py-3 sm:flex-row sm:gap-4">
      <dt className="w-44 flex-shrink-0 text-[11px] uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg/85">{children}</dd>
    </div>
  );
}

export default async function ContactPage() {
  const legalName = published(business.legalName);
  const registrationNumber = published(business.registrationNumber);
  const hours = published(business.hours);
  const responseExpectation = published(business.responseExpectation);

  // Derived from the delivery zones, so this page and the checkout cannot disagree
  // about where delivery reaches.
  const serviceArea = (await listDeliveryZones()).map((zone) => zone.name);

  return (
    <article className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="font-display text-3xl font-semibold">Contact us</h1>
      <p className="mt-2 text-sm text-fg-muted">
        WhatsApp is the fastest route and the one we answer. Everything about an order happens there.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a
          href={whatsappLink("Hi! I have a question about LuxeRide.")}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-accent px-5 py-3.5 text-center text-sm font-semibold text-on-accent"
        >
          Message us on WhatsApp
        </a>
        <a
          href={contact.tel}
          className="rounded-xl border border-fg-muted/40 px-5 py-3.5 text-center text-sm font-semibold hover:border-accent"
        >
          Call {readableNumber(WHATSAPP_NUMBER)}
        </a>
      </div>

      <dl className="mt-8 rounded-xl border border-border bg-surface/60 px-5 py-2">
        <Row label="Business name">{contact.businessName}</Row>
        <Row label="Registered name">
          {legalName ?? (
            <span className="text-fg-muted">
              Ask us on WhatsApp and we will send the certificate details directly.
            </span>
          )}
        </Row>
        <Row label="Registration number">
          {registrationNumber ?? (
            <span className="text-fg-muted">Available on request — ask us and we will send it.</span>
          )}
        </Row>
        <Row label="WhatsApp">
          <a href={whatsappLink("Hi! I have a question about LuxeRide.")} target="_blank" rel="noreferrer" className="font-mono text-accent">
            {readableNumber(WHATSAPP_NUMBER)}
          </a>
        </Row>
        <Row label="Phone">
          <a href={contact.tel} className="font-mono text-accent">
            {readableNumber(WHATSAPP_NUMBER)}
          </a>
        </Row>
        <Row label="Email">
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="text-accent">
              {contact.email}
            </a>
          ) : (
            // No address is on record anywhere in this repository, so none is
            // invented. Saying why is more useful than a `mailto:` that bounces.
            <span className="text-fg-muted">
              We do not publish an email address yet — WhatsApp and the phone number above both reach a
              person.
            </span>
          )}
        </Row>
        <Row label="Hours">
          {hours ?? <span className="text-fg-muted">Ask us and we will tell you when we are around.</span>}
        </Row>
        <Row label="How fast we reply">
          {responseExpectation ?? (
            <span className="text-fg-muted">We aim to reply the same working day.</span>
          )}
        </Row>
        <Row label="We deliver to">
          <ul className="space-y-0.5">
            {serviceArea.map((zone) => (
              <li key={zone}>{zone}</li>
            ))}
          </ul>
        </Row>
      </dl>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">Before you buy: we check the fit first</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/80">
          {refusals["NOT STOCKED"].body} We only say a part fits a car once somebody has confirmed that
          floor pan — physically, in writing from the supplier, or against a verified OEM match.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg/80">
          If we have not confirmed your car yet, we will tell you so and take your number, rather than
          guess. {guarantee}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">Send us a message</h2>
        <ContactForm />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">Elsewhere</h2>
        <div className="mt-3">
          <SocialLinks />
        </div>
      </section>
    </article>
  );
}
