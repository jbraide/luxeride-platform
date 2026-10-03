/**
 * The social profile module (`trust-and-policies` §3.1–3.2).
 *
 * A profile is *declared* here with its platform and handle, and `url` stays
 * `null` until the owner supplies the real link. A `null` entry is never
 * rendered by `SocialLinks`, so the site cannot link to a `#`, an empty href or
 * a platform search page — all three of which are worse than no link, because
 * they look like a working profile and are not one.
 *
 * `launchCritical: true` means the account is one the business actually
 * advertises on, so `scripts/check-placeholders.mjs` fails while its `url` is
 * still `null`. The other entries are declared-but-optional.
 */

export interface SocialProfile {
  /** Stable key, used as the React key and by the placeholder scan. */
  id: string;
  platform: string;
  /** The handle, exactly as it should read to a customer. */
  handle: string;
  /** `null` until the owner supplies the real URL. Never a `#` or a search URL. */
  url: string | null;
  /** True when the business advertises here, so a missing URL is a launch blocker. */
  launchCritical: boolean;
}

export const SOCIAL_PROFILES: SocialProfile[] = [
  {
    id: "instagram",
    platform: "Instagram",
    handle: "@luxeride.ng",
    // OWNER INPUT: the Instagram profile URL. `launchCritical`, so
    // `check:placeholders` fails while this stays null.
    url: null,
    launchCritical: true,
  },
  {
    id: "tiktok",
    platform: "TikTok",
    handle: "@luxeride.ng",
    // OWNER INPUT: the TikTok profile URL. Optional — renders nothing until set.
    url: null,
    launchCritical: false,
  },
  {
    id: "facebook",
    platform: "Facebook",
    handle: "LuxeRide Nigeria",
    // OWNER INPUT: the Facebook page URL, if the business runs one.
    url: null,
    launchCritical: false,
  },
];

/**
 * Only the profiles that can actually be linked to. `SocialLinks` renders this
 * list, so a declared-but-unlinked profile produces no markup at all.
 */
export function linkedProfiles(): Array<SocialProfile & { url: string }> {
  return SOCIAL_PROFILES.filter((p): p is SocialProfile & { url: string } => p.url !== null);
}