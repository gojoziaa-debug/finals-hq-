import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FollowingList } from "@/components/hq/FollowingList";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("followingTitle"), robots: { index: false, follow: true } };
}

/** Suivi : la liste vit dans le navigateur ; la page est statique et charge l'état des joueurs côté client. */
export default async function FollowingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("following");
  return (
    <div className="grid grid-cols-1 gap-4">
      <header>
        <h1 className="font-display text-display-xl">{t("title")}</h1>
        <p className="mt-1 max-w-prose text-body-sm text-text-2">{t("intro")}</p>
      </header>
      <FollowingList />
    </div>
  );
}
