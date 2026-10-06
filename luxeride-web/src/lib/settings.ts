import { prisma } from "@/lib/db";

/**
 * Server-side site settings — the things an OPERATOR decides, for everyone.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * The hero layout was a cookie. That made it per-VISITOR, so the admin switcher the
 * owner asked for — "Fullwidth to Crop" — would have changed the layout on the
 * operator's own screen and on nobody else's. The control would have looked like it
 * worked and changed what customers see for no one.
 *
 * The rule the failure teaches: **anything set from the admin must be server-side
 * state.** A cookie, a localStorage value or a query parameter describes one person.
 *
 * ── WHY A KEY/VALUE TABLE AND NOT COLUMNS ───────────────────────────────────
 *
 * There is exactly one setting today. There will be a seasonal headline override and
 * a support number within the month. Columns mean a migration each time and a `NULL`
 * meaning "fall back to the code default" on every one; rows mean the fallback lives
 * in one `getSetting` and adding a setting is an insert.
 *
 * ── CACHING ─────────────────────────────────────────────────────────────────
 *
 * There is none, deliberately. This is read once per page render, it is five rows,
 * and the alternative — a cache with an invalidation rule — is a whole subsystem for a
 * value that changes when somebody clicks Save. The cost is one indexed read.
 */

/** Every setting the storefront reads, and what each one is allowed to be. */
export const SETTING_KEYS = ["heroLayout"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** The hero layouts. Kept in step with `globals.css`; `contrast-check` guards the class. */
export const HERO_LAYOUTS = ["split", "side", "full"] as const;
export type HeroLayout = (typeof HERO_LAYOUTS)[number];

/**
 * Typed per key rather than as `Record<SettingKey, unknown>`.
 *
 * `unknown` was the original annotation and it was quietly wrong: `NonNullable<unknown>`
 * is `{}`, so `getSetting("heroLayout")` declared itself to return `{}` and
 * `getHeroLayout(): Promise<HeroLayout>` could not return its own `getSetting` call —
 * it had to lie with a cast, and `tsc` said so. A defaults object typed to the value it
 * actually holds makes the return type fall out of the value instead of being asserted
 * over it, and adding a second setting is one more property rather than one more union.
 */
const DEFAULTS: { heroLayout: HeroLayout } = {
  // `split` is what the site has always looked like, so an unconfigured store keeps
  // its current appearance rather than arriving somewhere new.
  heroLayout: "split",
};

/** What one key resolves to. `DEFAULTS` is the authority for this mapping. */
type SettingValue<K extends SettingKey> = (typeof DEFAULTS)[K];

function isHeroLayout(value: unknown): value is HeroLayout {
  return typeof value === "string" && (HERO_LAYOUTS as readonly string[]).includes(value);
}

/**
 * One setting, resolved.
 *
 * AN UNRECOGNISED VALUE FALLS BACK TO THE DEFAULT rather than being rendered. A
 * `SiteSetting.value` is `Json`, so it can hold anything an older or newer version of
 * the admin wrote, and an unrecognised hero layout would otherwise produce a section
 * with no copy and no image.
 */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key } });
    // One key today, so this is one branch rather than a lookup table. When the second
    // setting lands it becomes `RESOLVERS[key](row?.value, DEFAULTS[key])` — which is
    // why `isHeroLayout` is a separate predicate and not an inline check.
    if (key === "heroLayout") {
      // `key === "heroLayout"` narrows `K` to that literal, so `SettingValue<K>` is
      // `HeroLayout` here and the returned value is checked, not asserted.
      return isHeroLayout(row?.value) ? row.value : DEFAULTS.heroLayout;
    }
  } catch {
    // A database that cannot be read must not take the storefront down. The default
    // is a layout that renders, so a failure here degrades the look rather than the
    // page.
  }
  return DEFAULTS[key];
}

/** Which hero layout the homepage renders. Server-side, so it is true for everyone. */
export async function getHeroLayout(): Promise<HeroLayout> {
  return getSetting("heroLayout");
}

/**
 * Persist one setting. Audited by the caller, not here.
 *
 * `client` EXISTS SO THE AUDIT ROW AND THE WRITE CAN SHARE A TRANSACTION.
 *
 * The obvious call is `prisma.$transaction([setSetting(...), prisma.auditEntry.create(...)])`,
 * and it does not work: `$transaction`'s array form takes `PrismaPromise`s, and this
 * function is `async`, so it hands over a plain `Promise` and Prisma rejects it at
 * runtime rather than at compile time. Passing the transaction's client through is the
 * fix — the upsert below is then genuinely inside the same transaction as the audit
 * entry, so a rolled-back audit row is impossible.
 *
 * Omitted, it uses the module client and the write stands alone, which is what a caller
 * that genuinely does not want an audit row wants.
 */
export async function setSetting(
  key: string,
  value: unknown,
  who: string | null,
  client: Pick<typeof prisma, "siteSetting"> = prisma,
): Promise<void> {
  await client.siteSetting.upsert({
    where: { key },
    create: { key, value: value as never, updatedBy: who },
    update: { value: value as never, updatedBy: who },
  });
}
