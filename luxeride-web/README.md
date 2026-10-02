# LuxeRide — Next.js Storefront

This is the real e-commerce rebuild from the architecture plan — Next.js 16 (App Router), TypeScript,
Tailwind v4. This phase is **UI + client-side state only**: no database, no Paystack, no WhatsApp Cloud
API webhook yet. Everything currently lives in `src/data/*.ts` as typed constants (a direct port of the
old prototype's config), and the cart/order are Zustand stores persisted to `localStorage`.

The authoritative plan for what is built and in what order is
`../.kiro/specs/master-build-plan/tasks.md`. Check it before starting anything here.

## Run it

```bash
npm install          # runs `prisma generate` via postinstall
npm run dev
```

Then open http://localhost:3000.

The full pre-deploy gate — everything a human would otherwise have to remember to run:

```bash
npm run verify
```

It chains `tsc --noEmit`, `eslint .`, `media:check` and `next build`, and exits non-zero on the first
failure.

One gate cannot be reached that way, because it is about the browser rather than the build: the console
must be free of hydration warnings on `/cart`, `/checkout` and `/order/confirmation`. That one has its
own command, so it is not a human staring at DevTools:

```bash
npm run check:hydration                      # against http://localhost:3000
npm run check:hydration -- http://localhost:3001
```

It drives the installed Chrome over CDP with no new dependency, seeds `localStorage` with a cart and a
placed order so the three screens render the hydrated path, and exits non-zero if any route logs an error
or a warning. It uses a throwaway profile with extensions disabled, because this machine has an extension
that stamps `cz-shortcut-listen` onto `<body>` and React reports that as a hydration mismatch — a real
browser would show it forever and it is not a defect in this code. `CHROME_BIN` overrides the binary.

**It needs a shell where Chrome can open a socket.** In a sandbox that denies `socket()`, every
navigation lands on `chrome-error://chromewebdata/`; the script detects that and exits **2** with an
explicit "environment failure, not a passing check" message rather than reporting a clean run. Always
read the `probe` block: `href` must be the route you asked for and `textLen` must be non-trivial. `npm run build` on its own also runs `media:check` first, so a missing product image fails the
production build rather than shipping an empty slot to paid traffic.

> **No database is required to run or build the app yet.** `npm run build` never touches Postgres, and
> nothing renders from it. `src/lib/db.ts` exists and guards the connection string, but only
> `prisma/seed.mts` opens a connection, and `prisma/schema.prisma` has never been migrated — see
> `../.kiro/specs/commerce-backend/tasks.md` §2.

## Environment

Two files, and the difference matters:

- **`.env.example`** is **committed** and carries **no values**. It is the record of which variables the
  app needs. It is the one exception to `.gitignore`'s `.env*` rule, on purpose.
- **`.env.local`** is **never committed** and holds the real `DATABASE_URL`. Load order is
  `.env.$(NODE_ENV).local` → `.env.local` → `.env.$(NODE_ENV)` → `.env`, so `.env.local` wins.

`src/lib/db.ts` throws at first import if `DATABASE_URL` is missing or still the placeholder from
`.env`. That is deliberate (`commerce-backend` §2.4): a build that cannot reach a database should fail
at the door rather than surface later as an empty product list or an order that silently did not save.

## The database, and the entire backup story

```bash
sudo -u postgres psql -c "CREATE ROLE luxeride LOGIN PASSWORD '<yours>';"
sudo -u postgres createdb -O luxeride luxeride
```

Then `.env.local` holds `DATABASE_URL="postgresql://luxeride:<yours>@localhost:5432/luxeride"` —
**and it already does**, with a generated password. Run the `ALTER ROLE` above with that same password
(or put yours in `.env.local` instead), then confirm the whole thing in one command:

```bash
npm run db:check
```

That is E4's exit gate: it reads the URL out of `.env.local`, refuses the placeholder, runs
`select 1`, and reports the role, the database, the server version and how many tables exist. It is
also the command that tells you which half you forgot when you rotate the password — `.env.local` or
Postgres. The connection string is never printed on any path, including the failures.

**A local Postgres cluster ships no managed backups, and there is no history for the data the way there
is for the code.** That leaves exactly one recovery path:

```bash
npm run db:backup                     # pg_dump -Fc into ~/luxeride-backups, 14-day retention
npm run db:backup -- --list           # what is on disk, and how old
npm run db:backup -- --restore FILE   # the rehearsal: restore into a scratch database
```

**A backup that has never been restored is a hypothesis, not a backup.** `--restore` creates a
`luxeride_restore_<timestamp>` database, restores into it, prints per-table row counts and the
one-liner to compare them against the live database, then tells you how to drop the scratch copy. Run
it weekly, and after any migration that changes a table. It never touches the live database: a scratch
copy is always the target.

Schedule the nightly dump with a `systemd --user` timer or a crontab entry — there is one workstation
and one person, so whatever is not scheduled will not happen.

## What's here

- `/` — homepage with category tiles and featured products
- `/shop` and `/shop?category=<slug>` — full catalog, filterable
- `/products/[slug]` — product detail page → links into the Fit Finder with that product pre-selected
- `/fit-finder` (also `/fit-finder?product=<slug>` for a locked entry point) — the car search → year →
  product → row-configuration wizard, ending in **Add to Cart** instead of going straight to checkout
- `/cart` — multi-item cart, quantity controls
- `/checkout` — name/phone (validated)/address/delivery zone/payment method, live WhatsApp message preview
- `/order/confirmation` — reads the last placed order from the order store
- 404 and error boundaries (`src/app/not-found.tsx`, `src/app/error.tsx`), each with a WhatsApp escape

The route list is not final. Still to come, with the milestone that adds each:

| Route | Added by | Notes |
|---|---|---|
| `/shop/[category]` | M3.3 | today the same grid is reached as `/shop?category=<slug>` |
| `/policies/delivery`, `/policies/returns`, `/policies/privacy`, `/policies/terms` | M4.4 | |
| `/contact` | M4.5 | |
| `/order/[reference]` | M6.11 | replaces `/order/confirmation`, which is a `localStorage` copy |
| `/admin` | M9.3 | six screens, one operator |

`/products/[slug]` has `dynamicParams = false`, so a slug outside the seven in `src/data/products.ts` is
a real 404 at the router rather than an on-demand render that calls `notFound()` afterwards.

## What's real vs. placeholder

- **Real**: all routing, cart logic, pricing math (row surcharge, tier-based pricing), phone validation,
  coming-soon routing for unavailable brands/models, the 33-brand car catalog, the mobile menu, the
  media gate.
- **Placeholder**: product photography. No real photo has been processed yet, so every product renders
  `ProductPlaceholder` — a branded panel that occupies exactly the box the photograph will occupy. The
  six watermarked SVGs in `public/products/` are still listed in `src/data/products.ts` but are no longer
  rendered. Real photography arrives through `public/products/manifest.json`, written by
  `scripts/media.mjs` — which is **not built yet** (`storefront-catalog` §9, blocked on D-12).
- **Honest by construction**: no surface claims stock for a specific car. Every product says it is made
  to order, and price is always a band, never one number — see `src/lib/availability.ts`.
- **Not honest yet, and owned by M2**: the Fit Finder result card still renders `FIT ✓` and "in stock for
  your …" for any of the 4,671 car/year combinations in `src/data/cars.ts`, with no fitment data behind
  any of them. This is blocker **B2**; `fitment-engine` and `fit-finder` fix it in milestone M2. Do not
  read this file as a claim that the fit story is truthful today.
- **Prices**: Cargo Liner / Mud Flaps / Sun Shade prices are placeholders — swap them in
  `src/data/products.ts`.

## Media

`node scripts/media.mjs --check` walks `PRODUCTS[].images[]` and `public/products/manifest.json` and
fails if any declared path has no file in `public/`. It is wired into `npm run build` and `npm run verify`.

`npm run media` is the transform half: it reads `footage/photos/<product-slug>-<angle>.jpg` and
`footage/video/<product-slug>.mp4`, writes `public/products/<slug>/<angle>.jpg` (auto-oriented from
EXIF, resized inside 1600, JPEG q82 progressive, plus a 16 px blurred `blurDataURL`), extracts a
`poster.jpg` per clip, and rewrites `public/products/manifest.json`. Set `LUXERIDE_FOOTAGE_DIR` to read
footage from somewhere other than `Luxeride/footage/`. It **refuses to run** without a `photos/`
directory rather than writing an empty manifest, and it never emits a `video` entry — the raw clips are
74–208 MB and attaching one as a `<source>` would hand a visitor a 200 MB download.

### `next.config.ts` — the three knobs, and why each is left alone

- **`images.formats`** stays at its default `['image/webp']`. AVIF is roughly 50% slower to encode for
  about 20% smaller files, and the framework's own guidance is to prefer WebP. A commented-out
  `['image/avif', 'image/webp']` sits in the config; measure before enabling it.
- **`images.qualities`** defaults to `[75]`. Passing a `quality` prop that is not in that list is
  **silently coerced to the nearest allowed value** rather than erroring, so a non-default `quality`
  needs the list widened *first*. Nothing in this app passes one today.
- **`Cache-Control`** is set for `/products/:slug/:file+` only — product photography. Note the pattern:
  `storefront-catalog` §14.6 specifies `/products/:path*`, which was measured to also match the PDP
  itself and put a one-year `s-maxage` on the HTML. The Next headers guide defines `*` as zero-or-more,
  so even `:file*` still swallows `/products/<slug>` and `+` is required.

### Moving media off `public/`

`MEDIA_BASE_URL` in `src/lib/media.ts` is the whole seam. To move to Supabase Storage or Vercel Blob:
set that constant to the bucket origin, add an `images.remotePatterns` entry for it in
`next.config.ts`, and copy the manifest paths across unchanged. No component holds a path literal —
they all go through `mediaUrl()` — so nothing else changes.

## Next phases (not built yet, per the architecture plan)

1. Move `src/data/*.ts` into a real Postgres DB (Supabase + Prisma).
2. Paystack integration for the "Prepay by Transfer" option. Prepay is currently **hidden** in the
   checkout, not merely relabelled — nothing in the app contains a bank account to pay into, and an
   option that cannot be honoured is worse than no option (`src/lib/payment-options.ts`).
3. WhatsApp Business Cloud API — actual server-side send + webhook for the Confirm/Cancel buttons
   (today, checkout opens a `wa.me` link client-side, same as the prototype).
4. Admin screen (or start with Supabase's table editor).

## Notes on this build

- Fonts (Oswald / Inter / JetBrains Mono) are loaded via `next/font/google` — this needs normal internet
  access at build time.
- `npx tsc --noEmit` and `npx eslint .` both run clean **as of M0/M1** (0 errors, 0 warnings). They did
  not before M0: `prisma/seed.ts` imported a path that did not exist, which aborted `npm run build`
  entirely and left `npx tsc --noEmit` reporting one error. That claim was false when it was first
  written; it is true now, and `npm run verify` is what keeps it honest.
- `npm run build` must exit 0 and write `.next/BUILD_ID`. If `.next/BUILD_ID` is absent, the build never
  succeeded — a green-looking `next build` that produced no `BUILD_ID` is not a build.
- **No ISR interval is configured, deliberately.** Every catalogue route is a compile-time constant read
  from `src/data/*.ts`, so there is nothing to revalidate: `/`, `/shop` and the seven PDPs are static or
  SSG, and `/fit-finder` is dynamic only because it reads `?product=`. `export const revalidate` belongs
  to whichever spec first introduces a real data read — `commerce-backend` when `/order/[reference]`
  lands, and `fitment-engine` when `checkFit()` reads the database in M9. Adding it before then would
  only hide a stale-catalogue bug that cannot exist yet.
- **The product photography file must be named to a contract, not dropped in.** `scripts/media.mjs`
  reads `footage/photos/<product-slug>-<angle>.jpg`, where `<product-slug>` is one of the seven slugs in
  `src/data/products.ts` and `<angle>` becomes the image's `alt` text (`driver` → "driver-side view").
  A file that does not match is rejected by name rather than skipped, because a silently skipped photo
  is a product that renders a placeholder and nobody notices.
