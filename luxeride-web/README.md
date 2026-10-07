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

> **The database is not optional any more.** The storefront catalogue (`/`, `/shop`, `/products/[slug]`,
> the sitemap) is read from Postgres through `src/lib/catalogue.ts`, as are the order lookup, the
> Fit Finder's year ranges and fit checks, and every `/admin` screen. `src/lib/db.ts` throws, on the
> first query of a request, if the connection string is missing or still the placeholder in `.env`.
> That is deliberate
> (`commerce-backend` §2.4): a page that cannot reach the database should fail at the door rather than
> render an empty catalogue as though it were real, which is also why `src/lib/catalogue.ts` has no
> fallback to the compile-time `PRODUCTS` array.

## Environment

Two files, and the difference matters:

- **`.env.example`** is **committed** and carries **no values**. It is the record of which variables the
  app needs. It is the one exception to `.gitignore`'s `.env*` rule, on purpose.
- **`.env.local`** is **never committed** and holds the real `DATABASE_URL`. Load order is
  `.env.$(NODE_ENV).local` → `.env.local` → `.env.$(NODE_ENV)` → `.env`, so `.env.local` wins.

`src/lib/db.ts` throws when it builds a client — the first query of a request — if the connection string
is missing or still the placeholder from `.env`. That is deliberate (`commerce-backend` §2.4): a request
that cannot reach a database should fail loudly rather than surface as an empty product list or an order
that silently did not save. It is no longer checked at module load: on Cloudflare Workers the connection
string does not exist until a request supplies its bindings.

## The database: hosted on Aiven, and the entire backup story

The live database is a hosted **PostgreSQL 18.6** instance on Aiven. `.env.local` holds a URL of this
shape:

```
postgres://avnadmin:<password>@<project>.aivencloud.com:15674/defaultdb?sslmode=require&connect_timeout=30
```

Two parts of that string are load-bearing, and both are the kind of thing a tidy-up removes:

- **`sslmode=require`** — Aiven refuses an unencrypted connection.
- **`connect_timeout=30`** — measured, not decoration. Prisma resolves hostnames with its own Rust
  resolver rather than the system one, and this workstation runs the `127.0.0.53` systemd-resolved
  stub. Against the hosted instance that produced `P1001 Can't reach database server` on roughly
  **10 of every 16** new connections, while `psql` was 16/16 and raw TCP and TLS were 20/20 and 12/12 —
  so it read as a server outage and never was one. With the timeout set it was 16/16 on the same test,
  and 20/20 fresh `PrismaClient`s. If connections start failing intermittently again, look here first.

### The local cluster is the rollback, not the source of truth

The PostgreSQL 16 cluster that used to be the database is still on this workstation holding the same
rows — the move was verified table by table, by per-table content hash rather than row counts — and its
connection string is preserved in `.env.local.bak` (`postgresql://luxeride:<password>@localhost:5432/luxeride`).
Nothing points at it now. If the hosted instance has to be abandoned, put that URL back into
`.env.local` and the local cluster is the database again. Keep it until the hosted instance has been
backed up and restored at least once. Recreating it from nothing is the two commands this section used
to open with:

```bash
sudo -u postgres psql -c "CREATE ROLE luxeride LOGIN PASSWORD '<yours>';"
sudo -u postgres createdb -O luxeride luxeride
```

### Migrations: author against the local cluster, deploy to the hosted instance

`npm run db:migrate` runs `prisma migrate dev`, and **`migrate dev` is not run against the hosted
instance**. Not because it cannot connect — it needs a *shadow database*, and whether it may create
one is a privilege question that has already been answered on both sides (`avnadmin` on Aiven, and
`luxeride` locally, each created and dropped scratch databases during the backup drills). It is not run
because `migrate dev` is the command that can decide a database is out of date and offer to reset it,
and the real data exists in exactly one place. So the split is:

```bash
npm run db:migrate   # author the migration — LOCAL cluster, shadow database welcome
npm run db:deploy    # prisma migrate deploy — applies what is in prisma/migrations to Aiven
npm run db:status    # the migration HISTORY
npm run db:check     # the SCHEMA, which status cannot see
```

`migrate deploy` needs no shadow database, so the hosted role never has to create one. If the local
role is missing `CREATEDB` (`P3014: permission denied to create database`), grant it:

```bash
sudo -u postgres psql -c "ALTER ROLE luxeride CREATEDB;"
```

**Otherwise use the shadow-free path**, which is what the first three migrations were written with —
generate the SQL, execute it, then record it as applied:

```bash
TS=$(date +%Y%m%d%H%M%S); NAME=add_something
M="prisma/migrations/${TS}_${NAME}"; mkdir -p "$M"
node --env-file=.env.local scripts/prisma.mjs migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script > "$M/migration.sql"
node --env-file=.env.local scripts/prisma.mjs db execute --file "$M/migration.sql" --schema prisma/schema.prisma
node --env-file=.env.local scripts/prisma.mjs migrate resolve --applied "${TS}_${NAME}"
npm run db:status && npm run db:check
```

