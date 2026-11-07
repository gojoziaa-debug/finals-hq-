import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ClubSummary } from "./clubs";
import { formatDateTime, formatNumber, formatRank, formatSigned, type Locale } from "./format";
import { league as leagueOf, type LeagueTier } from "./league";
import { splitName } from "./players";

/**
 * Cartes de partage (sprint 6) : 1200×630 pour Discord, X, WhatsApp (Open Graph) et 1080×1920 pour les stories.
 * Rendu par next/og (Satori) avec les polices du site, auto-hébergées dans assets/og-fonts (licence OFL).
 * Couleurs du thème sombre de la phase E, palette Volt. Aucune donnée inventée : chaque carte porte l'heure du relevé.
 */
export type CardFormat = "og" | "story";
export const SIZES: Record<CardFormat, { width: number; height: number }> = { og: { width: 1200, height: 630 }, story: { width: 1080, height: 1920 } };

/** 10 min au CDN (phase F : économiser les fonctions), puis resservie pendant le recalcul. */
export const CARD_CACHE = "public, max-age=600, s-maxage=600, stale-while-revalidate=3600";

const C = {
  bg: "#0B0B0F",
  surface: "#14141A",
  raised: "#1C1C24",
  border: "#2A2A35",
  text: "#F2F2F5",
  text2: "#A0A0AD",
  text3: "#6B6B7A",
  volt: "#D7FF3C",
  up: "#3DDC84",
  down: "#FF5C5C",
};
const LEAGUE: Record<LeagueTier, string> = { bronze: "#C47A3A", silver: "#A9B4C2", gold: "#F2C14E", platinum: "#2FD1C6", diamond: "#7AA2FF", ruby: "#FF4D6A" };

type FontDef = { name: string; data: ArrayBuffer; weight: 500 | 600 | 700 | 800; style: "normal" };
let fontsPromise: Promise<FontDef[]> | null = null;

function loadFonts(): Promise<FontDef[]> {
  if (!fontsPromise) {
    const dir = join(process.cwd(), "assets", "og-fonts");
    const files: Array<[string, string, FontDef["weight"]]> = [
      ["Display", "barlow-condensed-latin-800-normal.woff", 800],
      ["Display", "barlow-condensed-latin-ext-800-normal.woff", 800],
      ["Display", "barlow-condensed-latin-700-normal.woff", 700],
      ["Sans", "inter-latin-500-normal.woff", 500],
      ["Sans", "inter-latin-600-normal.woff", 600],
      ["Sans", "inter-latin-ext-500-normal.woff", 500],
      ["Sans", "inter-latin-ext-600-normal.woff", 600],
      ["Sans", "inter-cyrillic-500-normal.woff", 500],
      ["Sans", "inter-cyrillic-600-normal.woff", 600],
      ["Mono", "jetbrains-mono-latin-500-normal.woff", 500],
    ];
    fontsPromise = Promise.all(
      files.map(async ([name, file, weight]) => {
        const buf = await readFile(join(dir, file));
        return { name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: "normal" as const };
      }),
    ).catch((error) => {
      fontsPromise = null;
      throw error;
    });
  }
  return fontsPromise;
}

const T = {
  fr: { rank: "Rang", rs: "RS", league: "Ligue", d24: "24 h", d7: "7 j", outside: "Hors du top 10 000", takenAt: "Relevé", notAffiliated: "Projet de fans, non affilié à Embark Studios", members: "Membres classés", avg: "RS moyen", best: "Meilleur rang", top500: "Dans le top 500", club: "Club", tagline: "Classements, profils et ligne top 500 de THE FINALS, relevés toutes les 10 minutes.", season: "Ranked · Saison 12", vs: "VS", unknown: "n/d" },
  en: { rank: "Rank", rs: "RS", league: "League", d24: "24h", d7: "7d", outside: "Outside the top 10,000", takenAt: "Taken", notAffiliated: "Fan project, not affiliated with Embark Studios", members: "Ranked members", avg: "Average RS", best: "Best rank", top500: "In the top 500", club: "Club", tagline: "THE FINALS leaderboards, profiles and top 500 line, refreshed every 10 minutes.", season: "Ranked · Season 12", vs: "VS", unknown: "n/a" },
} as const;

export interface PlayerCard {
  name: string;
  rank: number | null;
  score: number | null;
  league: number | null;
  club: string | null;
  d24: number | null;
  d7: number | null;
  /** Scores chronologiques pour la courbe (nulls = hors classement, ignorés). */
  series: Array<number | null>;
  takenAt: string | null;
}

export interface ClubCard {
  tag: string;
  name: string | null;
  summary: ClubSummary;
  topNames: string[];
  takenAt: string | null;
}

function host(siteUrl: string): string {
  try {
    return new URL(siteUrl).host;
  } catch {
    return "finals-hq";
  }
}

function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: size, letterSpacing: 1, color: C.text, lineHeight: 1 }}>
      FINALS<span style={{ color: C.volt, marginLeft: size * 0.22 }}>HQ</span>
    </div>
  );
}

