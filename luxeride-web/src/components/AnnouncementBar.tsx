import { announcement } from "@/lib/copy";

/**
 * The announcement / utility bar (`trust-and-policies` §7.1–7.3).
 *
 * A Server Component, rendered above the header and NOT sticky, so the existing
 * `sticky top-0 z-20` header needs no offset change. At most three items, all
 * from the copy register: nationwide delivery, the fastest window derived from
 * `LOCATIONS`, and the prepay rule. No countdown, no stock number, no urgency
 * claim. The glyph is decorative and marked `aria-hidden`, and no meaning is
 * carried by colour alone.
 */
export default function AnnouncementBar() {
  const items = [announcement.delivery, announcement.fastest, announcement.prepay].filter(Boolean);

  return (
    <div className="border-b border-line bg-panel/60">
      <ul className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-5 py-2 text-center font-mono text-[11px] text-gold-dim sm:flex-row sm:justify-center sm:gap-5">
        {items.map((item) => (
          <li key={item} className="flex items-center justify-center gap-2">
            <span aria-hidden className="text-gold">
              ◆
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
