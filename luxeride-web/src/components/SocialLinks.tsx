import { linkedProfiles } from "@/data/social";

/**
 * The social links block (`trust-and-policies` §3.3).
 *
 * A Server Component that filters `url: null` BEFORE it renders, so a profile
 * the owner has not linked yet produces no markup at all — no `#`, no empty
 * href, no link to a platform search page. External links carry
 * `target="_blank" rel="noreferrer"`, matching the existing `wa.me` links.
 *
 * It renders `null` when nothing is linked, so the caller can mount it
 * unconditionally without an empty heading appearing on the page.
 */
export default function SocialLinks({ className = "" }: { className?: string }) {
  const profiles = linkedProfiles();
  if (profiles.length === 0) return null;

  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-2 ${className}`}>
      {profiles.map((profile) => (
        <li key={profile.id}>
          <a
            href={profile.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-fg-muted hover:text-accent"
          >
            {profile.platform}
          </a>
        </li>
      ))}
    </ul>
  );
}