**`npm run db:check` is not optional at the end of that.** `migrate status` compares the migration
*history*, not the schema, so a migration that was marked applied without its DDL ever running looks
like success. That happened here: migration 2 was recorded as finished while four columns were missing,
and nothing reported it. `db:check` now diffs the live database against `prisma/schema.prisma` and fails
on any disagreement, which is the assertion `migrate status` cannot make.

**`prisma migrate deploy` (not `migrate dev`) is what runs against the hosted instance** — `db:deploy`.
Confirm the result in one command:

```bash
npm run db:check
```

It reads the URL out of `.env.local`, refuses the placeholder, runs `select 1` against whatever that URL
names, and reports the role, the database, the server version and how many tables exist — against Aiven
that reads `avnadmin`, `defaultdb`, `18.6` and 22. It then diffs the live database against
`prisma/schema.prisma` and fails on any disagreement. It is also the command that tells you which half
you forgot when you rotate the password — `.env.local` or the server. The connection string is never
printed on any path, including the failures.

**A hosted instance is not a backup, and there is no history for the data the way there is for the
code.** Aiven's own backups are a plan-level feature rather than something this repository controls, so
the recovery path it owns is still this one:

```bash
npm run db:backup                     # pg_dump -Fc into ~/luxeride-backups, 14-day retention
npm run db:backup -- --list           # what is on disk, and how old
npm run db:backup -- --restore FILE   # the rehearsal: restore into a scratch database
npm run db:backup -- --drop NAME      # drop a scratch copy a rehearsal left behind
```

**The client tools must be at least as new as the server.** `pg_dump` refuses to dump a server newer
than itself — `aborting because of server version mismatch` — and the distribution here ships
PostgreSQL 16, so it cannot dump this 18.6 server at all. The first `db:backup` after the move failed
for exactly that reason and wrote a 0-byte file. The 18.6 client is therefore installed **per-user**,
because installing it system-wide needs a password this machine did not have:

- `~/.local/opt/pg18` — the extracted 18.6 client and its `libpq5`, unpacked from the PGDG packages
  with `dpkg-deb -x` (no root needed to read a `.deb`).
- `~/.local/bin/pg_dump`, `~/.local/bin/pg_restore`, `~/.local/bin/pg_isready` — wrappers that put
  `~/.local/opt/pg18` on `LD_LIBRARY_PATH` and exec the real binary. `~/.local/bin` precedes
  `/usr/bin` on `PATH`, so the npm scripts pick them up without changing.

Delete those three wrappers and the distribution's versions come back — but nothing on this machine can
dump the hosted database without an 18.x client. With a password available, the package-manager
equivalent is the PGDG repository plus `apt install postgresql-client-18`.

**A backup that has never been restored is a hypothesis, not a backup.** `--restore` creates a
`luxeride_restore_<timestamp>` database, restores into it, compares every table against the live
database and prints **PASS** or **FAIL**, exiting non-zero on a mismatch. Run it weekly, and after any
migration that changes a table. It never touches the live data: the scratch copy is always the target,
and `--drop` removes it afterwards — refusing any name that is not a `luxeride_restore_*`, so the live
database cannot be dropped by invoking this script wrongly.

Three things about the rehearsal were found by running it against the hosted instance rather than
reasoning about it. Each one had looked like success:

- It assumed a maintenance database called `postgres` to issue `CREATE DATABASE` against. A local
  cluster has one; Aiven does not, and the drill died on `FATAL: database "postgres" does not exist`.
  `CREATE DATABASE` does not care which database you are connected to, as long as it is not the one
  being created, so the drill now uses the configured one.
- Building that URL by truncating the connection string also **threw away `?sslmode=require`**, so every
  drill connection fell back to libpq's default `prefer` and happened to negotiate TLS anyway. It keeps
  the query string now: "happened to work" is not a property to rely on.
- It reported `pg_stat_user_tables.n_live_tup`, a statistics-collector *estimate* that does not exist
  for a database that has just been restored. It printed `0` for all 22 tables — exactly what a restore
  that copied nothing looks like, which is the one thing a drill must never be unable to tell apart. It
  counts rows now.

Schedule the nightly dump with a `systemd --user` timer or a crontab entry — there is one workstation
and one person, so whatever is not scheduled will not happen. **That part is still owed: as of this
move, the dump is a command somebody has to remember to run.**

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

## Next phases (the rest of the architecture plan, with two of the four now built)

1. ~~Move `src/data/*.ts` into a real Postgres DB~~ — **done**, and the destination turned out to be
   Aiven rather than Supabase: the catalogue is read from Postgres through `src/lib/catalogue.ts`, with
   no fallback to the compile-time array. `src/data/products.ts` survives as the seed (`prisma/seed.mts`
   imports it) and as the source of the `Product`/`Category` types and `priceRange`, not as runtime data.
