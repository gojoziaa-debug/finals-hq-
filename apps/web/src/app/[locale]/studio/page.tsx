import { Download } from "lucide-react";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { buttonClasses } from "@/components/hq/Button";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/format";
import { playerSlug } from "@/lib/players";
import { alternates } from "@/lib/site";
import type { MoverWindow } from "@/lib/types";
import { maxSteps, VIDEO_WINDOWS, videoPath, type VideoCount, type VideoKind, type VideoParams } from "@/lib/video";

export const dynamic = "force-dynamic";

const TITLE = { fr: "Studio", en: "Studio" } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "fr";
  return {
    title: `${TITLE[l]} · FINALS HQ`,
    description: l === "fr" ? "Templates vidéo 9:16 « data → edit » : progressions, duel et ligne top 500 en images 1080×1920." : "9:16 “data → edit” video templates: movers, duel and top 500 line as 1080×1920 images.",
    alternates: alternates(locale, "/studio"),
    robots: { index: false, follow: true },
  };
}

const COPY = {
  fr: {
    intro: "Des images 1080×1920 tirées des derniers relevés, prêtes à poser dans ton logiciel de montage (Premiere, After Effects, CapCut, DaVinci). Elles se mettent à jour toutes les 10 minutes.",
    tips: [
      "Fond transparent : PNG avec couche alpha, à poser au-dessus d'une séquence de jeu.",
      "Étapes : la mise en page ne bouge pas d'une image à l'autre, seules les cases se remplissent. Empile-les sur ta timeline pour une révélation sans recaler les calques.",
      "Zones sûres : le contenu évite le haut, la droite et le bas, masqués par l'interface de TikTok et des Reels. Coche « Zones sûres » pour les voir en rouge sur l'aperçu (jamais sur les fichiers téléchargés).",
    ],
    options: "Réglages",
    lang: "Langue des images",
    bg: "Fond",
    solid: "Plein",
    transparent: "Transparent",
    safe: "Zones sûres sur l'aperçu",
    apply: "Appliquer",
    movers: "Progressions",
    moversHint: "Le top des plus fortes progressions (ou chutes), révélé de la dernière place à la première.",
    window: "Période",
    windows: { "24h": "24 h", "7d": "7 jours", season: "Depuis le début" } as Record<MoverWindow, string>,
    dir: "Sens",
    up: "Progressions",
    down: "Chutes",
    count: "Nombre",
    duel: "Duel",
    duelHint: "Deux joueurs face à face. Laisse vide pour le n°1 contre le n°2 du classement en direct.",
    p1: "Joueur 1 (Embark ID)",
    p2: "Joueur 2 (Embark ID)",
    cutoff: "Ligne top 500",
    cutoffHint: "Le RS du 500e, sa variation, sa courbe sur 7 jours et la projection calculée par FINALS HQ.",
    full: "Image complète",
    step: (n: number) => `Étape ${n}`,
    steps: "Étapes",
    preview: (name: string) => `Aperçu du template ${name}`,
    rights: "Les données viennent des classements publics. Garde la mention « non affilié à Embark Studios » présente sur chaque image.",
  },
  en: {
    intro: "1080×1920 images built from the latest snapshots, ready to drop into your editing software (Premiere, After Effects, CapCut, DaVinci). They refresh every 10 minutes.",
    tips: [
      "Transparent background: PNG with an alpha channel, to place over gameplay footage.",
      "Steps: the layout never moves from one image to the next, only the boxes fill in. Stack them on your timeline for a reveal without realigning layers.",
      "Safe zones: content avoids the top, right and bottom, covered by the TikTok and Reels interface. Tick “Safe zones” to see them in red on the preview (never on downloaded files).",
    ],
    options: "Settings",
    lang: "Image language",
    bg: "Background",
    solid: "Solid",
    transparent: "Transparent",
    safe: "Safe zones on the preview",
    apply: "Apply",
    movers: "Movers",
    moversHint: "The biggest climbs (or drops), revealed from last place to first.",
    window: "Period",
    windows: { "24h": "24h", "7d": "7 days", season: "Since the start" } as Record<MoverWindow, string>,
    dir: "Direction",
    up: "Climbs",
    down: "Drops",
    count: "Count",
    duel: "Duel",
    duelHint: "Two players head to head. Leave empty for #1 vs #2 of the live leaderboard.",
    p1: "Player 1 (Embark ID)",
    p2: "Player 2 (Embark ID)",
    cutoff: "Top 500 line",
    cutoffHint: "The 500th player's RS, its change, its 7-day curve and the FINALS HQ projection.",
    full: "Full image",
    step: (n: number) => `Step ${n}`,
    steps: "Steps",
    preview: (name: string) => `Preview of the ${name} template`,
    rights: "Data comes from the public leaderboards. Keep the “not affiliated with Embark Studios” line that every image carries.",
  },
} as const;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const EMBARK_ID = /^.{1,40}#\d{4}$/;

const field = "h-11 rounded-md border border-border-strong bg-surface px-3 text-body-sm text-text";
const label = "grid gap-1 text-body-sm font-medium";

/**
 * Studio (sprint 7) : les trois templates vidéo, leurs réglages (formulaire GET, sans JavaScript) et les liens de
 * téléchargement, image complète et étape par étape. Les images sont rendues par /api/og/video/….
 */
