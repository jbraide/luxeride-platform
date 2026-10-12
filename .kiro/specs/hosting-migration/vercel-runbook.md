# Vercel runbook — moving the app off the Cloudflare Worker

Why: Cloudflare Workers cap an isolate at 128 MB and the cap cannot be raised. Admin
pages were rendering on isolates that were also serving ad traffic, and the two together
exceeded it (Error 1102). Vercel runs the same Next.js app as a Node function with a real
memory budget, so the ceiling disappears.

The app is already Node-ready: `src/lib/db.ts` takes its Node branch when it is not on
Workers, `package.json` has `next start`, and `vercel.json` pins the runtime settings.
Nothing about the storefront or the admin changes; only where it runs.

## 1. Import the project

- Vercel → **Add New → Project → Import Git Repository** → choose `jbraide/luxeride-platform`.
- **Root Directory: `luxeride-web`** (the Next app is a subdirectory of the repo — this
  is the single most common way this deploy fails).
- Framework preset: **Next.js** (auto-detected). Build command comes from `vercel.json`
  (`npm run build`), which includes the media check.

## 2. Environment variables (Production **and** Preview)

Set these in **Settings → Environment Variables**. Values are never committed.

| Name | Value | Secret? |
|---|---|---|
| `DATABASE_URL` | Supabase **connection pooler**, see below | yes |
| `ADMIN_SESSION_SECRET` | same value as the Worker today | yes |
| `ADMIN_USER` | same | yes |
| `ADMIN_PASSWORD_HASH` | same (rotating it logs everyone out) | yes |
| `NEXT_PUBLIC_SITE_URL` | `https://luxerideautos.com.ng` | no |
| `NEXT_PUBLIC_META_PIXEL_ID` | same as today (inlined at build) | no |

### `DATABASE_URL` — use the pooler, not the direct host

Vercel functions are IPv4 and the Supabase **direct** host (`db.<ref>.supabase.co`) is
IPv6-only, so the direct string will time out. Use the **transaction pooler**:

```
postgresql://postgres.<ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require
```

- Port **6543** (transaction mode), not 5432.
- `pgbouncer=true` and `connection_limit=1` are required for Prisma behind a pooler;
  `db.ts` also forces `connection_limit=1` on Vercel, so the two agree.
- `sslmode=require` is read with libpq semantics by Prisma's engine on Node, so the
  certificate is not over-verified. No `uselibpqcompat` is needed here (that flag is a
  `pg`-driver concern, and Node uses the Prisma engine).

## 3. Deploy and smoke it

- Deploy. Vercel gives a `*.vercel.app` URL.
- Check, in order: `/` (200), `/shop` (200), one product page (200), `/admin` (307 to
  login, not 500), log in, open `/admin/vehicles` and `/admin/layouts`.
- Watch the function logs for `[luxeride/db] connecting to … (from DATABASE_URL)` — it
  should name the pooler host, not `localhost`.

## 4. Point the domain

- Vercel → **Settings → Domains → Add** `luxerideautos.com.ng` and `www`.
- Two ways to switch, pick one:
  - **Keep Cloudflare in front (recommended for now):** add a DNS record in Cloudflare
    pointing the hostname at Vercel (`cname.vercel-dns.com`), keep the orange cloud on.
    Cloudflare keeps serving cached static assets from its Lagos/Port Harcourt PoPs, so
    Nigerian users keep most of the edge benefit while the app runs on Vercel.
  - **Move DNS to Vercel:** change the nameservers, or point the records at Vercel and
    turn the Cloudflare proxy off. Simpler, but loses the edge cache.

## 5. Rollback

The Cloudflare Worker is **not** deleted. If Vercel misbehaves, point the domain back at
the Worker (`npx wrangler deployments list` then `rollback` if needed). The database is
untouched either way — both hosts read the same Supabase instance.

## Not done by this change

- No schema change and no migration. Do **not** run `prisma migrate`/`db push` here.
- The Cloudflare Worker stays deployed as the rollback path for 7 days.
- The site-wide edge cache rule (to shed load) is no longer needed once Vercel is serving
  the app, because the memory ceiling it was working around no longer exists.
