import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { A, H2, Prose, Ul } from "@/components/hq/Prose";
import { Link } from "@/i18n/navigation";
import { alternates } from "@/lib/site";

export const revalidate = 3600;

const TITLE = { fr: "À propos", en: "About" } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "fr";
  return {
    title: `${TITLE[l]} · FINALS HQ`,
    description: l === "fr" ? "Ce qu'est FINALS HQ, d'où viennent ses données et ce qu'il n'est pas." : "What FINALS HQ is, where its data comes from and what it is not.",
    alternates: alternates(locale, "/about"),
  };
}

const link = "font-semibold text-accent-ink underline underline-offset-2";

/** À propos : le projet, la source des données et son attribution, la non-affiliation, les liens utiles. */
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (locale === "en") {
    return (
      <Prose title={TITLE.en}>
        <p>
          FINALS HQ follows the official leaderboards of THE FINALS: every ranked player of the top 10,000, their score curve, their club, the top 500 line and a Rating that sums up level, momentum and consistency. It is made by a player, for players.
        </p>
        <H2>Where the data comes from</H2>
        <Ul>
          <li>
            Snapshots every 10 minutes from <A href="https://the-finals-leaderboard.com">the-finals-leaderboard.com</A>, a community API that mirrors Embark&apos;s leaderboards. Thanks to its maintainer.
          </li>
          <li>Every number shows the time it was taken. Anything FINALS HQ computes (deduced thresholds, projections, Rating) is labelled.</li>
          <li>
            How the Rating works: <Link href="/methodology" className={link}>Methodology</Link>. Health of the data pipeline: <Link href="/status" className={link}>Status</Link>.
          </li>
        </Ul>
        <H2>What it is not</H2>
        <p>
          FINALS HQ is a fan project, <strong>not affiliated with Embark Studios</strong>. THE FINALS is a trademark of Embark Studios AB. The site uses no logo, artwork or file from the game, and no account or game login is ever asked.
        </p>
        <H2>Your profile</H2>
        <p>
          Your profile is built from public leaderboards. You can hide it at any time: <Link href="/privacy/request" className={link}>hide my profile</Link>. Details in <Link href="/privacy" className={link}>Privacy</Link> and <Link href="/legal" className={link}>Legal notice</Link>.
        </p>
      </Prose>
    );
  }
  return (
    <Prose title={TITLE.fr}>
      <p>
        FINALS HQ suit les classements officiels de THE FINALS : chaque joueur classé du top 10 000, sa courbe de score, son club, la ligne top 500 et un Rating qui résume niveau, dynamique et régularité. Fait par un joueur, pour les joueurs.
      </p>
      <H2>D&apos;où viennent les données</H2>
      <Ul>
        <li>
          Un relevé toutes les 10 minutes depuis <A href="https://the-finals-leaderboard.com">the-finals-leaderboard.com</A>, une API communautaire qui reproduit les classements d&apos;Embark. Merci à son mainteneur.
        </li>
        <li>Chaque chiffre affiche l&apos;heure de son relevé. Tout ce que FINALS HQ calcule (seuils déduits, projections, Rating) est signalé.</li>
        <li>
          Comment le Rating est calculé : <Link href="/methodology" className={link}>Méthodologie</Link>. Santé de la collecte : <Link href="/status" className={link}>État</Link>.
        </li>
      </Ul>
      <H2>Ce que ce n&apos;est pas</H2>
      <p>
        FINALS HQ est un projet de fans, <strong>non affilié à Embark Studios</strong>. THE FINALS est une marque d&apos;Embark Studios AB. Le site n&apos;utilise aucun logo, visuel ni fichier du jeu, et ne te demande jamais de compte ni d&apos;identifiant de jeu.
      </p>
      <H2>Ton profil</H2>
      <p>
        Ton profil est construit à partir des classements publics. Tu peux le masquer à tout moment : <Link href="/privacy/request" className={link}>masquer mon profil</Link>. Détails dans <Link href="/privacy" className={link}>Confidentialité</Link> et <Link href="/legal" className={link}>Mentions légales</Link>.
      </p>
    </Prose>
  );
}
