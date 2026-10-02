# Implementation Plan — `master-build-plan`

## Status

**BLOCKED — E partial, M0 done but for the push, M1 done but for three owner-gated halves.** Last
updated 2026-10-02. **Every remaining item needs an input only the owner can supply**; they are listed
under *What is blocking* below, and the same five have been outstanding since the work started.

**Legend.** `[x]` done and verified by a command run in the session that marked it — the check is named
on the line. `[~]` genuinely half-done, with the missing half and its blocker named on the line.
`[ ]` not started.

**Landed.** The production build is fixed and the platform is under version control for the first
time: `npm run build` exits 0 and writes `.next/BUILD_ID`; `npx tsc --noEmit` reports 0 errors;
`npx eslint .` reports 0 errors and 0 warnings; `npm run verify` chains all of it plus `media:check`
and exits 0. Commits on `main` begin at `7f28f72` (M0); `git log --oneline` has the list.

**The module specs have been marked too**, so each one now reflects what was built rather than saying
"NOT STARTED": `commerce-backend` §1, `storefront-catalog` (54 done, 4 partial), `cart-checkout`
§10.1–10.3, and `payments-paystack` §2–3. `00-RELEASE-READINESS-AUDIT.md` carries a status line on
each of B1–B4 and an updated spec index.

**What is blocking, precisely.** Nothing below is difficulty; each is an input.

| Needs | Blocks |
|---|---|
| **D-05** — the production domain | M0.5, and M1.9's canonical/`og:image`/description half. `metadataBase` needs `NEXT_PUBLIC_SITE_URL`, and a placeholder would ship canonical URLs pointing at a domain nobody owns. **This is the first blocker for all of M3.** |
| **The photo/clip → product mapping** | M1.10's actual run. `Luxeride/footage/` holds `20260801_*.jpg`/`.mp4`; the pipeline is built and verified against that real footage, but only the owner knows which clip shows which product, and alt text built from a guessed angle token would be a caption nobody verified. |
| **A shell where Chrome can open a socket** | M1.12's last assertion. This sandbox refuses Chrome `socket()`, so it has no network and every navigation lands on `chrome-error://chromewebdata/`. `npm run check:hydration` exists for it and exits 2 rather than passing when it cannot load a page. |
| **A private git remote** | M0.1's push. The repository and the first commit exist; nothing has been pushed, so there is still no off-machine copy. |
| **`sudo`** | E3, and therefore E4, E5 and all of M6. `sudo` cannot run as root here (`no new privileges`), so PostgreSQL 16 is still not installed. |

M1's storefront work is in: no `SafeImage` import anywhere, no empty image slot on any surface (every
product renders `ProductPlaceholder`), the three storage-backed screens no longer render store contents
during the first paint, a real mobile menu, a 404 and an error boundary, honest product data with a
price band instead of one number, and prepay **hidden** rather than misdescribed. The browser-side half
of the hydration assertion is unverified — see M1.12.

**M1's exit gate, assertion by assertion** — five of six verified:

| Assertion | State |
|---|---|
| `npm run build` exits 0 | **PASS** |
| `node scripts/media.mjs --check` exits 0 | **PASS** |
| no `SafeImage` import remains under `src/` | **PASS** |
| no hydration warning on `/cart`, `/checkout`, `/order/confirmation` | **UNVERIFIED HERE** — needs a shell where Chrome can open a socket; `npm run check:hydration` |
| no card, strip or PDP gallery renders an empty grey box at 360 px | **PASS** structurally — zero `<img>` elements are emitted, placeholder per container, counts one-for-one. Must be re-run once a manifest exists |
| every route reachable from the mobile menu | **PASS** — menu, `/shop` → 7 PDPs, cart → checkout → confirmation |

**A defect found and fixed during M0.2, not in any audit:** `prisma/schema.prisma` did not validate —
`CarModelFlag.car` had no opposite relation field on `Car`, so `prisma generate` failed with **P1012**.
That would have broken the new `postinstall` script on every fresh `npm install`. Fixed by adding
`Car.flag`.

This file is a **sequence, not a duplicate**. Every sub-task either names a file it touches, or
names the module spec and the task number that owns the work. Where work belongs to no module spec
it is marked **[own]**, and there are only eight: the environment track (E1–E5), git (M0.1), the
D-02 conflict decision (M6.1), the decision-queue upkeep (M5.9–M5.12), and the promotion off a
laptop (M10.3).

> **Read this first.** `design.md` § *The authority hierarchy* and § *The decision queue* govern any
> conflict between two module specs. Three decisions block milestones below: **D-05** (domain and
> host) before M0 ships, **D-03** (which cars are genuinely Confirmed) before M2.2, **D-02** (route
> handler vs Server Action) before M6 starts.

> **The database is not on the critical path to the first ad.** M0 → M5 contain no database work at
> all. M6 is the first milestone that requires one, and the E-track may run beside M0–M5 without
> anything in them depending on it.

---

- [~] E — Parallel track: environment (partial: E1/E2 done, E3–E5 owner-run and outstanding) _(P0)_

  **Goal:** a local Postgres 16 cluster the owner runs, plus the backup discipline that stands in
  for the managed backups a hosted provider would have given.

  **Exit gate:** `pg_isready -h localhost -p 5432` prints `accepting connections`; `psql
  "postgresql://luxeride:…@localhost:5432/luxeride" -c "select 1"` returns `1`; and
  `luxeride-web/.env.local` holds the real `DATABASE_URL` while `luxeride-web/.env` holds only the
  commented placeholder.

  - [x] E1. Survey the environment for anything that would change the plan — `uname -m`, `node -v`, `npm -v`, `command -v psql pg_dump postgres initdb pg_ctl docker brew`, `apt-cache policy postgresql postgresql-16 docker.io`, `ss -ltn | grep 5432`, `cat /etc/os-release`, read `luxeride-web/.env` _(P0)_ _(verified: x86_64 · Node v22.23.1 · npm 10.9.8 · psql/pg_dump/postgres/initdb/pg_ctl/docker/brew all "NOT INSTALLED" · `postgresql` candidate `16+257build1.1`, `postgresql-16` candidate `16.15-0ubuntu0.24.04.1` · `docker.io` candidate `29.1.3-0ubuntu3~24.04.2` · no listener on 5432 · `/etc/os-release` = elementary OS 8.1 on a noble apt base · `luxeride-web/.env` = four lines ending `DATABASE_URL="postgresql://user:pass@localhost:5432/luxeride"`)_ _Requirements: 8.1_
  - [x] E2. Establish that the install is the owner's to run — `id`, `sudo -n true` _(P0)_ _(verified: uid=1000(joseph), not in the sudo group; `sudo -n true` returns "The 'no new privileges' flag is set, which prevents sudo from running as root" and "/etc/sudo.conf is owned by uid 65534, should be 0")_ _Requirements: 8.1_
  - [ ] E3. **[own] — OWNER-RUN, blocked on `sudo`.** Install the cluster — **owner-run**; the exact commands are in `design.md` § *Environment strategy*: `sudo apt-get install -y postgresql-16 && sudo systemctl enable --now postgresql`. Native apt, not a container: no container runtime is installed (E1), apt already has Postgres resolved, and a host-side `pg_dump` is what E5 needs. _Requirements: 8.2_ _(P0)_
  - [ ] E4. **[own]** Create the role and database, and move the real URL into `luxeride-web/.env.local` — → `commerce-backend/tasks.md` 2.2 (role and database) and 2.3 (the `.env.local` move), plus the placeholder guard in `luxeride-web/src/lib/db.ts` from 2.4. Leave `luxeride-web/.env` holding only the commented placeholder and add `luxeride-web/.env.example` with an empty `DATABASE_URL=`. **Do not run this before M0.1**: there is no repository, so an uncommitted secret is an unprotected secret. _Requirements: 8.1, 3.2_ _(P0)_
  - [ ] E5. **[own]** Stand up the backup discipline that replaces managed backups — nightly `pg_dump -Fc -U luxeride -d luxeride` into `~/luxeride-backups/` (outside the repo, 14-day retention) plus one `pg_restore` rehearsal per week → `commerce-backend/tasks.md` 10.2. The rehearsal is the task, not a nicety. Re-verify **D-01** against it. _Requirements: 8.3_ _(P1)_

  > **Do not start M6 until E4 is green.** Requirement 9.2: E3 and E4 may run beside M0–M5, and
  > nothing in M0–M5 may depend on their result.

