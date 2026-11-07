import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { HideRequestForm } from "@/components/hq/HideRequestForm";
import { Prose } from "@/components/hq/Prose";
import { Link } from "@/i18n/navigation";
import { alternates, HIDE_PROMISE_HOURS } from "@/lib/site";

export const revalidate = 3600;

const TITLE = { fr: "Masquer mon profil", en: "Hide my profile" } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "fr";
  return { title: `${TITLE[l]} · FINALS HQ`, alternates: alternates(locale, "/privacy/request"), robots: { index: false, follow: true } };
}

/** Formulaire de masquage (RGPD, droit d'opposition) : la demande est vérifiée puis appliquée sous 48 h. */
export default async function HideRequestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const fr = locale !== "en";
  return (
    <Prose title={fr ? TITLE.fr : TITLE.en}>
      <p>
        {fr
          ? `Ton pseudo disparaîtra partout sur FINALS HQ (classements, recherche, clubs, Rating, cartes de partage) sous ${HIDE_PROMISE_HOURS} heures après vérification. Ton rang reste compté, pour que les autres rangs restent justes, mais sans ton nom. Tu peux demander à réapparaître plus tard par le même formulaire.`
          : `Your name will disappear everywhere on FINALS HQ (leaderboards, search, clubs, Rating, share cards) within ${HIDE_PROMISE_HOURS} hours after we check the request. Your rank still counts, so other ranks stay right, but without your name. You can ask to reappear later with the same form.`}
      </p>
      <HideRequestForm />
      <p className="text-body-sm text-text-2">
        {fr ? "Ce que nous faisons de ces informations : " : "What we do with this information: "}
        <Link href="/privacy#hide" className="font-semibold text-accent-ink underline underline-offset-2">
          {fr ? "confidentialité" : "privacy"}
        </Link>
        {fr ? ". Ton contact est effacé 30 jours après la décision." : ". Your contact details are deleted 30 days after the decision."}
      </p>
    </Prose>
  );
}
