import { Crown, Heart } from "lucide-react";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { PatreonButton } from "@/components/hq/PatreonButton";
import { H2, Prose, Ul } from "@/components/hq/Prose";
import { Link } from "@/i18n/navigation";
import { playerSlug, splitName } from "@/lib/players";
import { alternates } from "@/lib/site";
import { supportConfig } from "@/lib/supporters";

export const revalidate = 3600;

const TITLE = { fr: "Soutenir FINALS HQ", en: "Support FINALS HQ" } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "fr";
  return {
    title: `${TITLE[l]} · FINALS HQ`,
    description: l === "fr" ? "FINALS HQ reste gratuit. Si le site t'est utile, soutiens-le sur Patreon et reçois le badge Supporter." : "FINALS HQ stays free. If it helps you, support it on Patreon and get the Supporter badge.",
    alternates: alternates(locale, "/support"),
  };
}

const COPY = {
  fr: {
    intro: "FINALS HQ est gratuit et le restera : classements, profils, ligne top 500 et Rating sont ouverts à tous, sans publicité. Si le site t'est utile, tu peux soutenir le projet sur Patreon.",
    join: "Rejoindre sur Patreon",
    soon: "Le palier Patreon ouvre bientôt. Reviens sur cette page dans quelques jours.",
    paidOn: "Le paiement se fait sur Patreon : FINALS HQ ne voit ni ne garde aucune donnée bancaire.",
    funds: "Ce que ça finance",
    fundsItems: ["Le temps passé à développer et maintenir le site, fait par un étudiant sur son temps libre.", "L'hébergement, le jour où les offres gratuites ne suffiront plus.", "Les prochaines fonctions : alertes, récap de fin de saison, nouveaux templates."],
    get: "Ce que tu reçois",
    getItems: ["Le badge Supporter sur ton profil et sur tes cartes de partage.", "Ton pseudo sur le mur des supporters ci-dessous, si tu le souhaites.", "Rien de plus côté données : soutenir ne débloque aucune statistique, tout le site reste le même pour tout le monde."],
    how: "Recevoir ton badge",
    howItems: ["Rejoins le palier sur Patreon.", "Envoie ton Embark ID (Pseudo#1234) en message privé sur Patreon, et dis si tu veux apparaître sur le mur.", "Le badge est ajouté à la main sous 48 h. Il part si tu arrêtes ton soutien, ou plus tôt si tu le demandes."],
    embark: "Et Embark Studios ?",
    embarkBody: "FINALS HQ est un projet de fans, non affilié à Embark Studios. Les dons vont au projet FINALS HQ, pas à Embark Studios, qui ne les reçoit pas et ne les cautionne pas. Ils ne paient aucun accès aux données du jeu : ce qui vient des classements reste gratuit.",
    wall: "Mur des supporters",
    wallEmpty: "Personne encore. Le premier nom ici, ce sera peut-être le tien.",
    creator: "Créateur",
    supporter: "Supporter",
    since: (m: string) => `depuis ${m}`,
  },
  en: {
    intro: "FINALS HQ is free and will stay free: leaderboards, profiles, the top 500 line and the Rating are open to everyone, with no ads. If the site helps you, you can support the project on Patreon.",
    join: "Join on Patreon",
    soon: "The Patreon tier opens soon. Check this page again in a few days.",
    paidOn: "Payment happens on Patreon: FINALS HQ never sees or keeps any payment data.",
    funds: "What it pays for",
    fundsItems: ["The time spent building and running the site, made by a student in his spare time.", "Hosting, once the free plans are no longer enough.", "What comes next: alerts, end-of-season recap, new templates."],
    get: "What you get",
    getItems: ["The Supporter badge on your profile and on your share cards.", "Your name on the supporters wall below, if you want.", "Nothing more on the data side: supporting unlocks no stats, the whole site stays the same for everyone."],
    how: "Getting your badge",
    howItems: ["Join the tier on Patreon.", "Send your Embark ID (Name#1234) in a private message on Patreon, and say whether you want to be on the wall.", "The badge is added by hand within 48 hours. It goes away if you stop supporting, or earlier if you ask."],
    embark: "What about Embark Studios?",
    embarkBody: "FINALS HQ is a fan project, not affiliated with Embark Studios. Donations go to the FINALS HQ project, not to Embark Studios, which neither receives nor endorses them. They do not pay for access to game data: everything that comes from the leaderboards stays free.",
    wall: "Supporters wall",
    wallEmpty: "Nobody yet. The first name here could be yours.",
    creator: "Creator",
    supporter: "Supporter",
    since: (m: string) => `since ${m}`,
  },
} as const;

/** Page Soutenir (sprint 7) : lien sortant vers le palier Patreon, ce que ça finance, le badge, la mention Embark, le mur. */
export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale === "en" ? "en" : "fr";
  const c = COPY[l];
  const cfg = supportConfig();
  const month = (m: string) => new Intl.DateTimeFormat(l === "fr" ? "fr-FR" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
  const wall = [...cfg.supporters].sort((a, b) => (a.role === b.role ? (a.since ?? "").localeCompare(b.since ?? "") : a.role === "creator" ? -1 : 1));
  return (
    <Prose title={TITLE[l]}>
      <p>{c.intro}</p>
      <section aria-label={cfg.tierName} className="grid gap-3 rounded-lg border border-accent-ink/60 bg-accent/10 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-display text-display-md uppercase">{cfg.tierName}</span>
          {cfg.tierPrice && <span className="text-body font-semibold">{cfg.tierPrice}</span>}
        </div>
        {cfg.patreonUrl ? <PatreonButton href={cfg.patreonUrl} label={c.join} className="justify-self-start" /> : <p className="text-body-sm text-text-2">{c.soon}</p>}
        <p className="text-body-sm text-text-2">{c.paidOn}</p>
      </section>
      <H2>{c.funds}</H2>
      <Ul>{c.fundsItems.map((x) => <li key={x}>{x}</li>)}</Ul>
      <H2>{c.get}</H2>
      <Ul>{c.getItems.map((x) => <li key={x}>{x}</li>)}</Ul>
      <H2>{c.how}</H2>
      <ol className="grid list-decimal gap-1.5 pl-5 marker:font-semibold marker:text-accent-ink">{c.howItems.map((x) => <li key={x}>{x}</li>)}</ol>
      <H2>{c.embark}</H2>
      <p>{c.embarkBody}</p>
      <H2 id="wall">{c.wall}</H2>
      {wall.length === 0 ? (
        <p className="text-text-2">{c.wallEmpty}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {wall.map((s) => {
            const n = splitName(s.embarkId);
            const Icon = s.role === "creator" ? Crown : Heart;
            return (
              <li key={s.embarkId} className="flex min-h-12 items-center gap-3 px-3 py-2">
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-accent-ink" strokeWidth={2} />
                <Link href={`/players/${playerSlug(s.embarkId)}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {n.base}
                  {n.tag && <span className="text-text-2">{n.tag}</span>}
                </Link>
                <span className="text-[12px] text-text-2">
                  {s.role === "creator" ? c.creator : c.supporter}
                  {s.since ? ` · ${c.since(month(s.since))}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Prose>
  );
}
