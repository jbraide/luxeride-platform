import type { Metadata } from "next";
import { Oswald, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import { organizationJsonLd } from "@/lib/seo";
import { SITE_LOCALE, SITE_NAME, SITE_URL } from "@/lib/site";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${oswald.variable} ${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-sans antialiased bg-ink text-white">
        <JsonLd data={organizationJsonLd()} />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
