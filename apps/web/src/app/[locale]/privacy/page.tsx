import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { A, H2, Missing, Prose, Ul } from "@/components/hq/Prose";
import { Link } from "@/i18n/navigation";
import { alternates, HIDE_PROMISE_HOURS, legalIdentity } from "@/lib/site";

export const revalidate = 3600;

const TITLE = { fr: "Confidentialité", en: "Privacy" } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "fr";
  return {
    title: `${TITLE[l]} · FINALS HQ`,
    description: l === "fr" ? "Quelles données FINALS HQ traite, pourquoi, combien de temps, et comment masquer ton profil." : "What data FINALS HQ processes, why, for how long, and how to hide your profile.",
    alternates: alternates(locale, "/privacy"),
  };
}

/**
 * Politique de confidentialité (RGPD, articles 13 et 14 ; droit belge). Les pseudos des classements sont des
 * données personnelles même publiques : base légale de l'intérêt légitime, droit d'opposition par masquage
 * sous 48 h, aucun cookie de suivi, aucun compte. Identité du responsable lue dans les variables Vercel.
 */
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const id = legalIdentity();
  const controller = id.name ? (
    <>
      <strong>{id.name}</strong>
      {id.location ? `, ${id.location}` : ""}
      {id.email && (
        <>
          {" "}· <A href={`mailto:${id.email}`}>{id.email}</A>
        </>
      )}
    </>
  ) : (
    <Missing>{locale === "fr" ? "identité en cours de publication" : "identity being published"}</Missing>
  );
  const request = (
    <Link href="/privacy/request" className="font-semibold text-accent-ink underline underline-offset-2">
      {locale === "fr" ? "formulaire de masquage" : "hide request form"}
    </Link>
  );

  if (locale === "en") {
    return (
      <Prose title={TITLE.en} updated="Last updated 7 November 2026">
        <p>
          FINALS HQ is a fan project that shows the public leaderboards of THE FINALS. It has no accounts, no tracking cookies and no advertising. This page explains, in plain words, what we process and the rights you have under the GDPR.
        </p>
        <H2>Who is responsible</H2>
        <p>Data controller: {controller}. FINALS HQ is run by a private individual in Belgium, with no commercial activity at this stage.</p>
        <H2>What data, from where</H2>
        <Ul>
          <li>
            <strong>Leaderboard data</strong>: Embark name (e.g. GOJO#6255), Steam, PlayStation and Xbox names when the leaderboard shows them, club tag, rank, score and league. This data is published by Embark Studios in the game and collected every 10 minutes through the community API{" "}
            <A href="https://api.the-finals-leaderboard.com">api.the-finals-leaderboard.com</A>. We compute history, progress and the FINALS HQ Rating from it.
          </li>
          <li>
            <strong>Hide requests</strong>: the profile concerned, the contact you give us (email or Discord name) and your optional message.
          </li>
          <li>
            <strong>Audience</strong>: daily totals only (profiles viewed, share cards generated, players followed, searches without result), with no visitor identifier and no IP address. Page views are measured by Vercel Web Analytics, which uses no cookie.
          </li>
          <li>
            <strong>Technical logs</strong>: our hosting providers keep request logs (IP address, browser) for a short time for security and debugging. Errors may be sent to Sentry without personal data.
          </li>
        </Ul>
        <H2>Why, and on what legal basis</H2>
        <p>
          We publish leaderboard history and statistics so players can follow their progress and compare themselves. The legal basis is our <strong>legitimate interest</strong> (GDPR art. 6(1)(f)): the data is already made public by the game, it is limited to pseudonyms and scores, players expect to be visible on a leaderboard, and anyone can hide their profile at any time. Hide requests are processed to comply with your rights (art. 6(1)(c) and 21).
        </p>
        <H2>How long</H2>
        <Ul>
          <li>Leaderboard history: as long as the site exists, because the archive of past seasons is the purpose of the service. Detailed score changes are deleted after 8 days; only one value per day is kept.</li>
          <li>Hide requests: your contact details and message are deleted 30 days after the decision; we keep only the fact that the profile is hidden.</li>
          <li>Audience totals: 25 months at most.</li>
        </Ul>
        <H2>Who receives it</H2>
        <Ul>
          <li>Vercel Inc. (website hosting and CDN, functions in Frankfurt; USA company, EU standard contractual clauses and EU-US Data Privacy Framework).</li>
          <li>Supabase Inc. (database hosted in Frankfurt, Germany).</li>
          <li>GitHub Inc. (code and public archive of the raw API snapshots).</li>
          <li>Sentry (error reports, only if enabled, without personal data).</li>
        </Ul>
        <p>Nothing is sold, rented or shared for advertising.</p>
        <H2>On your device</H2>
        <p>
          No tracking cookie. One functional cookie, <code>hq-locale</code>, remembers your language for one year. Your theme and the players you follow are stored in your browser only (local storage) and never sent to us, except the ids needed to show their rank.
        </p>
        <H2 id="hide">Hide your profile and your rights</H2>
        <p>
          You can ask us to <strong>hide your profile</strong> with the {request}. Once your request is checked, your name disappears everywhere on the site (leaderboards, search, clubs, Rating, share cards) within <strong>{HIDE_PROMISE_HOURS} hours</strong>. We may ask for a simple proof that the account is yours, to stop someone from hiding another player.
        </p>
        <p>
          You also have the right to access, rectify, erase or restrict your data, and to object (GDPR art. 15 to 21). Write to us with the same form or at the contact above; we answer within one month. The raw snapshots archived in the public repository finals-hq-data mirror the public leaderboards as they were; you can ask for their erasure with the same form.
        </p>
        <p>
          If you think your rights are not respected, you can complain to the Belgian Data Protection Authority, rue de la Presse 35, 1000 Brussels, <A href="https://www.dataprotectionauthority.be">dataprotectionauthority.be</A>.
        </p>
      </Prose>
    );
  }

  return (
    <Prose title={TITLE.fr} updated="Mis à jour le 7 novembre 2026">
      <p>
        FINALS HQ est un projet de fans qui affiche les classements publics de THE FINALS. Pas de compte, pas de cookie de suivi, pas de publicité. Cette page explique simplement ce que nous traitons et les droits que te donne le RGPD.
      </p>
      <H2>Qui est responsable</H2>
      <p>Responsable du traitement : {controller}. FINALS HQ est édité par un particulier en Belgique, sans activité commerciale à ce stade.</p>
      <H2>Quelles données, d&apos;où</H2>
      <Ul>
        <li>
          <strong>Données des classements</strong> : pseudo Embark (par exemple GOJO#6255), pseudos Steam, PlayStation et Xbox quand le classement les affiche, tag de club, rang, score et ligue. Ces données sont publiées par Embark Studios dans le jeu et relevées toutes les 10 minutes via l&apos;API communautaire{" "}
          <A href="https://api.the-finals-leaderboard.com">api.the-finals-leaderboard.com</A>. Nous en tirons l&apos;historique, la progression et le Rating FINALS HQ.
        </li>
        <li>
          <strong>Demandes de masquage</strong> : le profil concerné, le contact que tu nous donnes (e-mail ou pseudo Discord) et ton message facultatif.
        </li>
        <li>
          <strong>Audience</strong> : des totaux par jour seulement (profils vus, cartes de partage générées, joueurs suivis, recherches sans résultat), sans identifiant de visiteur ni adresse IP. Les visites sont mesurées par Vercel Web Analytics, qui n&apos;utilise aucun cookie.
        </li>
        <li>
          <strong>Journaux techniques</strong> : nos hébergeurs gardent les journaux de requêtes (adresse IP, navigateur) peu de temps, pour la sécurité et le débogage. Les erreurs peuvent être envoyées à Sentry, sans donnée personnelle.
        </li>
      </Ul>
      <H2>Pourquoi, et sur quelle base</H2>
      <p>
        Nous publions l&apos;historique et les statistiques des classements pour que chaque joueur suive sa progression et se compare. La base légale est notre <strong>intérêt légitime</strong> (article 6.1.f du RGPD) : les données sont déjà rendues publiques par le jeu, elles se limitent à des pseudos et des scores, un joueur classé s&apos;attend à être visible, et chacun peut masquer son profil à tout moment. Les demandes de masquage sont traitées pour respecter tes droits (articles 6.1.c et 21).
      </p>
      <H2>Combien de temps</H2>
      <Ul>
        <li>Historique des classements : tant que le site existe, l&apos;archive des saisons passées étant l&apos;objet du service. Le détail des changements de score est effacé après 8 jours ; seule une valeur par jour est gardée.</li>
        <li>Demandes de masquage : ton contact et ton message sont effacés 30 jours après la décision ; seul le fait que le profil est masqué reste.</li>
        <li>Totaux d&apos;audience : 25 mois au plus.</li>
      </Ul>
      <H2>Qui les reçoit</H2>
      <Ul>
        <li>Vercel Inc. (hébergement du site et CDN, fonctions à Francfort ; société américaine, clauses contractuelles types de l&apos;UE et Data Privacy Framework UE–États-Unis).</li>
        <li>Supabase Inc. (base de données hébergée à Francfort, Allemagne).</li>
        <li>GitHub Inc. (code et archive publique des relevés bruts de l&apos;API).</li>
        <li>Sentry (rapports d&apos;erreur, seulement s&apos;il est activé, sans donnée personnelle).</li>
      </Ul>
      <p>Rien n&apos;est vendu, loué ni partagé à des fins publicitaires.</p>
      <H2>Sur ton appareil</H2>
      <p>
        Aucun cookie de suivi. Un seul cookie fonctionnel, <code>hq-locale</code>, retient ta langue pendant un an. Ton thème et les joueurs que tu suis restent dans ton navigateur (stockage local) et ne nous sont jamais envoyés, sauf les identifiants nécessaires pour afficher leur rang.
      </p>
      <H2 id="hide">Masquer ton profil et tes droits</H2>
      <p>
        Tu peux nous demander de <strong>masquer ton profil</strong> avec le {request}. Une fois ta demande vérifiée, ton pseudo disparaît partout sur le site (classements, recherche, clubs, Rating, cartes de partage) sous <strong>{HIDE_PROMISE_HOURS} heures</strong>. Nous pouvons te demander une preuve simple que le compte est le tien, pour éviter qu&apos;un joueur en masque un autre.
      </p>
      <p>
        Tu as aussi le droit d&apos;accéder à tes données, de les rectifier, de les effacer, d&apos;en limiter le traitement et de t&apos;y opposer (articles 15 à 21 du RGPD). Écris-nous avec le même formulaire ou au contact ci-dessus ; nous répondons sous un mois. Les relevés bruts archivés dans le dépôt public finals-hq-data reproduisent les classements publics tels quels ; tu peux en demander l&apos;effacement avec le même formulaire.
      </p>
      <p>
        Si tu estimes que tes droits ne sont pas respectés, tu peux introduire une plainte auprès de l&apos;Autorité de protection des données, rue de la Presse 35, 1000 Bruxelles, <A href="https://www.autoriteprotectiondonnees.be">autoriteprotectiondonnees.be</A>.
      </p>
    </Prose>
  );
}
