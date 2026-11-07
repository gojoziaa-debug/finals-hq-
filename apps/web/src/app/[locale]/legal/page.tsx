import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { A, H2, Missing, Prose } from "@/components/hq/Prose";
import { Link } from "@/i18n/navigation";
import { alternates, legalIdentity } from "@/lib/site";

export const revalidate = 3600;

const TITLE = { fr: "Mentions légales", en: "Legal notice" } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "fr";
  return { title: `${TITLE[l]} · FINALS HQ`, alternates: alternates(locale, "/legal") };
}

/** Mentions légales : éditeur (variables Vercel LEGAL_*), hébergeurs, propriété intellectuelle, non-affiliation. */
export default async function LegalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const id = legalIdentity();
  const fr = locale !== "en";
  const missing = <Missing>{fr ? "à compléter" : "to be completed"}</Missing>;
  const t = fr
    ? {
        editor: "Éditeur",
        editorBody: "Site gratuit, sans publicité ni vente, édité à titre personnel (les dons volontaires passent par Patreon) par",
        contact: "Contact",
        hosting: "Hébergement",
        site: "Site : Vercel Inc., San Francisco, États-Unis (vercel.com), fonctions exécutées à Francfort.",
        db: "Base de données : Supabase Inc. (supabase.com), région Francfort, Allemagne.",
        code: "Code et archive des relevés : GitHub Inc. (github.com).",
        ip: "Propriété intellectuelle",
        ipBody: "THE FINALS est une marque d'Embark Studios AB. FINALS HQ est un projet de fans indépendant, non affilié à Embark Studios, ni soutenu ni approuvé par Embark Studios. Le site n'utilise aucun logo, visuel ni fichier du jeu. Les données de classement appartiennent à leurs éditeurs ; elles proviennent de l'API communautaire api.the-finals-leaderboard.com.",
        data: "Données personnelles",
        dataBody: "Voir la page",
        privacy: "Confidentialité",
        liability: "Responsabilité",
        liabilityBody: "Les données sont reprises telles que publiées, avec l'heure de chaque relevé. Les valeurs calculées par FINALS HQ (seuils déduits, projections, Rating) sont signalées comme telles et peuvent contenir des erreurs ; signale-les via le contact ci-dessus.",
      }
    : {
        editor: "Publisher",
        editorBody: "Free site, with no ads and nothing for sale, published privately (voluntary donations go through Patreon) by",
        contact: "Contact",
        hosting: "Hosting",
        site: "Website: Vercel Inc., San Francisco, USA (vercel.com), functions running in Frankfurt.",
        db: "Database: Supabase Inc. (supabase.com), Frankfurt region, Germany.",
        code: "Code and snapshot archive: GitHub Inc. (github.com).",
        ip: "Intellectual property",
        ipBody: "THE FINALS is a trademark of Embark Studios AB. FINALS HQ is an independent fan project, not affiliated with, endorsed or approved by Embark Studios. The site uses no logo, artwork or file from the game. Leaderboard data belongs to its publishers; it comes from the community API api.the-finals-leaderboard.com.",
        data: "Personal data",
        dataBody: "See the page",
        privacy: "Privacy",
        liability: "Liability",
        liabilityBody: "Data is shown as published, with the time of each snapshot. Values computed by FINALS HQ (deduced thresholds, projections, Rating) are marked as such and may contain errors; report them through the contact above.",
      };
  return (
    <Prose title={fr ? TITLE.fr : TITLE.en}>
      <H2>{t.editor}</H2>
      <p>
        {t.editorBody} {id.name ? <strong>{id.name}</strong> : missing}
        {id.location ? `, ${id.location}` : ""}.
      </p>
      <p>
        {t.contact} : {id.email ? <A href={`mailto:${id.email}`}>{id.email}</A> : missing}
      </p>
      <H2>{t.hosting}</H2>
      <p>{t.site}</p>
      <p>{t.db}</p>
      <p>{t.code}</p>
      <H2>{t.ip}</H2>
      <p>{t.ipBody}</p>
      <H2>{t.liability}</H2>
      <p>{t.liabilityBody}</p>
      <H2>{t.data}</H2>
      <p>
        {t.dataBody}{" "}
        <Link href="/privacy" className="font-semibold text-accent-ink underline underline-offset-2">
          {t.privacy}
        </Link>
        .
      </p>
    </Prose>
  );
}