export default async function StudioPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SP> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const pageLocale = locale === "en" ? "en" : "fr";
  const c = COPY[pageLocale];
  const sp = await searchParams;
  const imgLocale: Locale = one(sp.l) === "en" ? "en" : one(sp.l) === "fr" ? "fr" : pageLocale;
  const bg: VideoParams["bg"] = one(sp.bg) === "transparent" ? "transparent" : "solid";
  const safe = one(sp.safe) === "1";
  const w = (VIDEO_WINDOWS as string[]).includes(one(sp.w)) ? (one(sp.w) as MoverWindow) : "7d";
  const dir = one(sp.dir) === "down" ? "down" : "up";
  const count: VideoCount = one(sp.n) === "3" ? 3 : 5;
  const a = one(sp.a).trim();
  const b = one(sp.b).trim();
  const players = EMBARK_ID.test(a) && EMBARK_ID.test(b) ? [a, b].map((x) => decodeURIComponent(playerSlug(x))) : [];

  const base = { locale: imgLocale, bg, window: w, dir, count, players } as const;
  const templates: Array<{ kind: VideoKind; title: string; hint: string }> = [
    { kind: "movers", title: c.movers, hint: c.moversHint },
    { kind: "duel", title: c.duel, hint: c.duelHint },
    { kind: "cutoff", title: c.cutoff, hint: c.cutoffHint },
  ];
  const radio = (name: string, value: string, checked: boolean, text: string) => (
    <label key={value} className="inline-flex min-h-11 items-center gap-2 text-body-sm">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="h-4 w-4 accent-[rgb(var(--accent))]" />
      {text}
    </label>
  );

  return (
    <div className="grid grid-cols-1 gap-5">
      <header className="grid gap-2">
        <h1 className="font-display text-display-xl uppercase">{TITLE[pageLocale]}</h1>
        <p className="max-w-prose text-body-sm text-text-2">{c.intro}</p>
        <ul className="grid max-w-prose list-disc gap-1 pl-5 text-body-sm text-text-2 marker:text-text-3">
          {c.tips.map((x) => <li key={x}>{x}</li>)}
        </ul>
      </header>

      <form method="get" className="grid gap-4 rounded-lg border border-border bg-surface p-4" aria-label={c.options}>
        <h2 className="text-title">{c.options}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <fieldset className="grid gap-1">
            <legend className="text-body-sm font-medium">{c.lang}</legend>
            <div className="flex gap-4">{radio("l", "fr", imgLocale === "fr", "Français")}{radio("l", "en", imgLocale === "en", "English")}</div>
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="text-body-sm font-medium">{c.bg}</legend>
            <div className="flex gap-4">{radio("bg", "solid", bg === "solid", c.solid)}{radio("bg", "transparent", bg === "transparent", c.transparent)}</div>
          </fieldset>
          <label className="inline-flex min-h-11 items-center gap-2 self-end text-body-sm">
            <input type="checkbox" name="safe" value="1" defaultChecked={safe} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            {c.safe}
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className={label}>
            {`${c.movers} · ${c.window}`}
            <select name="w" defaultValue={w} className={field}>
              {VIDEO_WINDOWS.map((x) => <option key={x} value={x}>{c.windows[x]}</option>)}
            </select>
          </label>
          <label className={label}>
            {`${c.movers} · ${c.dir}`}
            <select name="dir" defaultValue={dir} className={field}>
              <option value="up">{c.up}</option>
              <option value="down">{c.down}</option>
            </select>
          </label>
          <label className={label}>
            {`${c.movers} · ${c.count}`}
            <select name="n" defaultValue={String(count)} className={field}>
              <option value="5">5</option>
              <option value="3">3</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={label}>
            {c.p1}
            <input name="a" defaultValue={a} placeholder="GOJO#6255" autoComplete="off" spellCheck={false} className={field} />
          </label>
          <label className={label}>
            {c.p2}
            <input name="b" defaultValue={b} placeholder="Name#1234" autoComplete="off" spellCheck={false} className={field} />
          </label>
        </div>
        <button type="submit" className={cn(buttonClasses.base, buttonClasses.primary, "justify-self-start")}>{c.apply}</button>
      </form>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {templates.map(({ kind, title, hint }) => {
          const steps = maxSteps(kind, count);
          return (
            <section key={kind} aria-labelledby={`tpl-${kind}`} className="grid content-start gap-3 rounded-lg border border-border bg-surface p-4">
              <h2 id={`tpl-${kind}`} className="font-display text-display-md uppercase">{title}</h2>
              <p className="text-body-sm text-text-2">{hint}</p>
              {/* Aperçu à 1/4 : l'image réelle fait 1080×1920. Damier sous le fond transparent pour le rendre visible. */}
              <div className={cn("overflow-hidden rounded-md border border-border", bg === "transparent" && "bg-[repeating-conic-gradient(#3a3a46_0%_25%,#1c1c24_0%_50%)] bg-[length:24px_24px]")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={videoPath({ ...base, kind, safe })} alt={c.preview(title)} width={1080} height={1920} loading="lazy" className="block h-auto w-full" />
              </div>
              <a href={videoPath({ ...base, kind, download: true })} className={cn(buttonClasses.base, buttonClasses.secondary)}>
                <Download aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                {c.full}
              </a>
              <div className="grid gap-1.5">
                <span className="text-body-sm font-medium">{c.steps}</span>
                <ul className="flex flex-wrap gap-1.5">
                  {Array.from({ length: steps }, (_, i) => i + 1).map((s) => (
                    <li key={s}>
                      <a href={videoPath({ ...base, kind, step: s, download: true })} className="inline-flex h-9 items-center rounded-full border border-border px-3 text-body-sm font-medium text-text-2 hover:text-text">{c.step(s)}</a>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-[12px] text-text-2">{c.rights}</p>
    </div>
  );
}