2. Paystack integration for the "Prepay by Transfer" option. Prepay is currently **hidden** in the
   checkout, not merely relabelled — nothing in the app contains a bank account to pay into, and an
   option that cannot be honoured is worse than no option (`src/lib/payment-options.ts`).
3. WhatsApp Business Cloud API — actual server-side send + webhook for the Confirm/Cancel buttons
   (today, checkout opens a `wa.me` link client-side, same as the prototype).
4. ~~Admin screen~~ — **done**, and not via Supabase's table editor: `/admin` is the console, reading the
   same database through `src/lib/db.ts`, with `requireAdmin()` on every mutating action.

## Deployment — Cloudflare Workers, not Pages

The app deploys to **Cloudflare Workers** through the OpenNext adapter
(`@opennextjs/cloudflare`). `wrangler.jsonc` is the Worker configuration:

```bash
npm run preview   # build + serve locally in the Workers runtime
npm run deploy    # build + deploy to Cloudflare
npm run upload    # build + upload a new version without promoting it
```

**Why Workers and not the old Pages setup.** This storefront reads Postgres through Prisma, which needs
the **Node.js** runtime. Cloudflare Pages with the now-retired `@cloudflare/next-on-pages` adapter ran the
**Edge** runtime only, so it could never serve this app. `@opennextjs/cloudflare` runs the Node runtime
on Workers — the comments at the top of `wrangler.jsonc` record the whole change.

Before the first deploy:

1. **Set the secrets.** `wrangler deploy` refuses to run until the secrets listed in `wrangler.jsonc`
   exist (`DATABASE_URL`, `ADMIN_SESSION_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD_HASH`):
   `npx wrangler secret put DATABASE_URL`, or set them in the dashboard. Never commit values.
2. **Prisma reaches Postgres through a driver adapter — done.** `src/lib/db.ts` constructs its client
   with `@prisma/adapter-pg`, and builds a fresh client per request (`maxUses: 1`), because a Worker may
   not reuse a connection across requests. The connection string comes from a **Hyperdrive** binding when
   one is configured, and falls back to `DATABASE_URL` otherwise — so the app deploys today without
   Hyperdrive, and adopting it later is just uncommenting the binding in `wrangler.jsonc` (no code change).
3. **`next/image` needs Cloudflare Images.** The `IMAGES` binding in `wrangler.jsonc` is what optimises
   product photography. If Cloudflare Images is not enabled on the account, either enable it or set
   `images: { unoptimized: true }` in `next.config.ts` — otherwise image requests fail at runtime.

`@opennextjs/cloudflare` is pinned to `1.20.5` on purpose: `next` is pinned to `16.3.5`, and OpenNext
`1.20.6+` requires `next >= 16.3.8`. To follow OpenNext upwards, bump `next` first.

## Notes on this build

- Fonts (Oswald / Inter / JetBrains Mono) are loaded via `next/font/google` — this needs normal internet
  access at build time.
- `npx tsc --noEmit` and `npx eslint .` both run clean **as of M0/M1** (0 errors, 0 warnings). They did
  not before M0: `prisma/seed.ts` imported a path that did not exist, which aborted `npm run build`
  entirely and left `npx tsc --noEmit` reporting one error. That claim was false when it was first
  written; it is true now, and `npm run verify` is what keeps it honest.
- `npm run build` must exit 0 and write `.next/BUILD_ID`. If `.next/BUILD_ID` is absent, the build never
  succeeded — a green-looking `next build` that produced no `BUILD_ID` is not a build.
- **No ISR interval is configured, and the catalogue routes are not static.** `/shop`, `/shop/<slug>`,
  `/products/[slug]`, the sitemap and every `/admin` screen declare `export const dynamic =
  "force-dynamic"`, because they read the database through `src/lib/catalogue.ts`: there is no
  compile-time constant to serve, and no period after which a cached copy would become correct. The
  freshness question is answered by push instead — a catalogue write in `/admin` calls `revalidatePath`
  on the storefront as well as the admin screen (`src/app/admin/(console)/catalogue-actions.ts`), which
  is what the comment at the top of `src/app/shop/page.tsx` records. Adding `export const revalidate`
  would be a second, weaker answer to a question that already has one.
- **The product photography file must be named to a contract, not dropped in.** `scripts/media.mjs`
  reads `footage/photos/<product-slug>-<angle>.jpg`, where `<product-slug>` is one of the seven slugs in
  `src/data/products.ts` and `<angle>` becomes the image's `alt` text (`driver` → "driver-side view").
  A file that does not match is rejected by name rather than skipped, because a silently skipped photo
  is a product that renders a placeholder and nobody notices.
