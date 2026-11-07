import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { BottomNav, TopNav } from "@/components/hq/BottomNav";
import { FreshnessBanner } from "@/components/hq/FreshnessBanner";
import { LocaleSwitch } from "@/components/hq/LocaleSwitch";
import { SearchTrigger } from "@/components/hq/SearchTrigger";
import { themeScript, ThemeToggle } from "@/components/hq/ThemeToggle";
import { Wordmark } from "@/components/hq/Wordmark";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getFreshness } from "@/lib/data";
import { display, mono, sans } from "@/lib/fonts";
import { siteUrl, indexable } from "@/lib/site";
import type { FreshnessInfo } from "@/lib/types";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0F" },
    { media: "(prefers-color-scheme: light)", color: "#F4F4F7" },
  ],
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t("title"), template: "%s" },
    description: t("description"),
    applicationName: "FINALS HQ",
    openGraph: { siteName: "FINALS HQ", type: "website", locale: locale === "fr" ? "fr_FR" : "en_US", images: [{ url: `/api/og/site?l=${locale}`, width: 1200, height: 630, alt: "FINALS HQ" }] },
    twitter: { card: "summary_large_image" },
    icons: { icon: "/icon.svg" },
    // Indexé seulement en production sur le domaine définitif (voir lib/site.ts) : ni previews, ni *.vercel.app.
    robots: indexable() ? undefined : { index: false, follow: false },
  };
}

/**
 * Rien n'est précalculé au build : le build ne dépend jamais de la base (une base lente ou injoignable
 * ne casse plus un déploiement). Chaque page est rendue à la première visite puis servie depuis le cache ISR.
 * 60 s au plus pour tout ce qui est sous [locale], puisque le bandeau de fraîcheur est dans ce layout.
 */
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

async function freshnessOrNull(): Promise<FreshnessInfo | null> {
  try {
    return await getFreshness();
  } catch {
    return null; // le bandeau n'empêche jamais une page de s'afficher
  }
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [messages, t, tn, fresh] = await Promise.all([getMessages(), getTranslations("common"), getTranslations("nav"), freshnessOrNull()]);
  return (
    <html lang={locale} className={`dark ${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <NextIntlClientProvider messages={messages}>
          <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-toast rounded-md bg-accent px-3 py-2 font-semibold text-accent-contrast">
            {t("skip")}
          </a>
          <header className="sticky top-0 z-sticky border-b border-border bg-bg/95 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-container items-center gap-2 px-4 md:px-6 lg:px-8">
              <Link href="/" className="mr-2 inline-flex h-11 items-center" aria-label="FINALS HQ">
                <Wordmark />
              </Link>
              <TopNav />
              <div className="ml-auto flex items-center gap-1">
                <SearchTrigger />
                <LocaleSwitch />
                <ThemeToggle />
              </div>
            </div>
          </header>
          <FreshnessBanner takenAt={fresh?.takenAt ?? null} rejected24h={fresh?.rejected24h ?? 0} renderedAt={new Date().toISOString()} />
          <main id="main" className="mx-auto max-w-container px-4 pb-24 pt-4 md:px-6 lg:px-8 lg:pb-12">
            {children}
          </main>
          <footer className="border-t border-border pb-20 lg:pb-0">
            <div className="mx-auto max-w-container space-y-1 px-4 py-6 text-body-sm text-text-2 md:px-6 lg:px-8">
              <p>{t("notAffiliated")}</p>
              <p>{t("source")}</p>
              <nav aria-label={tn("footer")}>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {(["about", "support", "studio", "status", "following", "privacy", "legal"] as const).map((k) => (
                    <li key={k}>
                      <Link href={`/${k}`} className="inline-flex min-h-6 items-center underline hover:text-text">{tn(k)}</Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/privacy/request" className="inline-flex min-h-6 items-center underline hover:text-text">{tn("hide")}</Link>
                  </li>
                </ul>
              </nav>
            </div>
          </footer>
          <BottomNav />
        </NextIntlClientProvider>
        {/* Vercel Web Analytics : sans cookie ni identifiant persistant ; seulement sur Vercel (ailleurs le script n'existe pas). */}
        {process.env.VERCEL === "1" && <Analytics />}
      </body>
    </html>
  );
}
