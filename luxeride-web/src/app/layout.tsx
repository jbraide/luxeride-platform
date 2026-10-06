import { Suspense } from "react";
import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import PublicChrome from "@/components/PublicChrome";
import { listCategories } from "@/lib/catalogue";
import { getHeroLayout } from "@/lib/settings";
import Footer from "@/components/Footer";
import AnnouncementBar from "@/components/AnnouncementBar";
import JsonLd from "@/components/JsonLd";
import Analytics from "@/components/Analytics";
import PageView from "@/components/PageView";
import CampaignCapture from "@/components/CampaignCapture";
import { organizationJsonLd } from "@/lib/seo";
import { SITE_LOCALE, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * THE DISPLAY FACE — Fraunces, replacing Oswald.
 *
 * Oswald is a condensed grotesque: a signage face, built to be squeezed into a
 * billboard, and at heading sizes on a screen it reads as software. The owner's words
 * were that the site should be "premium and highend not robotic/techy", and this one
 * font was the largest contributor.
 *
 * Fraunces is a variable serif with an optical-size axis, so it is a single family
 * that behaves at both 48px and 15px. Its weight axis is left open rather than pinned
 * to three weights — the range is what makes it feel typeset rather than defaulted.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  // Without this, every relative og:image is a build error, and every canonical
  // would be relative too. `src/lib/site.ts` throws at module load if it is unset.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LuxeRide Nigeria — Custom-Fit Car Accessories",
    template: "%s | LuxeRide",
  },
  description:
    "Laser-measured TPE mats, seat covers, cargo liners and more — fitted to your exact car.",
  applicationName: SITE_NAME,
  // NOTE: no `alternates.canonical` here on purpose. A nested object in the root
  // layout is inherited by every child that does not override it, which would
  // stamp the site root as the canonical for every page in the site. Each page
  // builds its own self-referencing canonical via pageMetadata().
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

/**
 * Async for two reasons.
 *
 * 1. The mobile menu lists the shop's categories, and since 2026-10-04 those come from
 *    the database. `Header` is a Client Component and cannot read Postgres, so the
 *    outermost Server Component above it loads the list once and hands it down. Every
 *    other route on the site reads its own slice independently.
 *
 * 2. THE HERO LAYOUT, and it has to be HERE rather than on the homepage.
 *
 *    `data-hero` drives the `.hero-shell` rules in `globals.css`, and every one of them
 *    is written as a DESCENDANT selector — `[data-hero="full"] .hero-copy`. That only
 *    works if the attribute is on an ANCESTOR of the hero. It used to be set on the
 *    hero's own `<section>`, so none of the rules could match it: `side` and `full`
 *    silently did nothing and every layout rendered as the same single column.
 *
 *    Putting it on `<html>` makes those selectors true and puts the switch where the
 *    stylesheet says it is. The cost is one extra indexed read per storefront render —
 *    the same cost the category list above already pays, and the reason it is not
 *    cached is recorded in `src/lib/settings.ts`: it changes when somebody clicks Save.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [categories, heroLayout] = await Promise.all([listCategories(), getHeroLayout()]);
  return (
    <html
      lang="en"
      data-hero={heroLayout}
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      {/*
        THE THEME, APPLIED BEFORE FIRST PAINT.

        An inline script rather than an effect in `ThemeToggle`, and the reason is not
        preference: a theme set from `useEffect` applies AFTER the first paint, so
        every light-mode visitor sees a full flash of the dark site on every single page
        load. Reading the stored value synchronously in `<head>` means the attribute is
        on `<html>` before any CSS is applied.

        It is deliberately tiny and wrapped in try/catch — `localStorage` throws in
        private browsing on some browsers, and a theme script that throws would blank
        the page rather than fail to recolour it. Failing dark is the safe default.
      */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("luxeride-theme");' +
              'if(t!=="light"&&t!=="dark"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}' +
              'document.documentElement.setAttribute("data-theme",t);}catch(e){}',
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans antialiased bg-bg text-fg">
        <JsonLd data={organizationJsonLd()} />
        {/* Analytics is registry-driven: it renders no script tag when a
            provider's env var is absent. PageView must be inside Suspense
            because `/` is statically prerendered and it calls useSearchParams.
            CampaignCapture is outside that boundary so capture is never gated
            on it. */}
        <Analytics />
        <CampaignCapture />
        <Suspense fallback={null}>
          <PageView />
        </Suspense>
        {/* Non-sticky and above the header, so the sticky header needs no
            offset. Three items, all from the copy register. */}
        {/* Everything inside `PublicChrome` disappears under `/admin`, which is what
            gives the console its own shell: no customer header, no cart badge, no
            shop menu, no footer. The children stay server-rendered — `<Footer>` reads
            the catalogue from Postgres and must not become a client component. See
            the header of that file for why this is not a route group. */}
        <PublicChrome>
          <AnnouncementBar />
          {/* The categories, loaded here because this is the outermost Server
              Component above a Client Component that needs them. The mobile menu is
              the only surface that lists the catalogue's top level on every page, so
              this is one catalogue read per storefront route — the cost of the
              database being the authority, paid once rather than per-surface.

              It also runs on admin routes, where the result is discarded by
              `PublicChrome`. Five rows, indexed, and the alternative is restructuring
              every route in the app into a route group to save one indexed query.
              Recorded here rather than left to be discovered. */}
          <Header categories={categories} />
        </PublicChrome>
        <main className="flex-1">{children}</main>
        <PublicChrome>
          <Footer />
        </PublicChrome>
      </body>
    </html>
  );
}