function Footer({ locale, takenAt, siteUrl, size }: { locale: Locale; takenAt: string | null; siteUrl: string; size: number }) {
  const t = T[locale];
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontFamily: "Sans", fontWeight: 500, fontSize: size, color: C.text2 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: size * 0.3 }}>
        {takenAt && <span>{`${t.takenAt} ${formatDateTime(new Date(takenAt), locale, "UTC")}`}</span>}
        <span style={{ color: C.text3, fontSize: size * 0.85 }}>{t.notAffiliated}</span>
      </div>
      <span style={{ fontFamily: "Mono", color: C.volt }}>{host(siteUrl)}</span>
    </div>
  );
}

function Stat({ label, value, color, size }: { label: string; value: string; color?: string; size: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: size * 0.12 }}>
      <span style={{ fontFamily: "Sans", fontWeight: 600, fontSize: size * 0.32, color: C.text2, textTransform: "uppercase", letterSpacing: 2 }}>{label}</span>
      <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: size, color: color ?? C.text, lineHeight: 1 }}>{value}</span>
    </div>
  );
}

function deltaColor(v: number | null) {
  return v === null || v === 0 ? C.text2 : v > 0 ? C.up : C.down;
}

/** Courbe RS : polyligne Volt sur les points connus, mise à l'échelle sur min–max. */
function Spark({ series, width, height }: { series: Array<number | null>; width: number; height: number }) {
  const pts = series.map((s, i) => [i, s] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 6;
  const sx = (x: number) => pad + ((x - x0) / Math.max(1, x1 - x0)) * (width - 2 * pad);
  const sy = (y: number) => height - pad - ((y - y0) / Math.max(1, y1 - y0)) * (height - 2 * pad);
  const line = pts.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  const area = `${sx(x0).toFixed(1)},${height} ${line} ${sx(x1).toFixed(1)},${height}`;
  const last = pts[pts.length - 1]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polygon points={area} fill="rgba(215,255,60,0.10)" />
      <polyline points={line} fill="none" stroke={C.volt} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(last[0])} cy={sy(last[1])} r={7} fill={C.volt} />
    </svg>
  );
}

/** Taille du pseudo selon sa longueur : un pseudo de 20 caractères tient sur une ligne. */
function nameSize(base: string, max: number): number {
  const n = [...base].length;
  return Math.round(n <= 8 ? max : n <= 12 ? max * 0.8 : n <= 16 ? max * 0.64 : max * 0.5);
}

function Frame({ format, children }: { format: CardFormat; children: React.ReactNode }) {
  const { width, height } = SIZES[format];
  const pad = format === "og" ? 56 : 88;
  return (
    <div style={{ width, height, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: pad, background: C.bg, color: C.text, fontFamily: "Sans", position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width, height: 8, background: C.volt, display: "flex" }} />
      {children}
    </div>
  );
}

function LeagueChip({ league: n, size }: { league: number | null; size: number }) {
  const l = leagueOf(n);
  if (!l) return null;
  const color = LEAGUE[l.tier];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.35, fontFamily: "Display", fontWeight: 800, fontSize: size, color, textTransform: "uppercase" }}>
      <div style={{ display: "flex", width: size * 0.55, height: size * 0.55, borderRadius: 4, background: color, transform: "rotate(45deg)" }} />
      {l.name}
    </div>
  );
}

export function playerCard(card: PlayerCard, locale: Locale, format: CardFormat, siteUrl: string) {
  const t = T[locale];
  const { base, tag } = splitName(card.name);
  const story = format === "story";
  const ranked = card.rank !== null && card.score !== null;
  const nameMax = story ? 190 : 132;
  const statSize = story ? 112 : 76;
  const stats = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: story ? 72 : 56, rowGap: story ? 56 : 24 }}>
      <Stat label={t.rank} value={ranked ? formatRank(card.rank!, locale) : "—"} color={C.volt} size={statSize} />
      <Stat label={t.rs} value={ranked ? formatNumber(card.score!, locale) : "—"} size={statSize} />
      {card.d24 !== null && <Stat label={t.d24} value={formatSigned(card.d24, locale)} color={deltaColor(card.d24)} size={statSize * 0.72} />}
      {card.d7 !== null && <Stat label={t.d7} value={formatSigned(card.d7, locale)} color={deltaColor(card.d7)} size={statSize * 0.72} />}
    </div>
  );
  return (
    <Frame format={format}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={story ? 64 : 44} />
        <span style={{ fontFamily: "Sans", fontWeight: 600, fontSize: story ? 32 : 22, color: C.text2, textTransform: "uppercase", letterSpacing: 2 }}>{t.season}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: story ? 40 : 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: nameSize(base, nameMax), lineHeight: 0.95, textTransform: "uppercase" }}>{base}</span>
          {tag && <span style={{ fontFamily: "Mono", fontWeight: 500, fontSize: story ? 56 : 36, color: C.text2 }}>{tag}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {ranked ? <LeagueChip league={card.league} size={story ? 60 : 38} /> : <span style={{ fontFamily: "Display", fontWeight: 700, fontSize: story ? 60 : 38, color: C.text2, textTransform: "uppercase" }}>{t.outside}</span>}
          {card.club && <span style={{ fontFamily: "Mono", fontWeight: 500, fontSize: story ? 44 : 28, color: C.text2 }}>[{card.club}]</span>}
        </div>
      </div>
      {story ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 80 }}>
          {stats}
          <Spark series={card.series} width={904} height={420} />
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          {stats}
          <Spark series={card.series} width={360} height={150} />
        </div>
      )}
      <Footer locale={locale} takenAt={card.takenAt} siteUrl={siteUrl} size={story ? 30 : 20} />
    </Frame>
  );
}