- [~] M0 — A repository that builds (build green and under version control; push and D-05 outstanding) _(P0)_

  **Goal:** the two ten-minute launch blockers are fixed and the code is under version control.

  **Exit gate:** `npm run build` exits 0 **and** `.next/BUILD_ID` exists **and** `npx tsc --noEmit`
  exits 0 **and** `npx eslint .` reports 0 errors **and** `git log --oneline` on `main` shows a first
  commit that does not contain `luxeride-web/.env`.

  - [ ] M0.1. **[own]** `git init` at `platform/`, write `.gitignore` covering `luxeride-web/node_modules/`, `luxeride-web/.next/`, `luxeride-web/.env`, `luxeride-web/.env.local` and `~/luxeride-backups`, make the first commit, and push it to a private remote. Closes blocker **B4** — except the push. **(verified: `.gitignore` at the repository root; `git log --oneline` on `main` shows `7f28f72` as the first commit and `git ls-files | grep -c '\.env'` returns 0, so no `.env`, `node_modules` or `.next` path is tracked. STILL OPEN: no remote exists, so nothing has been pushed — the owner has no off-machine copy and no `git revert` for anything committed since.)** _Requirements: 3.2_ _(P0)_
  - [x] M0.2. → `commerce-backend/tasks.md` **§1.1–1.5** — the authoritative fix for blocker **B1**: `allowImportingTsExtensions` in `luxeride-web/tsconfig.json`; delete `luxeride-web/prisma/seed.ts` in favour of `luxeride-web/prisma/seed.mts` with explicit `.ts` import specifiers; rewrite `"db:seed"` in `luxeride-web/package.json` to `node prisma/seed.mts` plus the `prisma.seed` key; add `"postinstall": "prisma generate"`. **This supersedes `storefront-catalog` §2.1–2.2 — do not add `"exclude": ["prisma"]` to the tsconfig.** Excluding the directory hides a broken seed from the build rather than fixing it, and `commerce-backend` owns the seed by name. **(verified: `luxeride-web/tsconfig.json` gained `allowImportingTsExtensions`; `luxeride-web/prisma/seed.ts` deleted in favour of `luxeride-web/prisma/seed.mts` with the dead `./data/products` import gone and every import carrying an explicit extension; `luxeride-web/package.json` has `db:seed: node prisma/seed.mts`, the `prisma.seed` key and `postinstall: prisma generate`; `luxeride-web/prisma/schema.prisma` gained the missing `Car.flag` opposite relation that made `prisma generate` fail with P1012. `npm run build` exits 0, `.next/BUILD_ID` is written, `npx tsc --noEmit` exits 0, `npx eslint .` reports 0 errors and 0 warnings.)** _Requirements: 3.3, 4.1_ _(P0)_
  - [x] M0.3. → `storefront-catalog/tasks.md` **§2.3–2.4** — correct the false claims in `luxeride-web/README.md` (defect **D4**) and add the single `verify` script chaining `tsc --noEmit`, `eslint .`, `media:check` and `next build`. **(verified: `luxeride-web/README.md` rewritten — it now names the Fit Finder's `FIT ✓` as a false claim owned by M2 rather than describing the app as honest, and states plainly that the old `tsc`/`eslint` claim was false when written and why. `luxeride-web/package.json` gained `verify`, `media`, `media:check`; `npm run verify` exits 0.)** _Requirements: 4.1_ _(P1)_
  - [x] M0.4. → `payments-paystack/tasks.md` **§2.1–2.2** — confirm M0.2 satisfies this spec's pre-spend precondition. No new work; the two tasks resolve to M0.2. **(verified: `npm run build` exits 0 and `npx tsc --noEmit` exits 0, which are exactly the two assertions §2.1 and §2.2 make.)** _Requirements: 3.3_ _(P0)_
  - [ ] M0.5. **[own] — OWNER DECISION OUTSTANDING.** Record decision **D-05** (production domain and hosting target) before the first deploy — `storefront-catalog` §3.1 throws at module load without `NEXT_PUBLIC_SITE_URL`, and `metadataBase` must be absolute or a relative `openGraph.images` path is a build error. Unblocks `storefront-catalog` OQ 1 and `ad-landing-and-tracking` OQ 8. _Requirements: 4.4, 6.3_ _(P0)_

  > **Nothing after M0 can be reviewed, diffed or rolled back until M0.1 lands.** It is the cheapest
  > milestone in the plan and the one every later gate is measured against.

- [~] M1 — A storefront that shows no voids and makes no claim it cannot support (all but M1.9's metadata half, M1.10's real run, M1.12's browser half and M1.14) _(P0)_

  **Goal:** every page a stranger can reach renders completely on a phone, with no empty image slot,
  no hydration error and no fabricated claim.

  **Exit gate:** `npm run build` exits 0 **and** `node scripts/media.mjs --check` exits 0 **and** no
  `SafeImage` import remains under `luxeride-web/src/` **and** the dev-server console shows no
  hydration warning on `/cart`, `/checkout` or `/order/confirmation` **and** on a 360 px viewport no
  card, strip or PDP gallery renders an empty grey box **and** every route in the site is reachable
  from the mobile menu.

  - [x] M1.1. → `storefront-catalog/tasks.md` **§3.6** — re-split `luxeride-web/src/app/cart/page.tsx`, `luxeride-web/src/app/checkout/page.tsx` and `luxeride-web/src/app/order/confirmation/page.tsx` into a Server Component page file plus a client view component, following the pattern already in `luxeride-web/src/app/fit-finder/page.tsx`. Structural precondition for M1.2 and M3.2; moves no behaviour. **(verified: `luxeride-web/src/app/cart/CartView.tsx`, `luxeride-web/src/app/checkout/CheckoutView.tsx` and `luxeride-web/src/app/order/confirmation/ConfirmationView.tsx` created; each `page.tsx` is now a Server Component wrapper following `src/app/fit-finder/page.tsx`. Separately, and deliberately pulled forward from M6.9: the checkout no longer defaults the delivery zone to `LOCATIONS[0]` — that default quoted every non-Lagos customer 24–48 h against a real 5–7 days. The select now starts empty, `submit()` refuses without a zone, and the error is announced.)** _Requirements: 3.3_ _(P0)_
  - [x] M1.2. → `cart-checkout/tasks.md` **§10.3** — extract the `useHasMounted()` guard from `luxeride-web/src/components/Header.tsx` into a shared hook and apply it to the three pages above. Closes defect **D1**. **(verified: `luxeride-web/src/lib/use-has-mounted.ts` created with `useSyncExternalStore`; `src/components/Header.tsx` imports it; all three views render `StorageSkeleton` until mounted. `curl` of the three routes now returns `Loading your saved cart…` / `Loading your order…` in the SERVER HTML instead of the old `Your cart is empty` / `No recent order found` — that is the mismatch, gone. The dev-server console half is unverified; see M1.12.)** _Requirements: 3.3_ _(P0)_
  - [x] M1.3. → `storefront-catalog/tasks.md` **§8.1–8.5** — `luxeride-web/src/components/ProductPlaceholder.tsx`, `luxeride-web/src/lib/media.ts`, `luxeride-web/src/components/ProductImage.tsx`; swap them into `luxeride-web/src/components/ProductCard.tsx` with the corrected `sizes`; delete `luxeride-web/src/components/SafeImage.tsx`. Closes the empty-grey-box half of blocker **B3** with no photography required. **(verified: `src/components/ProductPlaceholder.tsx`, `src/lib/media.ts` (client-safe types + `mediaUrl`), `src/lib/media-manifest.ts` (the `node:fs` half, split out so a Client Component can render resolved media without pulling `fs` into the client bundle), `src/components/ProductImage.tsx`; `SafeImage.tsx` deleted with zero remaining imports; all four call sites migrated — `ProductCard.tsx`, the PDP, `FitFinder.tsx` and `cart/page.tsx`. `ProductCard.sizes` corrected to `(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw` to match its own grid. **Deviation, deliberate:** the fifteen paths in `src/data/products.ts` that pointed at files never produced are now empty arrays — §8.6's `--check` cannot pass while they are declared, and a declared-but-absent path is the defect itself. The six SVGs that do exist stay listed until §9.6 rewrites them.)** _Requirements: 3.3_ _(P0)_
  - [x] M1.4. → `storefront-catalog/tasks.md` **§8.6–8.7** — `luxeride-web/scripts/media.mjs --check` and the `"build": "npm run media:check && next build"` change, so a missing media file fails the production build instead of shipping a void to paid traffic. **(verified: `luxeride-web/scripts/media.mjs` created; `package.json` has `media:check` and `build: npm run media:check && next build`. `npm run media:check` exits 0, reporting 6 catalogue paths and 0 manifest entries across 7 products.)** _Requirements: 4.1, 4.2_ _(P0)_
  - [x] M1.5. → `storefront-catalog/tasks.md` **§8.8–8.9** — align the PDP image box with the card's `aspect-[4/3]`, and remove `images.dangerouslyAllowSVG` from `luxeride-web/next.config.ts`. Closes defect **D7**; `get-img-props.js` sets `unoptimized = true` for `.svg` sources whenever the flag is false, so the six placeholders keep rendering. **(verified: the PDP strip is replaced by `src/components/ProductGallery.tsx`, whose main image is `aspect-[4/3]`, matching the card; `luxeride-web/next.config.ts` is now an empty `NextConfig`. Nothing renders an `.svg` through the optimiser any more, so removing the flag has no effect at all today.)** _Requirements: 3.3_ _(P0)_
  - [x] M1.6. → `storefront-catalog/tasks.md` **§4.1–4.3** — `luxeride-web/src/app/not-found.tsx`, `luxeride-web/src/components/NotFoundActions.tsx` and `luxeride-web/src/app/error.tsx`. Part of defect **D6** (unlabelled and unreachable controls). **(verified: `luxeride-web/src/app/not-found.tsx`, `src/components/NotFoundActions.tsx` and `src/app/error.tsx` created; `curl` of an unknown path returns 404 carrying `That page isn't here` and `Ask us on WhatsApp`. `error.tsx` uses `{ error, retry }` — confirmed against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`, which is Next 16's name for it, not `reset`. Also fixed here: the cart's qty and remove buttons were unlabelled and now carry `aria-label`s.)** _Requirements: 3.2_ _(P0)_
  - [x] M1.7. → `storefront-catalog/tasks.md` **§5.1–5.2** — `luxeride-web/src/components/MobileNav.tsx` wired into `luxeride-web/src/components/Header.tsx`, keeping the existing `hidden … sm:flex` desktop nav and the `useSyncExternalStore` cart badge untouched. Below 640 px the only reachable routes today are whatever the current page links to plus `/cart`. **(verified: `src/components/MobileNav.tsx` created and mounted in `src/components/Header.tsx`; the desktop `hidden … sm:flex` nav and the `useSyncExternalStore` cart badge are untouched. `curl` of `/` shows `aria-controls="mobile-nav-panel"`, `href="/fit-finder"` and the category links in the pre-hydration HTML, so the menu works before hydration. Open state is derived from `usePathname()` rather than synced in an effect, so navigation closes the panel with no cascading render. **Deviation, deliberate:** the four `/policies/*` links §5.1 lists are omitted — those routes do not exist until M4.4, and a menu entry that 404s is a worse promise than no entry. They belong in the same pass as M4.7.)** _Requirements: 3.3_ _(P0)_
  - [x] M1.8. → `storefront-catalog/tasks.md` **§7.1–7.5** — honest product data in `luxeride-web/src/data/products.ts` (`materials`, `inBox`, `coverage`, `install`, `care`, `faq`, `availability`) and `luxeride-web/src/lib/availability.ts` with `AVAILABILITY_COPY`, `formatPriceFrom()` and `formatDeliverySummary()`; plus the §7.4 grep asserting that no catalogue or PDP surface renders an availability claim, because no code path establishes stock for a specific car. **(verified: `Product` gained `materials`/`inBox`/`coverage`/`install`/`care`/`faq`/`availability` in `src/data/products.ts`, populated for all seven products with the seven original fields byte-identical; `src/lib/availability.ts` created with `AVAILABILITY_COPY`, `formatPriceFrom()` and `formatDeliverySummary()`, the last deriving ₦6,000–₦12,000 and 24 hours to 7 days from `LOCATIONS` instead of hardcoding them. The PDP renders all three; `curl` of `/products/double-layer-mats` shows `From ₦68,000`, the ₦68,000–₦94,000 band and the delivery line. **§7.4 grep result: two hits, both in `src/components/FitFinder.tsx` — line 261 `in stock for your …` and line 376 `Not in stock — yet`. Neither is a catalogue or PDP surface; both are the fabricated fit result that M2.5 and M2.7 own. The assertion therefore holds for the surfaces it names, and the Fit Finder's claim remains M2's to remove.)** _Requirements: 3.3_ _(P0)_
  - [~] M1.9. **(§10.3 done; §10.8 half-done — the compile-time half is built, the deployment half is D-05-gated)** → `storefront-catalog/tasks.md` **§10.3, §10.8** — `luxeride-web/src/components/ProductGallery.tsx` (the one place a post-hydration `onError` still belongs) and `generateMetadata` on `luxeride-web/src/app/products/[slug]/page.tsx`. Requires **D-05**. **(verified: §10.3 done — `src/components/ProductGallery.tsx` is a Client Component with a selected index, keyboard-operable thumbnail `<button>`s exposing `aria-pressed`, `sizes="(min-width: 768px) 50vw, 100vw"` on the main image, and the one post-hydration `onError` that swaps to `ProductPlaceholder`. §10.8 is **half done, along the line §3.1 itself draws**: a title is a compile-time fact, a canonical and an `og:image` are deployment facts. `generateMetadata` on `/products/[slug]` now returns a product-specific title — before it, all seven pages emitted the identical root title, so seven distinct products competed for one query as one page. Verified on `next start` :3112: seven distinct `<title>` elements, all ≤32 characters against §10.8's 60-character ceiling, root title unchanged, `description` inherited from the layout rather than emptied, and **no** `canonical` and **no** `og:image` emitted, which is the honest state while `metadataBase` does not exist — a relative `og:image` is a claim the site cannot honour. **The rest of §10.8 needs `pageMetadata()` and `SITE_URL` from `src/lib/site.ts`/`src/lib/seo.tsx` (M3.1), and D-05 is undecided, so there is no domain for `.env`.** The 120–160 character description is not a case of "not got round to it": composing one from `note` + `materials` + `AVAILABILITY_COPY` was measured across all seven products and lands between 122 and 176 characters — three over the ceiling — while dropping the availability sentence lands between 74 and 128, most under the floor. Fitting the band needs authored copy, which belongs in M3.1 alongside the other twelve routes.)** _Requirements: 3.3_ _(P0)_
  - [ ] M1.10. → `storefront-catalog/tasks.md` **§9.1–9.6** — `luxeride-web/scripts/media.mjs`: sharp auto-orient (the three JPGs carry EXIF Orientation 6, so skipping `.rotate()` serves all three sideways), resize to 1600 inside, JPEG q82 progressive, **no** `.withMetadata()`; `ffmpeg` poster extraction; deterministic output; `luxeride-web/public/products/manifest.json`; then rewrite the six `images[]` entries in `luxeride-web/src/data/products.ts` and delete the now-unreferenced flat SVGs. **Blocked on D-12** — the script exits non-zero rather than writing an empty manifest. M1.3 is what makes this an upgrade rather than a blocker. **(verified in part: `luxeride-web/scripts/media.mjs` implements §9.1–9.5 — `sharp().rotate()` with no argument and deliberately no `.withMetadata()`, resize inside 1600, JPEG q82 progressive, an `ffmpeg` poster at a fixed 1.5 s offset scaled to 1280, a 16 px blurred `blurDataURL` per image, stable ordering and no timestamps, and a non-zero exit naming the expected directories rather than writing an empty manifest. Run against a fixture built inside the repo (4000×3000 JPEG carrying EXIF Orientation 6, plus a generated 1920×1080 clip): `driver.jpg` came out 1200×1600 portrait — the rotation is right — `texture.jpg` 1600×1200, `poster.jpg` 1280×720, `blurDataURL` present, no `video` key emitted, and two runs produced an identical manifest md5. `sharp` moved from a transitive dependency of `next` to a direct `devDependency`.

**Re-verified against the real footage, not a synthetic fixture.** Symlinks in a workspace scratch directory pointed the pipeline at the three real JPEGs and one real 208 MB clip (no copy, and the owner's files untouched), then everything was deleted. Results:
  - The real JPEGs carry **36,841 / 48,471 / 51,019-byte** EXIF blocks, which is what §9.2 is warning about. Outputs: **exif = 0 B, icc = 0 B**, progressive JPEG, 1200×1600 from a 4000×3000 source — so `.rotate()` applied the orientation *and* the metadata was dropped rather than copied.
  - The real clip is `h264 1920×1080 @30/1`, 96.8 s, carrying **`rotation=-90` side data on every frame** — portrait footage stored landscape. `ffmpeg` auto-rotates it, so §9.3's `scale=1280:-1` produced a **1280×2276** poster, and the frame is real (channel stdev ≈ 48, not a blank still).
  - Two runs over the real inputs produced **byte-identical** outputs, poster included.
  - `video` key still absent.

**Finding for whoever builds §10.16 (the PDP video block):** `scale=1280:-1` bounds the *width*, so portrait footage yields a 2276-pixel-tall poster whose ~9:16 aspect does not match the 4:3 box the photographs use — it will letterbox or crop. It is left exactly as §9.3 specifies rather than silently changed, because the consumer of that poster is unbuilt. Bound the longest edge instead if the video block needs to match the gallery.

**Still NOT DONE: the run over the real footage into the repository.** The symlink names encode a product and an angle, and only the owner knows which clip shows which product — so the outputs were deleted rather than committed, and `alt` text generated from a guessed angle token would be a caption claiming something no one has verified. `media:check` is green and every surface is back on `ProductPlaceholder`. **NOT DONE: the run over the real footage.** `Luxeride/footage/` holds three `20260801_11…….jpg` and eight `20260801_19…….mp4`; none matches `<product-slug>-<angle>.jpg`, and only the owner knows which clip shows which product. Until that mapping exists there is no manifest, so every product keeps rendering `ProductPlaceholder` — which is why M1's gate is unaffected either way. §9.6's rewrite of the six `images[]` entries and the deletion of the six flat SVGs both wait on that run.)** _Requirements: 3.2_ _(P1)_
  - [x] M1.11. **Do not** attach the raw 74–208 MB MP4s in `footage/` as a video source — → `storefront-catalog` **§10.16**, which stays unbuilt until a compressed derivative exists. Record the decision so the PDP video block is not built by someone who has not read this. **(verified: recorded in this file and enforced in code — `scripts/media.mjs` emits a `poster` and never a `video` entry, and says so in its header. The fixture run confirms the manifest carries no `video` key.)** _Requirements: 3.3_ _(P2)_
  - [~] M1.12. → `storefront-catalog/tasks.md` **§15.1, §15.4, §15.6** — the manual sweep that *is* this milestone's gate: `curl` the `<head>` of every route, walk every route from the 360 px mobile menu, and confirm no `srcset` picks a 1920- or 3840-wide candidate. **(verified: `npm run build` exits 0 and writes `.next/BUILD_ID`; `node scripts/media.mjs --check` exits 0; `grep -rn SafeImage src/` returns no import; every route answers — `/`, `/shop`, `/cart`, `/checkout`, `/fit-finder`, `/order/confirmation`, `/products/double-layer-mats`, `/products/seat-covers` and `/shop?category=floor-mats` all 200, and an unknown path 404s with the new page. The mobile menu's links are present in the pre-hydration HTML, so every route is reachable below 640 px.

**The gallery has now actually rendered, once.** It never had: with no manifest, `ProductGallery` takes its empty branch and the thumbnail `<button>`s do not exist. Driven with a temporary 3-angle fixture manifest, it produced one main `<img>` at `sizes="(min-width: 768px) 50vw, 100vw"`, three 80px thumbnails carrying `aria-pressed` and `aria-label="Show image N of 3"`, and **zero `<div>` inside a `<button>`** — the last of which is a defect this pass found and fixed: `ProductPlaceholder` rendered a `<div>`, which is invalid inside a `<button>`, and is now a `<span>` (`absolute` blockifies it, so the layout is unchanged). `/shop` simultaneously showed 6 placeholders and 1 `<img>`, which is the fallback path and the real path coexisting correctly. Fixture and outputs deleted afterwards.

**§14.4's `preload` is now wired, not decorative.** `ProductCard` had a `preload` prop no caller passed. It is set for the first two cards on `/` and `/shop` — the first row at `grid-cols-2`, which is also the row above the fold on a phone; preloading the four-wide desktop row would make a phone fetch two images it never shows. One `rel=preload as=image` appears on each route, which is right because only one product has media today.

**A measurement killed a change worth recording, because the next reader will be tempted by it.** The `srcset` candidate list does contain 1920, 2048 and 3840, which is what §15.6 is about, so the obvious fix is to narrow `images.deviceSizes`. Measured first: requesting `w=1920` and `w=3840` from the optimiser both return the image's own 1200×1600, **byte-identical** to `w=1200`. Next clamps every request to the source's own dimensions, so no visitor can receive an upscaled or oversized file, and narrowing `deviceSizes` would have been churn that removed capability for future larger sources. Left alone on purpose. §15.6's literal wording is about the candidate the *browser* picks, which still needs a browser.

**The empty-slot and `srcset` assertions are satisfied structurally and measured.** Nothing under `public/products/manifest.json` exists, so `resolveMedia()` returns `null` for all seven products and every image container renders `ProductPlaceholder`. Counted on the rendered HTML with the RSC payload stripped: `/` 4 cards / 4 placeholders / **0 `<img>`**; `/shop` 7 / 7 / **0**; `/products/seat-covers` 2 placeholders (gallery + 1 related card) / **0**; `/products/double-layer-mats` 3 (gallery + 2 related) / **0**; `/products/full-bundle` 1 (gallery only, which also confirms `relatedProducts()` returns `[]` for it) / **0**. With no `<img>` element emitted anywhere, an empty grey box has no way to appear and no `srcset` exists to pick a 1920- or 3840-wide candidate — but both assertions **must be re-run after the media pipeline produces a manifest**, because that is the moment `<img>` elements start existing. `CategoryTile` renders no image at all, so the homepage's five tiles are not a surface at risk.

**Reachability, walked route by route rather than asserted.** The menu emits `/`, `/shop`, `/fit-finder`, the five `/shop?category=` links and `/cart` in its pre-hydration HTML. From there: `/shop` carries all **7** `/products/<slug>` links; `cart/CartView.tsx:94` links `/checkout`; `checkout/CheckoutView.tsx:117` pushes `/order/confirmation`; `components/FitFinder.tsx:316` links back to `/cart`. Nothing is stranded below 640 px. Note the term honestly: `/checkout` and `/order/confirmation` are **not** in the menu and should not be — they are reached through the funnel, and the `/cart` → `/checkout` link is in the cart's non-empty branch, so it appears only after hydration with items in the cart (the SSR skeleton correctly contains no checkout link). **NOT VERIFIED, and not verifiable from here: the dev-server console on `/cart`, `/checkout` and `/order/confirmation`; the 360 px viewport; and the `srcset` candidates the browser actually picks.** The dev log did capture one mismatch earlier, but it was `cz-shortcut-listen` on `<body>` — a browser extension (ColorZilla) mutating the DOM before React loads, which React names as a cause and which no code change can fix.

**The console half is now mechanical rather than manual: `npm run check:hydration`** (`luxeride-web/scripts/hydration-check.mjs`) drives Chrome over CDP with no new dependency, seeds `localStorage` so the three screens render the hydrated path, and exits non-zero on any console error or warning. **It has not been run to a passing state.** In this sandbox Chrome is refused `socket()` for every connection, so all six routes land on `chrome-error://chromewebdata/`; no browser check of any kind is possible from here, and a request to lift that restriction was declined. What is verified is the CDP plumbing end to end — attach, `Runtime`/`Log`/`Page.enable`, navigate, and `Runtime.evaluate` all return real values. The script detects the no-network case and exits **2** with "N of M routes never loaded — that is an environment failure, not a passing check", so it cannot be mistaken for a green run. **Owner action: run `npm run check:hydration` from a normal shell** to close this.)** _Requirements: 4.1, 4.2_ _(P0)_
  - [x] M1.13. → `payments-paystack/tasks.md` **§3.1–3.4** — honest prepay copy in `luxeride-web/src/app/checkout/page.tsx`: say bank transfer, say the account details follow, and **hide the prepay option entirely until bank details exist** (`cart-checkout` OQ 1 — nothing in `src/` contains an account number or bank, and offering an unpayable option at the highest-intent screen is worse than not offering it). **(verified: `src/lib/payment-options.ts` created with `PREPAY_AVAILABLE = false` and a comment stating the condition for flipping it; `CheckoutView.tsx` renders the prepay button only behind that flag, and the copy already written on it is the honest version — bank transfer, details sent on WhatsApp, discount applied once the transfer is received, not an online payment and not an automatic discount. The POD line now reads `The rider collects cash or a transfer when your order arrives — nothing to pay now.` `payments-paystack` §3.3 replaces the constant with a server-provided flag keyed on `PAYSTACK_SECRET_KEY`.)** _Requirements: 3.2_ _(P0)_
  - [~] M1.14. → `storefront-catalog/tasks.md` **§10.11–10.15, §10.17, §11.8, §12.5–12.6, §13.3, §14.3, §14.5–14.6, §15.7, §3.8, §4.4, §8.10, §9.7–9.9** — every remaining P1/P2 storefront item, in the spec's own order. None of it gates anything. **(done: §7.6 + §10.13 — `src/lib/products.ts` and `src/components/RelatedProducts.tsx`; §10.11 — `src/components/ProductFaq.tsx`; §14.3 — `dynamicParams = false` on `/products/[slug]`; §14.6 — the `Cache-Control` rule, **with a measured deviation**: §14.6's `/products/:path*` also matched the PDP and put `s-maxage=31536000` on the HTML, and the Next headers guide defines `*` as zero-or-more so even `:file*` swallows `/products/<slug>`, hence `:file+`; §14.5, §9.7, §9.8, §9.9, §15.7 — all README. §8.10 was already done inside `scripts/media.mjs`. Verified: `npm run verify` exits 0, and against `next start` on :3112 the media path carries the media cache policy while `/products/<slug>` does not, an unlisted slug 404s, the related strip renders on `single-layer-mats` and `double-layer-mats` and is absent on `full-bundle`, and the FAQ is absent on `seat-covers`. **NOT done, each for a named reason: §3.8/§10.14/§10.15 (opengraph-image) are only meaningful with `metadataBase`, which is D-05-gated — a relative `og:image` is as useless to a crawler as none; §10.12/§12.5/§13.3 need `src/lib/seo.tsx` and `src/app/sitemap.ts` from M3.1/M3.14; §10.17 and §12.6 are P2, and this plan's own priority rule is not to build P2 before P1 is done; §11.8 is explicitly deferred below 50 products; §4.4 is a no-op while every catalogue route prerenders.**)** _Requirements: 3.4_ _(P2)_

- [ ] M2 — An honest fit _(P0)_

  **Goal:** the fabricated `FIT ✓` is replaced by a lookup whose "yes" means something, and every
  refusal is captured. **No database. Unblocked today.**

  **Exit gate:** `POST /api/fit-check` returns only `FITTED`, `NOT STOCKED` or `UNKNOWN`; a
  make/model/year absent from the table returns `NOT STOCKED` and never `FITTED`; `liveLayoutCount()`
  is `>= 1`; every refusal produces a demand-log line; and no reachable code path renders a `FIT ✓`
  for a car no layout covers. **The refusal count must be higher than the acceptance count on
  launch** — that is locked decision 2 behaving correctly, not a failing milestone.

  - [ ] M2.1. → `fitment-engine/tasks.md` **§2.1–2.10** — `luxeride-web/src/data/fitment.ts`: the six entity interfaces; `assertLiveLayouts()` as the Confirmed gate; `LIVE_LAYOUT_IDS` as the only thing `checkFit()` may read, so no code path compares a Layout's status ad hoc; the `checkFit()` discriminated union; `Exclusion` short-circuiting before any Layout is considered; and the make-ticker table with the `^[A-Z0-9]{2,3}-\d{4}-\d{4}$` `internalCode` check. Ships empty and safely — the site can go live refusing everything. _Requirements: 9.4, 3.3_ _(P0)_ — source-doc Phase 0
  - [ ] M2.2. → `fitment-engine/tasks.md` **§2.11–2.12** — enter the first 15–25 Confirmed layouts and the first exclusion rows. **Blocked on D-03**, and this is the longest human task on the whole critical path. Every row needs `evidence`, a `confirmationNote` in the owner's own words, `confirmedOn`, `leadTime`, a `priceFrom` per variant, and the singular `makeId` locked decision 4 requires. _Requirements: 7.1, 6.2_ _(P0)_ — source-doc Phase 0
  - [ ] M2.3. → `fitment-engine/tasks.md` **§3.1–3.7** — `luxeride-web/src/app/api/fit-check/route.ts` as a **Route Handler** and `luxeride-web/src/lib/fitment-contract.ts`. Every failure path — missing field, 2 KB body, thrown assertion, malformed internal state — resolves to `UNKNOWN`, never `FITTED`, and logs the cause server-side. _Requirements: 3.3, 9.1_ _(P0)_ — source-doc Phase 2
  - [ ] M2.4. → `fit-finder/tasks.md` **§2.1–2.8** — `luxeride-web/src/lib/fitment.ts`: `FitRequest` / `FitVariant` / `FitFitted` / `FitNotStocked` / `FitUnknown` / `FitResult`, the remote-provider branch (`NEXT_PUBLIC_FIT_CHECK_URL` unset by default), and `validateFitmentTable()`, which **drops** a bad entry rather than throwing. **File-collision rule:** `fitment-engine` owns `luxeride-web/src/data/fitment.ts` and the entity types; `fit-finder` owns the `FitResult` union and imports from M2.1 rather than re-declaring. Recorded in `design.md` § Architecture. _Requirements: 3.3_ _(P0)_
  - [ ] M2.5. → `fitment-engine/tasks.md` **§4.1–4.11** — replace the fabricated result in `luxeride-web/src/components/FitFinder.tsx` with the real lookup; extend `type Step` with `fitted | not_stocked | unknown` and keep `comingsoon` as the renderer for both refusal states. This is blocker **B2**. _Requirements: 3.3, 9.1_ _(P0)_ — source-doc Phase 2
  - [ ] M2.6. → `fitment-engine/tasks.md` **§5.1–5.9** — the demand log and refusal copy, working before any database exists, and the waitlist that is already built (the optional phone field at `luxeride-web/src/components/FitFinder.tsx:363-381` plus `comingSoonMessage()` in `luxeride-web/src/lib/whatsapp.ts:42`). Locked decision 2's consequence: the demand log must work from day one. **Decide D-06 before §5.2** — if the refusal copy does not promise future stock it need not capture a number. _Requirements: 3.3, 6.3_ _(P0)_
  - [ ] M2.7. → `fit-finder/tasks.md` **§3.1–3.8** — the result card stops claiming "100% precision-molded … in stock for your …", and the Fit Guarantee badge moves onto `FITTED` only. _Requirements: 3.3_ _(P0)_
  - [ ] M2.8. → `fitment-engine/tasks.md` **§2.9** — export `liveLayoutCount()` and `confirmedCustomerNames()`. Single-call launch metric, and the list `ad-landing-and-tracking` aligns creative to in M3.6. _Requirements: 7.1_ _(P0)_
  - [ ] M2.9. → `whatsapp-engine/tasks.md` **§2.1–2.8** — **the long pole, started here on purpose.** Create `luxeride-web/src/lib/whatsapp-templates/*.txt` and submit all four templates to Meta. Approval is documented as "up to 24 hours" with no SLA, so the review clock runs while the owner does M3, M4 and M5. `wa.me` stays the production path throughout, so nothing here blocks trading. Also closes **D-10**. _Requirements: 3.4, 6.2_ _(P0)_
  - [ ] M2.10. → `fit-finder/tasks.md` **§10.1–10.4** — car-catalogue integrity in `luxeride-web/src/data/cars.ts`, including the unreachable "Enter model on WhatsApp" row (`FLAT_CARS` excludes `"Other"`, so `src/components/FitFinder.tsx` can never offer it). _Requirements: 3.3_ _(P0)_
  - [ ] M2.11. → `fitment-engine/tasks.md` **§14.1–14.8** (automated gate tests) is deferred to M9 — the Phase 0 assertions in M2.1 are this milestone's gate, not the P1 gate tests. _Requirements: 3.4_ _(P2)_

- [ ] M3 — A complete, indexable, campaign-matched storefront _(P0)_

  **Goal:** every page has its own metadata and a canonical, the catalogue is searchable, and the
  landing page says what the ad said — with a pixel that reports it.

  **Exit gate:** `/` and `/fit-finder` with `?product=mats` render the prototype's headline and sub
  verbatim; `curl` of every route shows a distinct `<title>`, a self-referencing query-free
  canonical, a 1200×630 `og:image` and a `twitter:card`; `/sitemap.xml` lists `/`, `/shop`, 5
  category URLs and 7 product URLs with no query strings; `next build` shows `/shop` and all five
  `/shop/<slug>` paths prerendered and no longer `ƒ`; and Meta Events Manager **Test Events**
  receives `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Lead` and the LuxeRide
  `CustomEvent`s on a walk `/` → `/?product=mats` → `/fit-finder` → `/cart` → `/checkout`.

  - [ ] M3.1. → `storefront-catalog/tasks.md` **§3.1–3.5** — `luxeride-web/src/lib/site.ts`, the rewritten `metadata` export in `luxeride-web/src/app/layout.tsx` (**no** root `alternates.canonical` — a nested object is inherited by every child that does not override it), `luxeride-web/src/components/JsonLd.tsx` and `luxeride-web/src/lib/seo.tsx`. Requires **D-05**. _Requirements: 3.3_ _(P0)_
  - [ ] M3.2. → `storefront-catalog/tasks.md` **§3.7** — `metadata` on the three re-split pages, with `robots: { index: false, follow: true }` on `/cart` and `/checkout` so transactional pages never compete with `/shop` in search. Needs M1.1. _Requirements: 3.3_ _(P1)_
  - [ ] M3.3. → `storefront-catalog/tasks.md` **§6.1–6.9** — `luxeride-web/src/app/shop/[category]/page.tsx` with `generateStaticParams` and `dynamicParams = false`; `seoTitle`/`seoDescription`/`heroLine` on the five `CATEGORIES` in `luxeride-web/src/data/products.ts`; the `/shop?category=<slug>` → `/shop/<slug>` **307** (not 308) in `luxeride-web/next.config.ts`; and removal of the `await searchParams` block from `luxeride-web/src/app/shop/page.tsx`. §6.8 is what makes `/shop` prerender instead of `ƒ`. _Requirements: 3.3_ _(P0)_
  - [ ] M3.4. → `storefront-catalog/tasks.md` **§10.1–10.2, §10.4–10.7, §10.9–10.10** — the PDP rebuild: `luxeride-web/src/components/Breadcrumbs.tsx`, the two-column grid, `BuyBox.tsx`, `StickyBuyBar.tsx` with `padding-bottom: env(safe-area-inset-bottom)`, the delivery block, the "what's in the box" sections, and JSON-LD whose `Offer` carries a `priceSpecification` with `minPrice`/`maxPrice` rather than one `price`. **No `AggregateRating`** — there is no review store, and a fabricated rating is both a structured-data policy violation and the single most damaging thing this milestone could ship. Needs **D-08** for the price presentation. _Requirements: 3.3, 6.3_ _(P0)_
  - [ ] M3.5. → `ad-landing-and-tracking/tasks.md` **§2.1–2.6** — `luxeride-web/src/data/landing.ts` with `CAMPAIGN_LANDINGS` and `resolveCampaign()`: the four prototype aliases (`mats`, `single-layer`, `seat-covers`, `bundle`) resolved **before** product slugs so `seat-covers` gets the campaign copy and not the product lock, headline and sub verbatim, and `match: "unknown"` for anything unresolvable. _Requirements: 3.3_ _(P0)_
  - [ ] M3.6. → `ad-landing-and-tracking/tasks.md` **§3.1–3.8** — campaign landing rendering on `luxeride-web/src/app/page.tsx` and `luxeride-web/src/app/fit-finder/page.tsx`, so the headline matches the creative the stranger clicked. Feeds from M2.8's `confirmedCustomerNames()`. _Requirements: 3.3_ _(P0)_
  - [ ] M3.7. → `ad-landing-and-tracking/tasks.md` **§4.1–4.12, §5.1–5.6** — `luxeride-web/src/lib/analytics/index.ts` with the single event entry point, the Meta Pixel and GA4 adapters, and `next/script` injection with `PageView` on every route. _Requirements: 3.3_ _(P0)_
  - [ ] M3.8. → `ad-landing-and-tracking/tasks.md` **§6.1–6.11** — funnel and commerce instrumentation, including `fit_refused` and `fit_result_rendered state=FITTED`, which are the two events that tell the owner whether a broad audience is worth continuing. _Requirements: 3.3_ _(P0)_
  - [ ] M3.9. → `ad-landing-and-tracking/tasks.md` **§7.1–7.7** — UTM capture and first-party persistence, so the attribution survives a cleared browser. _Requirements: 3.3_ _(P0)_
  - [ ] M3.10. → `ad-landing-and-tracking/tasks.md` **§8.1–8.9** — the order reference reaching the WhatsApp message as `🔖 Ref LR-XXXXXXXX · via <campaign>`, so the ad URL, the campaign key and the order ref are three independently greppable strings. _Requirements: 3.3_ _(P0)_
  - [ ] M3.11. → `ad-landing-and-tracking/tasks.md` **§9.1–9.8, §10.1–10.9** — attribution on the order, the durability of the thank-you page, and the ads-compliance surface (no personal attributes in ad copy; the landing page must say what the ad says, or it is an ad-review rejection rather than a conversion loss). _Requirements: 3.3, 4.4_ _(P0)_
  - [ ] M3.12. → `fit-finder/tasks.md` **§8.1–8.6** — `/fit-finder` as a campaign landing surface, and the locked-product miss behaviour: show the confirmed car, state the miss, offer the available products, never silently substitute — because showing a different product than the ad promised is the same failure as a wrong fit claim. Answers `storefront-catalog` OQ 7 in the same pass. _Requirements: 3.3_ _(P0)_
  - [ ] M3.13. → `storefront-catalog/tasks.md` **§11.1–11.7** — `luxeride-web/src/components/CatalogExplorer.tsx` with search, sort, an `aria-live` result count and a real empty state; search matches `name`, `note` and the category name so "mats", "TPE", "waterproof" and "boot" all return results; sort compares the **lower** bound of `priceRange()`. State stays in the component so `/shop` and `/shop/<slug>` stay prerendered. _Requirements: 3.3_ _(P0)_
  - [ ] M3.14. → `storefront-catalog/tasks.md` **§12.1–12.4, §13.1–13.2, §14.1–14.2, §14.4, §15.2–15.3, §15.5** — organization/product/breadcrumb JSON-LD, `luxeride-web/src/app/sitemap.ts`, `luxeride-web/src/app/robots.ts`, and the `preload` hint (`priority` is deprecated in Next 16 — do not set both). The `luxeride-web/scripts/seo-check.mjs` guard in §12.4 makes an `AggregateRating` structurally impossible. _Requirements: 3.3, 4.1_ _(P0)_
  - [ ] M3.15. → `cart-checkout/tasks.md` **§12.1–12.3** — the `luxeride-web/src/lib/analytics.ts` sink fired from `/cart` and `/checkout`. Needs M3.8. _Requirements: 3.3_ _(P1)_
  - [ ] M3.16. → `ad-landing-and-tracking/tasks.md` **§11.1–11.4** — Conversions API and real `Purchase` measurement. **Requires M6**: the event has to come from the WhatsApp confirmation webhook and needs an order row to attach a `transaction_id` to. _Requirements: 3.4_ _(P1)_

- [ ] M4 — A trustworthy site _(P0)_

  **Goal:** the site answers the questions a Nigerian buyer asks before paying a stranger, and the
  Fit Guarantee on the badge is a promise a policy page can honour.

  **Exit gate:** `/policies/delivery`, `/policies/returns`, `/policies/privacy`, `/policies/terms` and
  `/contact` all exist and a `grep -rn "TODO(owner)" luxeride-web/src/` returns no hit in a shipped
  page; the footer link grid is live; the announcement bar renders above the fold; the checkout
  consent control links `/privacy`; and the guarantee badge resolves to `/returns`.

  - [ ] M4.1. → `trust-and-policies/tasks.md` **§2.1–2.5** — `luxeride-web/src/lib/copy.ts`, the shared copy register every other surface then reads from instead of restating. _Requirements: 3.3_ _(P0)_
  - [ ] M4.2. → `trust-and-policies/tasks.md` **§3.1–3.3** — `luxeride-web/src/data/social.ts`. _Requirements: 3.3_ _(P0)_
  - [ ] M4.3. → `trust-and-policies/tasks.md` **§4.1–4.5** — the policy content module and shell. `delivery` is populated completely from `LOCATIONS` in `luxeride-web/src/data/locations.ts`; the other three carry clearly-marked `TODO(owner)` slots rather than invented legal text. **Blocked on D-07, D-08 and D-11** — `/returns` cannot ship until "swap it free" is defined operationally, or the page must show an owner-facing warning instead of a promise. _Requirements: 3.3, 6.3_ _(P0)_
  - [ ] M4.4. → `trust-and-policies/tasks.md` **§5.1–5.5** — the P0 policy routes. Per `trust-and-policies` 10.4 the consent checkbox ships with the page or not at all, so M4.9 and this must land together. _Requirements: 3.3_ _(P0)_
  - [ ] M4.5. → `trust-and-policies/tasks.md` **§6.1–6.6** — `luxeride-web/src/app/contact/page.tsx` and the business-legitimacy surface. Needs **D-05** and the registered company details; nothing may be invented, so any CAC number stays a placeholder until supplied. _Requirements: 3.3_ _(P0)_
  - [ ] M4.6. → `trust-and-policies/tasks.md` **§7.1–7.3** — the announcement/utility bar carrying nationwide delivery, the delivery windows, the free-shipping rule and the fit guarantee above the fold. _Requirements: 3.3_ _(P0)_
  - [ ] M4.7. → `storefront-catalog/tasks.md` **§5.3–5.7** — `luxeride-web/src/components/Footer.tsx` as a Server Component with three link columns, the `WHATSAPP_NUMBER` contact block and the policy links, sourced from `LOCATIONS` so the footer and the checkout cannot disagree; plus `luxeride-web/src/data/policies.ts` and `luxeride-web/src/app/policies/[slug]/page.tsx`. **Coordinates with M4.4** — the same four policies, one source of truth. _Requirements: 3.3_ _(P0)_
  - [ ] M4.8. → `trust-and-policies/tasks.md` **§8.1–8.2** — the footer rewrite and the guarantee badge resolving to `/returns`. Overlaps M4.7 by design: the spec that owns the badge owns its behaviour. _Requirements: 3.3_ _(P0)_
  - [ ] M4.9. → `trust-and-policies/tasks.md` **§9.1–9.6** — the trust block adjacent to the buy action, and the checkout consent control linking `/privacy`; → `cart-checkout/tasks.md` **§10.1, §10.4**. _Requirements: 3.3_ _(P0)_
  - [ ] M4.10. → `trust-and-policies/tasks.md` **§12.1–12.4** — the honesty floor enforced mechanically: the no-`TODO(owner)`-in-production scan, the no-availability-claim grep, and the "the page may not publish a number the owner has not committed to" check. This is what makes M5's gates mechanical rather than a judgement call. _Requirements: 4.1, 4.2_ _(P0)_
  - [ ] M4.11. → `fit-finder/tasks.md` **§4.1–4.7** — the final refusal headline wording from `trust-and-policies`, layered over the behaviour built in M2.5–M2.6. **Needs D-06.** _Requirements: 3.3_ _(P0)_
  - [ ] M4.12. → `trust-and-policies/tasks.md` **§10.1–10.5, §13.1–13.4, §14.1–14.2** — the raw footage as honestly-labelled proof (**blocked on D-12**: the files' technical properties were verified and their content was not, and no frame may be captioned as an installed fit unless it shows one), and the copy register adopted across `luxeride-web/src/components/FitFinder.tsx` and `luxeride-web/src/lib/whatsapp.ts`. _Requirements: 3.3_ _(P1)_
  - [ ] M4.13. → `trust-and-policies/tasks.md` **§15.1** — the Confirmed-layout count displayed on the site. **Depends on M9**; it reads a number the database does not hold until then. _Requirements: 7.1, 3.4_ **(P2)**

- [ ] M5 — The pre-spend gate _(P0)_

  **Goal:** one checklist, twenty-two assertions, all green, and two numbers written down. After
  this milestone the owner may spend.

  **Exit gate:** all 15 items of `ad-landing-and-tracking/tasks.md` §12 and all 7 **Gates** of
  `trust-and-policies/tasks.md` "Before any ad spend" are checked; `luxeride-web/docs/launch-metrics.md`
  exists and carries the Confirmed-layout count, the acquisition-or-demand-mapping decision, and the
  five baseline numbers; and **D-11** (NDPC) is answered.

  - [ ] M5.1. → `ad-landing-and-tracking/tasks.md` **§12.1** — `npm run build` exits zero. Owned by `commerce-backend` R1 via M0.2; this is the assertion, not the work. _Requirements: 4.1, 4.4_ _(P0)_
  - [ ] M5.2. → `ad-landing-and-tracking/tasks.md` **§12.2** — the pixel base code pasted into `NEXT_PUBLIC_META_PIXEL_ID`, the Google tag into `NEXT_PUBLIC_GA_MEASUREMENT_ID`, and both script tags confirmed in page source. _Requirements: 4.1_ _(P0)_
  - [ ] M5.3. → `ad-landing-and-tracking/tasks.md` **§12.3–12.6** — the Events Manager and GA4 DebugView walk: all six events arriving with their parameters; exactly one `campaign_landing_fallback` on `?product=bogus` with a normally rendered page; `currency: "NGN"` and a numeric `value`; and UTM values showing under Session source/medium. _Requirements: 4.1_ _(P0)_
  - [ ] M5.4. → `ad-landing-and-tracking/tasks.md` **§12.7–12.8** — submit a test order, clear `localStorage`, reload and confirm the recovery screen rather than "No recent order found"; then confirm the received WhatsApp message carries `🔖 Ref LR-XXXXXXXX · via <campaign>`. _Requirements: 4.1_ _(P0)_
  - [ ] M5.5. → `ad-landing-and-tracking/tasks.md` **§12.9–12.10, §12.13–12.14** — `/privacy` and `/contact` reachable in one tap on a phone viewport; all seven `trust-and-policies` gates green; no personal attributes in ad copy; and the landing page saying what the ad says. _Requirements: 4.1, 4.4_ _(P0)_
  - [ ] M5.6. → `trust-and-policies/tasks.md` **Gates 1–7** — the second gate list, asserted independently of M5.1–M5.5 so neither list can be satisfied by skipping the other. _Requirements: 4.1, 4.4_ _(P0)_
  - [ ] M5.7. → `ad-landing-and-tracking/tasks.md` **§12.15** — record the baseline numbers: sessions, `car_search_no_match` rate, `fit_refused` rate, `fit_result_rendered state=FITTED` count, `Lead` count. Without these, week one has no denominator. _Requirements: 7.3_ _(P0)_
  - [ ] M5.8. → `ad-landing-and-tracking/tasks.md` **§12.12** — record, **before spending**, whether the first run is acquisition targeting (cars already Confirmed) or demand mapping (broad, mostly refused). This is `fitment-engine` locked decision 2's own demand, and it decides which conversion rate the campaign is judged against. **Decision D-04.** _Requirements: 7.4, 6.3_ _(P0)_
  - [ ] M5.9. **[own]** Answer **D-11** — NDPC data-controller registration and whether a ticked consent box is sufficient written consent for name, phone and home address. It blocks nothing in the build and may block the first spend; it is cheap to get wrong late. _Requirements: 6.4, 4.4_ _(P0)_
  - [ ] M5.10. **[own]** Create `luxeride-web/docs/launch-metrics.md` and record the launch-day baseline: the Confirmed-layout count from M2.8's `liveLayoutCount()` (locked decision 2's launch metric), the M5.8 decision, the domain and the date. **This record cannot be reconstructed later** — by then the sheet has changed. _Requirements: 7.1, 7.2, 7.3_ _(P0)_
  - [ ] M5.11. **[own]** Answer **D-09** (Paystack account, test key, business-verification lead time) and confirm **D-10** (WhatsApp Business Account, display-name review, template status) — neither gates M5, and both are multi-day external lead times. "Not needed until Phase 3" was true when the architecture plan was written; starting the clock here is what puts M7 and M8 in weeks rather than months. _Requirements: 6.5, 6.6_ _(P0)_
  - [ ] M5.12. **[own]** Read the first ad's refusal ratio from the M5.7 baseline and confirm it matches what locked decision 2 implies: more cars refused than accepted. A run that accepts more cars than it refuses means the `Confirmed` gate in M2.1 is not actually being enforced, and the fit claim is false again. _Requirements: 4.2, 7.1_ _(P0)_

  > **The ad may run after M5 and before M6, deliberately.** The static Confirmed-only table, the
  > `wa.me` handoff and the pixels all work with no database. The cost is order integrity — the
  > money-path defect in `00-RELEASE-READINESS-AUDIT.md` §6 — and the mitigation is M6.4/M6.7, which
  > the owner may pull forward into M1 if the first ad performs. See `design.md` § Open Questions
  > item 2.

- [ ] M6 — Orders that outlive the browser _(P0)_

  **Goal:** an order is a row, priced by the server, reachable by reference, and not dependent on a
  customer's `localStorage` or a tap they might not make.

  **Exit gate:** `npx prisma migrate status` reports up to date; `npm run db:seed` runs twice with
  no error and no duplicate rows; one real order writes an `Order` plus its `OrderItem` rows;
  `/order/<reference>` survives a hard refresh in a private window; and a **Lexus GX 470 double-layer
  order prices at the premium figure, not the regular one** — defect **D2**, and the most expensive
  regression available in this milestone.

  > **Blocked on E4** (a provisioned database) **and on decision D-02** (route handler vs Server
  > Action). `_CONTEXT.md` §12 rule 7 applies in both directions: nothing before this milestone may
  > be designed as if the database exists, and nothing after it may assume it does without
  > checking E4.

  - [ ] M6.1. **[own] Decide D-02** — `src/app/api/orders/route.ts` (Route Handler, per `cart-checkout` §4.1) or `src/app/checkout/actions.ts` (Server Action, per `commerce-backend` 6.1). M6.4, M6.7 and M6.8 all hang on this, and it is a module-spec conflict, not a sequencing question. Record the answer in this file. _Requirements: 6.2_ _(P0)_
  - [ ] M6.2. → `commerce-backend/tasks.md` **§2.1, §2.3–2.6** — rewrite `luxeride-web/prisma/schema.prisma` to the reconciled model (`Product` with `regular`/`premium` and **no** `basePrice` and **no** `tier`; `Make`, `Vehicle`, `Order` with the money breakdown, `reference` and `idempotencyKey`; `OrderItem`), then `npx prisma migrate dev --name init_commerce_model`, `prisma migrate status`, and the `db:migrate` / `db:deploy` / `db:status` / `db:studio` scripts. **§2.1 is already satisfied** — the provider decision is Postgres, local; see the E-track. `luxeride-web/prisma/migrations/` is the only record of schema history and there is no `git revert` to fall back on before M0.1. _Requirements: 8.2, 9.2_ _(P0)_
  - [ ] M6.3. → `commerce-backend/tasks.md` **§3.1–3.6, §4.1–4.5** — `luxeride-web/prisma/seed.mts` importing `CATEGORIES` / `PRODUCTS` / `LOCATIONS` from `luxeride-web/src/data/*.ts` instead of restating them; `luxeride-web/src/lib/db.ts` as a `globalThis`-cached singleton guarded by `import 'server-only'`; `luxeride-web/src/lib/order-status.ts` as the single `OrderStatus` union that M7 and M8 both import; and the `DATABASE_URL`-leak check against `.next/static/`. _Requirements: 3.3_ _(P0)_
  - [ ] M6.4. → `cart-checkout/tasks.md` **§2.1–2.5** — `luxeride-web/src/lib/order-pricing.ts`, `luxeride-web/src/lib/order-validation.ts`, `luxeride-web/src/lib/order-ref.ts` (`crypto.randomUUID()`, never `Date.now()`) and `luxeride-web/scripts/pricing.test.mjs` under `node --test`. **This is the mitigation the M5 note depends on** — it needs no database and can be pulled forward into M1. _Requirements: 3.3_ _(P0)_
  - [ ] M6.5. → `commerce-backend/tasks.md` **§5.1–5.5** — `luxeride-web/src/lib/order-validation.ts` as the single server-side validation layer: **reject, never clamp** (quantity outside 1–99, an unknown payment method, an unknown zone), with the delivery zone and its fee resolved server-side so a customer cannot choose their own delivery charge. _Requirements: 3.3_ _(P0)_
  - [ ] M6.6. → `cart-checkout/tasks.md` **§3.1–3.4** — the order reference in the WhatsApp message, built from the **server response** so the message and the record can never disagree, plus "Free" instead of `₦0` on the POD line and the zone ETA. _Requirements: 3.3_ _(P0)_
  - [ ] M6.7. → `cart-checkout/tasks.md` **§4.1–4.6, §5.1–5.9** — the server-side order endpoint and the checkout submission flow: identity-only lines, the server's figures shown in place of the local ones with the corrected total and the reason, the `window.open` return value kept, **the cart not cleared until the handoff is confirmed**, and the "I've sent it" prepared state with resend and copy. This is the whole of the audit's money-path defect. _Requirements: 3.3_ _(P0)_
  - [ ] M6.8. → `commerce-backend/tasks.md` **§6.1–6.9** — the order-creation surface chosen in M6.1: one `prisma.$transaction`, every client price ignored and recomputed from persisted rows, the whole submission rejected rather than defaulted when a slug or a brand is missing, `idempotencyKey @unique` as the real double-click guard, a server-minted `LR-` reference, and the UTM columns reserved so no order row ever needs backfilling. **This is where D2 closes on the write path.** _Requirements: 3.3_ _(P0)_
  - [ ] M6.9. → `cart-checkout/tasks.md` **§6.1–6.13** — the checkout form: a real `<form>` with named inputs so native validation participates, per-field errors with `aria-invalid` / `aria-describedby` / `role="alert"`, focus moved to the first invalid control, the persisted `draft` slice in `luxeride-web/src/store/order.ts` cleared only after a successful handoff, and **the `LOCATIONS[0].name` default removed** — a non-Lagos customer is currently quoted 24–48 h against a real 5–7 days. _Requirements: 3.3_ _(P0)_
  - [ ] M6.10. → `cart-checkout/tasks.md` **§7.1–7.8** — the three-branch confirmation screen, "Order sent" removed, and the recovery path when the browser blocks the popup. _Requirements: 3.3_ _(P0)_
  - [ ] M6.11. → `commerce-backend/tasks.md` **§7.1–7.4** — `luxeride-web/src/app/order/[reference]/page.tsx` as a Server Component reading the order by reference, the phone number required before the money lines are shown, a "not found" state that discloses nothing, and a redirect from `luxeride-web/src/app/order/confirmation/page.tsx`. _Requirements: 3.3_ _(P1)_
  - [ ] M6.12. → `cart-checkout/tasks.md` **§8.1–8.7, §9.1–9.4, §11.1–11.3** — cart integrity (dedupe on add, line-keyed quantity), conversion mechanics on the cart, and order lookup. _Requirements: 3.3_ _(P1)_
  - [ ] M6.13. → `commerce-backend/tasks.md` **§8.1–8.2, §9.1–9.4** — ship `Product` in the initial migration before any fitment table exists, so M9's `LayoutVariant` foreign key is writable; publish the single `ProductSlug` union in `luxeride-web/src/lib/product-slug.ts` (which `fitment-engine` imports instead of declaring its own); and add `luxeride-web/tests/db.test.ts` plus the runbook. **Zero new dependencies** — `node:test` is already there. _Requirements: 3.4_ _(P1)_
  - [ ] M6.14. → `cart-checkout/tasks.md` **§13.1** — replace the `persistOrder()` log-line stopgap with the Prisma `create`. The handler's validation, pricing and response shape do not change. _Requirements: 3.3_ _(P1)_

- [ ] M7 — Prepay that works without a human _(P0)_

  **Goal:** prepay is a real payment with a real status, verified server-side, and the site never
  promises a discount the fee consumes.

  **Exit gate:** with a `sk_test_` key, a Paystack transaction initializes, a test card charge moves
  the order `pending → paid`, the webhook signature verifies against the raw request body on a real
  Paystack delivery, and `sk_live_` appears nowhere in the repository.

  > **Blocked on M6** (an order record to move money against) **and on D-08** (what the customer is
  > shown). **Unblocked on nothing else** — M7 and M8 are independent of each other.

  - [ ] M7.1. → `payments-paystack/tasks.md` **§2.3** — add `server-only` to `luxeride-web/package.json` if M6.3 has not already. It is not currently installed; only `client-only` is. _Requirements: 3.3_ _(P0)_
  - [ ] M7.2. → `payments-paystack/tasks.md` **§4.1–4.6** — `luxeride-web/src/lib/server-pricing.ts` reusing the rule `productBase()` uses, and **no `charge.failed` handler** — Paystack confirms the event surface covers successful transactions only, so a failure arrives through `data.status` on verify and never through a webhook. _Requirements: 3.3_ _(P0)_
  - [ ] M7.3. → `payments-paystack/tasks.md` **§5.1–5.9** — `luxeride-web/src/lib/paystack.ts` as the single client, bearer secret key, `x-paystack-signature` verification. **Sign the raw bytes from `await request.text()`** — the Node sample on Paystack's own page re-serialises the already-parsed body, and the two differ whenever key order or whitespace differs. The first real delivery must be checked against both candidates before anything changes. Prefer the signature over an IP allowlist. _Requirements: 4.2, 4.4_ _(P0)_
  - [ ] M7.4. → `payments-paystack/tasks.md` **§6.1–6.5** — order creation on the shared base from M6.3/M6.8, with `idempotencyKey` and the server-minted reference. _Requirements: 3.3_ _(P0)_
  - [ ] M7.5. → `payments-paystack/tasks.md` **§7.1–7.8** — the checkout Server Action: initialize, redirect, and a `callback_url` that **verifies rather than trusts** the `?reference=` it is handed — "if the amount doesn't match, do not deliver value to the customer". Needs **D-08**. _Requirements: 3.3, 6.3_ _(P0)_
  - [ ] M7.6. → `payments-paystack/tasks.md` **§8.1–8.9** — the webhook endpoint: **one handler for both the test and the live dashboard URL**, fast ack, hard dedupe, and the test-mode retry schedule (**hourly for 10 hours with a 30-second timeout**, not the live 72 hours) as the reason for both. _Requirements: 3.3_ _(P0)_
  - [ ] M7.7. → `payments-paystack/tasks.md` **§9.1–9.11** — verification and the status page, keeping the **paid** state visible even when a refund later fails, because the customer still has the money. _Requirements: 3.3_ _(P0)_
  - [ ] M7.8. → `payments-paystack/tasks.md` **§13.1–13.4** — test mode and honest reporting. Reopen **D-08** against the real fee: `1.5% + ₦100` capped at ₦2,000 means the ₦2,000 prepay discount is nearly consumed on an ₦82,000 order. That is a pricing-policy decision, so it goes into `design.md` § Open Questions and not into a checkbox. _Requirements: 6.3_ _(P0)_
  - [ ] M7.9. → `cart-checkout/tasks.md` **§13.3** — extend the payment option list in `luxeride-web/src/app/checkout/page.tsx` with card and USSD, leaving the POD and prepay branches untouched. _Requirements: 3.3_ _(P1)_
  - [ ] M7.10. → `payments-paystack/tasks.md` **§10.1–10.4, §11.1–11.7, §12.1–12.4, §14.1–14.4** — abandonment and expiry, refunds, secrets, and the reporting that keeps the ₦2,000 badge honest. _Requirements: 3.4_ _(P2)_

- [ ] M8 — WhatsApp the server, not the customer _(P0)_

  **Goal:** the confirmation is sent by the business, the Confirm/Cancel button press comes back as a
  status, and an order nobody acted on gets followed up.

  **Exit gate:** all four templates show `APPROVED`; one real send lands with the `LR-` reference in
  the body; a Confirm button press moves the order to `confirmed` through the webhook; and the
  12-hour follow-up fires exactly once, for an order still `pending`.

  > **Blocked on M6** (an order record to write status to) **and on the M2.9 template approval**,
  > which was started two milestones early so this one is never waiting on a review queue.

  - [ ] M8.1. → `whatsapp-engine/tasks.md` **§2.7–2.10** — confirm the four submitted templates, strip all urgency, cross-sell and offer language (a utility template judged promotional is approved as `MARKETING` and becomes billable everywhere), and check every body against the published limits: body 1024, header 60, footer 60, label 25. Closes **D-10**. _Requirements: 3.4_ _(P0)_
  - [ ] M8.2. → `whatsapp-engine/tasks.md` **§3.1–3.7** — reference codes, with the existing `wa.me` path kept working throughout so trading never stops for a review queue. _Requirements: 3.3_ _(P0)_
  - [ ] M8.3. → `whatsapp-engine/tasks.md` **§4.1–4.6** — `luxeride-web/src/lib/whatsapp-cloud.ts`; the Cloud API client, with the sender-number fallback working regardless of whether a `payload` actually returns on the webhook. _Requirements: 3.3_ _(P0)_
  - [ ] M8.4. → `whatsapp-engine/tasks.md` **§5.1–5.5** — the webhook handshake and `X-Hub-Signature-256` over the raw body, including a rotation-survival story. _Requirements: 3.3_ _(P0)_
  - [ ] M8.5. → `whatsapp-engine/tasks.md` **§6.1–6.11** — button presses mapping Confirm/Cancel onto the `OrderStatus` union from M6.3, and handling Meta's 36-hour webhook retry without double-processing. _Requirements: 3.3_ _(P0)_
  - [ ] M8.6. → `whatsapp-engine/tasks.md` **§7.1–7.5** — delivery receipts, and the five status values. _Requirements: 3.3_ _(P0)_
  - [ ] M8.7. → `whatsapp-engine/tasks.md` **§8.1–8.8** — the 12-hour follow-up, firing once, for orders still `pending`. _Requirements: 3.3_ _(P0)_
  - [ ] M8.8. → `whatsapp-engine/tasks.md` **§13.1–13.4, §14.1–14.7** — configuration and secrets, and **the rehearsal**: one full pass from send through button press through receipt on a real number, before any customer sees it. _Requirements: 3.3, 4.1_ _(P0)_
  - [ ] M8.9. → `cart-checkout/tasks.md` **§13.2, §13.4** — replace the "Order sent" / "prepared" copy with the confirmed/cancelled statuses, which is **the first moment a success tick on the confirmation screen is not a lie**; plus the resend affordance the Cloud API enables. _Requirements: 3.3_ _(P1)_
  - [ ] M8.10. → `whatsapp-engine/tasks.md` **§9.1–9.8, §10.1–10.5, §11.1–11.6, §12.1–12.9** — failure paths and the `wa.me` fallback, consent and opt-out, the message log and audit, and the operator queue. Answers `whatsapp-engine` OQ 9 with the same single-operator arrangement as the rest of the admin and no permission matrix, per locked decision 1. _Requirements: 3.4_ _(P2)_

- [ ] M9 — The fitment admin replaces the sheet _(P1)_

  **Goal:** a layout is entered, grouped, split and published from the console instead of a
  spreadsheet, and the front-end contract does not change when that happens.

  **Exit gate:** `/admin` renders the six screens; a layout can be grouped, split and published with a
  mandatory `confirmationNote` and `confirmedOn`; the conflict guard refuses to merge vehicles already
  on different live layouts; and `checkFit()` now reads the database with `/api/fit-check` returning
  the same three states for the same inputs.

  > **Blocked on M6** — `commerce-backend` §8.3 reserves `OrderItem.layoutId` and
  > `OrderItem.layoutVariantId` as **nullable only** precisely so the storefront keeps trading with
  > no fitment tables present, which is what lets this milestone come *after* M6 rather than gate it.
  > This is also the deliberate inversion of fitment source-doc Phase 1, which would be "urgent" to
  > whoever maintains the sheet — and the sheet works.

  - [ ] M9.1. → `fitment-engine/tasks.md` **§6.1–6.9** — the Prisma fitment models, delivered as an **additive migration through `commerce-backend`**: `Layout`, `Vehicle`, `Mapping` (with `confidence`, `evidenceNote`, `confirmedBy`, `date`), `Variant`, `ImageSet`, `Exclusion`, `DemandLog`. `LayoutVariant` keys to the catalogue `productSlug` published in M6.13, which is why `Product` had to ship in the initial migration. _Requirements: 3.4_ _(P1)_
  - [ ] M9.2. → `fitment-engine/tasks.md` **§7.1–7.7** — admin authentication with **exactly one operator**: no roles, no permission matrix, no second editor seat, per locked decision 1. _Requirements: 3.3_ _(P1)_
  - [ ] M9.3. → `fitment-engine/tasks.md` **§8.1–8.11** — the six admin screens: vehicles list, grouping view, layout detail, exclusions, demand log, audit log. _Requirements: 3.3_ _(P1)_
  - [ ] M9.4. → `fitment-engine/tasks.md` **§9.1–9.11** — grouping, the conflict guard refusing to merge vehicles already on different live layouts, and **split as a first-class action**. Answers `fitment-engine` OQ 7: a split child starts `draft` and needs fresh evidence, because the parent's evidence covered the parent's span. _Requirements: 3.3, 6.3_ _(P1)_
  - [ ] M9.5. → `fitment-engine/tasks.md` **§10.1–10.6** — the audit log and amendment history. One person editing means a fat-fingered status change is the whole risk, which is exactly why the Confirmed gate requires the mandatory short note. _Requirements: 3.3_ _(P1)_
  - [ ] M9.6. → `commerce-backend/tasks.md` **§8.3–8.5** — the second migration adding the **nullable only** layout references plus `Vehicle.aliases` / `generation` / `bodyType` / `facelift`, which must exist before this module's data is imported. _Requirements: 3.3_ _(P1)_
  - [ ] M9.7. → `fitment-engine/tasks.md` **§12.1–12.4** — orders against a layout that is later split or retired, with `unitPrice` frozen at write time and never re-derived. _Requirements: 3.4_ _(P1)_
  - [ ] M9.8. → `fitment-engine/tasks.md` **§11.1–11.6** — ImageSets per layout per angle. _Requirements: 3.4_ _(P2)_ — source-doc Phase 3
  - [ ] M9.9. → `fitment-engine/tasks.md` **§13.1–13.4, §14.1–14.8** — ranked demand analytics and the automated gate tests (**Phase 4**), and supplier import (**Phase 5**). Deferred to M10. _Requirements: 3.4_ _(P2)_

- [ ] M10 — Harden, and get off the laptop _(P1)_

  **Goal:** the four absent safety nets from `commerce-backend` §9.3 — backups, rate limiting, error
  monitoring, CI — plus the promotion off a laptop.

  **Exit gate:** a nightly `pg_dump` has run for seven consecutive nights **and one has been restored
  into a scratch database and queried**; `createOrder` is rate-limited per IP and per phone; an error
  hook is live; and the production `DATABASE_URL` points at a **hosted** instance, not localhost.

  - [ ] M10.1. → `commerce-backend/tasks.md` **§10.1–10.4** — rate limiting on `createOrder` keyed per IP and per phone, error monitoring via an `instrumentation.ts` hook, and the `layoutId` backfill with a recorded reason for every skipped order. _Requirements: 3.4_ _(P2)_
  - [ ] M10.2. → `commerce-backend/tasks.md` **§10.2** and **E5** — automated daily backups **and a tested restore into a scratch database**. This is the task the local-Postgres decision took away from a managed provider, so it is a gate here and not a nice-to-have. _Requirements: 8.3, 8.6_ _(P1)_
  - [ ] M10.3. **[own]** Promote from local to a hosted instance — provision Neon or Supabase, `pg_dump -Fc` the local cluster, `pg_restore` it into the hosted instance, run `npx prisma migrate deploy` (**not** `migrate dev`), and point the production `DATABASE_URL` at it. One URL change plus a dump; the schema is `provider = "postgresql"` and therefore agnostic. **Revisit D-01 here and close it.** Doing this before M6 rather than during it means the first migration was written against the production URL and the promotion is not a live-traffic event. _Requirements: 8.6, 9.2_ _(P1)_
  - [ ] M10.4. → `commerce-backend/tasks.md` **§9.2–9.3** — the runbook, stating plainly that `prisma migrate reset` destroys all data and is a development-only operation, and the four absent safety nets with the concrete consequence of each. _Requirements: 3.4_ _(P1)_
  - [ ] M10.5. → `payments-paystack` **§10–§14** leftovers, → `whatsapp-engine` **§9–§12** leftovers, → `fitment-engine` **§13–§14** (ranked demand analytics, supplier import). All the deferred P2 work across the three post-order specs. _Requirements: 3.4_ _(P2)_
  - [ ] M10.6. → `fit-finder/tasks.md` **§6.1–6.8, §7.1–7.7, §9.1–9.6, §11.1–11.2, §12.1–12.5** — delivery zone back in the funnel, the result price agreeing with the checkout total, routes out of the result without double-charging, a fit the customer can return to, and the structure/verification pass. The prototype-parity items from `_CONTEXT.md` §8. _Requirements: 3.4_ _(P1)_
  - [ ] M10.7. → `storefront-catalog/tasks.md` leftovers and → `trust-and-policies/tasks.md` **§15.1** — the Confirmed-layout count displayed on the site, and the remaining P2 storefront work. Depends on M9.1. _Requirements: 3.4_ _(P2)_

---

## Decisions and deviations recorded by the E/M0/M1 run (2026-10-02)

**D-05 — production domain and hosting target — STILL OPEN, deliberately deferred by the owner.**
Consequence: M0.5 is unbuilt, `NEXT_PUBLIC_SITE_URL` is not in `.env`, `src/lib/site.ts` cannot be
created (§3.1 throws at module load without it), and M1.9's PDP `generateMetadata` is unbuilt with it.
Nothing else in M0–M1 depends on it. **This is the first blocker for M3**, which needs `metadataBase`,
a self-referencing canonical and an `og:image` on every route.

**D-12 — footage content — ANSWERED by the owner: reviewed.** That unblocks `media.mjs`'s transform
half as far as its *code* goes, and no further: §9.1's input contract is `<product-slug>-<angle>.jpg`
and the real files are named `20260801_114841.jpg`. The photo-to-product mapping (`storefront-catalog`
design.md § Open Questions item 2) is **still owed by the owner**, and until it exists no manifest can
be written. Note the consequence either way: no frame may be captioned as an installed fit unless it
shows one, and §9.3's `alt` text is generated from the angle token — so the angle token is a claim.

**M1.7 deviation.** `MobileNav` omits the four `/policies/*` links that §5.1 lists, because those
routes do not exist until M4.4. A menu entry that 404s is a worse promise than no entry.

**M1.3 deviation.** The fifteen `images[]` paths in `src/data/products.ts` that named files which were
never produced are now empty arrays rather than dangling strings. §8.6's `--check` gate cannot pass
while they are declared, and a declared-but-absent path is the defect itself. The six SVGs that do
exist stay listed until the §9.6 rewrite.

**M6.9 pulled forward, partially.** The checkout's delivery-zone `<select>` no longer defaults to
`LOCATIONS[0]`, which was quoting every non-Lagos customer a 24–48 h estimate against a real 5–7 days.
The rest of M6.9 — a real `<form>`, named inputs, per-field `aria-invalid`/`aria-describedby`, focus
management — is still M6's, and the checkout is still not a `<form>`.

**A stray `next-server` was killed during this pass, and it took the dev server on :3000 with it.** I had
two verification servers left over on :3112/:3113 and identified the processes to kill by start time; the
`next-server` children I killed turned out to include the one behind :3000, whose PID had been respawned
when `next.config.ts` changed. It was restarted immediately and verified: `http://localhost:3000/`
returns 200 and serves the current code. Recorded because a `next dev` server can be silently restarted
by a config edit, so "the server I saw earlier" is not a stable thing to reason about, and because the
`next start` verification servers should be stopped by job handle rather than by PID.

**M1.12's console gate is a script, not a habit.** `luxeride-web/scripts/hydration-check.mjs` and
`npm run check:hydration` turn "stare at the DevTools console on three routes" into one command with an
exit code. Two things it encodes that a human would get wrong: it uses a throwaway Chrome profile with
extensions disabled, because this machine has an extension whose `cz-shortcut-listen` attribute on
`<body>` React reports as a hydration mismatch, and it seeds `localStorage` before visiting the three
screens, because a mismatch in the *empty* cart is not the mismatch defect D1 was about. It exits 2 when
Chrome cannot reach the origin, so a network failure can never read as a pass.

**M1.14 deviation, measured.** `storefront-catalog` §14.6 specifies `headers()` for `/products/:path*`.
Against a production server that pattern also matched the PDP itself and returned
`Cache-Control: public, max-age=0, s-maxage=31536000, …` on the product **HTML** — a page pinned for a
year at the edge. The Next headers guide defines `*` as zero-or-more, so even `:file*` still swallows
`/products/<slug>`; the rule uses `/products/:slug/:file+` and is scoped to the two-segment media path.
Verified both ways on `next start` on :3112.

**`LUXERIDE_FOOTAGE_DIR`** is a new environment override on `scripts/media.mjs`, for footage that lives
somewhere other than `Luxeride/footage/`. It is also how the pipeline was verified against a fixture
without touching the owner's files.

**A defect found and fixed during M0.2, present in no audit:** `prisma/schema.prisma` did not validate
at all. `CarModelFlag.car` declared a relation with no opposite field on `Car`, so `prisma generate`
failed with **P1012** — which the new `postinstall` script would have turned into a failing
`npm install` on every fresh clone. Fixed by adding `Car.flag CarModelFlag?`.

**One published claim now depends on the price table, and nothing guards it.** §7.2's rule is to publish
only what is on record, so the Full Bundle's FAQ says it "is priced below the Double Layer Mats and the
Seat Covers added together, at both the regular and premium tier". That was checked against every
combination rather than asserted: regular/2-row 120,000 vs 110,000; regular/3-row 148,000 vs 135,000;
premium/2-row 147,000 vs 135,000; premium/3-row 175,000 vs 160,000 — the bundle is cheaper in all four.
It is prose in `src/data/products.ts`, so **a future price edit can silently falsify it.** A
`prices:check` in the `verify` chain would make that structurally impossible, in the same shape as
§12.4's `seo-check.mjs`; it is not added here because it is not an M1 item, and the claim sits two lines
from the prices it depends on in the same file.

**One latent claim is deliberately left standing, and M2 owns it.** `src/components/FitFinder.tsx:261`
still renders `100% precision-molded {product} in stock for your {year} {brand} {model}` beside a
`FIT ✓` badge, for any of the 4,671 car/year combinations in `src/data/cars.ts`, with no fitment data
behind any of them. This is blocker **B2** and the single most damaging false claim in the app. M1's
gate does not cover it and M2.5/M2.7 rewrite it. It is flagged here so that M1's completion is not
read as "the site is honest now".