export function clubCard(card: ClubCard, locale: Locale, format: CardFormat, siteUrl: string) {
  const t = T[locale];
  const s = card.summary;
  const story = format === "story";
  const statSize = story ? 104 : 70;
  return (
    <Frame format={format}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={story ? 64 : 44} />
        <span style={{ fontFamily: "Sans", fontWeight: 600, fontSize: story ? 32 : 22, color: C.text2, textTransform: "uppercase", letterSpacing: 2 }}>{`${t.club} · ${t.season}`}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: nameSize(card.tag, story ? 220 : 150), color: C.volt, lineHeight: 0.95 }}>[{card.tag}]</span>
        {card.name && card.name !== card.tag && <span style={{ fontFamily: "Sans", fontWeight: 600, fontSize: story ? 48 : 32, color: C.text2 }}>{card.name}</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: story ? 72 : 56, rowGap: 40 }}>
        <Stat label={t.members} value={formatNumber(s.members, locale)} size={statSize} />
        <Stat label={t.avg} value={s.avg === null ? "—" : formatNumber(s.avg, locale)} size={statSize} />
        <Stat label={t.best} value={s.bestRank === null ? "—" : formatRank(s.bestRank, locale)} color={C.volt} size={statSize} />
        {s.inTop500 > 0 && <Stat label={t.top500} value={formatNumber(s.inTop500, locale)} size={statSize} />}
      </div>
      {card.topNames.length > 0 && (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontFamily: "Sans", fontWeight: 600, fontSize: story ? 38 : 24, color: C.text2 }}>
          {card.topNames.slice(0, story ? 5 : 3).map((n, i) => (
            <span key={n} style={{ display: "flex" }}>{`${i + 1}. ${splitName(n).base}`}</span>
          ))}
        </div>
      )}
      <Footer locale={locale} takenAt={card.takenAt} siteUrl={siteUrl} size={story ? 30 : 20} />
    </Frame>
  );
}

export function compareCard(players: PlayerCard[], locale: Locale, siteUrl: string) {
  const t = T[locale];
  const n = players.length;
  const takenAt = players.map((p) => p.takenAt).filter(Boolean).sort().pop() ?? null;
  return (
    <Frame format="og">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={44} />
        <span style={{ fontFamily: "Sans", fontWeight: 600, fontSize: 22, color: C.text2, textTransform: "uppercase", letterSpacing: 2 }}>{t.season}</span>
      </div>
      <div style={{ display: "flex", gap: 20 }}>
        {players.map((p, i) => {
          const { base } = splitName(p.name);
          const l = leagueOf(p.league);
          return (
            <div key={`${p.name}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, padding: 24, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 12, borderTop: `6px solid ${l ? LEAGUE[l.tier] : C.border}` }}>
              <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: n <= 2 ? nameSize(base, 76) : nameSize(base, 52), textTransform: "uppercase", lineHeight: 1 }}>{base}</span>
              <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: n <= 2 ? 64 : 46, color: C.volt, lineHeight: 1 }}>{p.rank !== null ? formatRank(p.rank, locale) : "—"}</span>
              <span style={{ fontFamily: "Sans", fontWeight: 600, fontSize: n <= 2 ? 30 : 24, color: C.text2 }}>{p.score !== null ? `${formatNumber(p.score, locale)} RS` : t.outside}</span>
              {l && <span style={{ fontFamily: "Display", fontWeight: 700, fontSize: n <= 2 ? 34 : 26, color: LEAGUE[l.tier], textTransform: "uppercase" }}>{l.name}</span>}
            </div>
          );
        })}
      </div>
      <Footer locale={locale} takenAt={takenAt} siteUrl={siteUrl} size={20} />
    </Frame>
  );
}

export function siteCard(locale: Locale, siteUrl: string) {
  const t = T[locale];
  return (
    <Frame format="og">
      <Wordmark size={64} />
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: 112, lineHeight: 0.95, textTransform: "uppercase" }}>THE FINALS</span>
        <span style={{ fontFamily: "Sans", fontWeight: 500, fontSize: 36, color: C.text2, maxWidth: 940 }}>{t.tagline}</span>
      </div>
      <Footer locale={locale} takenAt={null} siteUrl={siteUrl} size={20} />
    </Frame>
  );
}

export async function render(element: React.ReactElement, format: CardFormat, headers: Record<string, string> = {}): Promise<ImageResponse> {
  const fonts = await loadFonts();
  return new ImageResponse(element, { ...SIZES[format], fonts, headers: { "Cache-Control": CARD_CACHE, ...headers } });
}

export function cardLocale(raw: string | null): Locale {
  return raw === "en" ? "en" : "fr";
}
