import "server-only";
import { formatDateTime, formatNumber, formatRank, formatSigned, type Locale } from "./format";
import { league as leagueOf } from "./league";
import { C, deltaColor, host, LEAGUE, nameSize, Spark, SupporterChip, Wordmark, type PlayerCard } from "./og";
import { splitName } from "./players";
import type { SupporterRole } from "./supporters";
import type { MoverWindow } from "./types";
import type { VideoParams } from "./video";

/**
 * Rendu des templates vidéo 1080×1920 (sprint 7), même charte que les cartes de partage (palette Volt, Barlow).
 *
 * Zones sûres TikTok / Reels / Shorts : rien d'important au-dessus de 200 px (onglets), à droite des 930 px
 * (boutons j'aime / partage) ni sous 1480 px (légende, musique). Le contenu tient dans ce cadre ; le reste n'est
 * que du fond. Les cases d'une étape pas encore révélée gardent leur taille (le montage ne saute pas).
 */
const W = 1080;
const H = 1920;
const SAFE = { top: 200, left: 72, right: 150, bottom: 440 } as const;
const INNER = W - SAFE.left - SAFE.right;
const PANEL = "rgba(20,20,26,0.90)";

const T = {
  fr: {
    up: "Plus fortes progressions",
    down: "Plus grosses chutes",
    window: { "24h": "Sur 24 h", "7d": "Sur 7 jours", season: "Depuis le début du suivi" } as Record<MoverWindow, string>,
    duel: "Duel",
    gap: "Écart",
    cutoff: "Ligne top 500",
    cutoffSub: "RS du 500e joueur",
    d24: "24 h",
    d7: "7 j",
    rank1: "Le n°1",
    last: "Le 10 000e",
    projection: "Projection à 7 jours",
    projectionLater: (d: string) => `Projection dès le ${d}`,
    projectionRange: (lo: string, hi: string) => `fourchette ${lo} – ${hi} RS · calcul FINALS HQ`,
    empty: "Pas encore assez de relevés pour cette période.",
    takenAt: "Relevé",
    notAffiliated: "Projet de fans, non affilié à Embark Studios",
    season: "Ranked · Saison 12",
    rank: "Rang",
    outside: "Hors du top 10 000",
  },
  en: {
    up: "Biggest climbs",
    down: "Biggest drops",
    window: { "24h": "Last 24h", "7d": "Last 7 days", season: "Since tracking began" } as Record<MoverWindow, string>,
    duel: "Duel",
    gap: "Gap",
    cutoff: "Top 500 line",
    cutoffSub: "RS of the 500th player",
    d24: "24h",
    d7: "7d",
    rank1: "#1",
    last: "#10,000",
    projection: "7-day projection",
    projectionLater: (d: string) => `Projection from ${d}`,
    projectionRange: (lo: string, hi: string) => `range ${lo} – ${hi} RS · FINALS HQ estimate`,
    empty: "Not enough snapshots for this period yet.",
    takenAt: "Taken",
    notAffiliated: "Fan project, not affiliated with Embark Studios",
    season: "Ranked · Season 12",
    rank: "Rank",
    outside: "Outside the top 10,000",
  },
} as const;

export interface MoverVideoRow {
  name: string;
  rank: number;
  score: number;
  league: number | null;
  club: string | null;
  delta: number;
  supporter: SupporterRole | null;
}

export interface CutoffVideo {
  score: number | null;
  d24: number | null;
  d7: number | null;
  series: number[];
  rank1: number | null;
  last: number | null;
  projection: { mid: number; low: number; high: number } | null;
  /** AAAA-MM-JJ : jour où la projection devient disponible (si elle ne l'est pas encore). */
  projectionFrom: string | null;
  takenAt: string | null;
}

/** Cadre commun : fond plein ou transparent, bandeau Volt, repères de zones sûres en aperçu. */
function VideoFrame({ p, children }: { p: VideoParams; children: React.ReactNode }) {
  const solid = p.bg === "solid";
  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", background: solid ? C.bg : "transparent", color: C.text, fontFamily: "Sans" }}>
      {solid && <div style={{ position: "absolute", left: 0, top: 0, width: W, height: 10, background: C.volt, display: "flex" }} />}
      {solid && <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", backgroundImage: "radial-gradient(circle at 85% 8%, rgba(215,255,60,0.10), rgba(11,11,15,0) 45%)" }} />}
      <div style={{ position: "absolute", left: SAFE.left, top: SAFE.top, width: INNER, height: H - SAFE.top - SAFE.bottom, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>{children}</div>
      {p.safe && (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: SAFE.top, background: "rgba(255,92,92,0.28)", display: "flex" }} />
          <div style={{ position: "absolute", left: 0, top: H - SAFE.bottom, width: W, height: SAFE.bottom, background: "rgba(255,92,92,0.28)", display: "flex" }} />
          <div style={{ position: "absolute", left: W - SAFE.right, top: SAFE.top, width: SAFE.right, height: H - SAFE.top - SAFE.bottom, background: "rgba(255,92,92,0.28)", display: "flex" }} />
        </>
      )}
    </div>
  );
}

function Header({ title, kicker, locale }: { title: string; kicker: string; locale: Locale }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={52} />
        <span style={{ fontFamily: "Sans", fontWeight: 600, fontSize: 26, color: C.text2, textTransform: "uppercase", letterSpacing: 2 }}>{T[locale].season}</span>
      </div>
      <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: [...title].length <= 18 ? 104 : 86, lineHeight: 0.95, textTransform: "uppercase" }}>{title}</span>
      <span style={{ fontFamily: "Sans", fontWeight: 600, fontSize: 34, color: C.volt, textTransform: "uppercase", letterSpacing: 3 }}>{kicker}</span>
    </div>
  );
}

function VideoFooter({ locale, takenAt, siteUrl }: { locale: Locale; takenAt: string | null; siteUrl: string }) {
  const t = T[locale];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "18px 24px", background: PANEL, borderRadius: 16, fontSize: 24, color: C.text2 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{takenAt ? `${t.takenAt} ${formatDateTime(new Date(takenAt), locale, "UTC")}` : ""}</span>
        <span style={{ fontFamily: "Mono", color: C.volt }}>{host(siteUrl)}</span>
      </div>
      <span style={{ fontSize: 20, color: C.text3 }}>{t.notAffiliated}</span>
    </div>
  );
}

/** Case non révélée : même gabarit, contenu masqué (pour la révélation en montage). */
function Hidden({ height, label }: { height: number; label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height, background: "rgba(20,20,26,0.55)", border: `3px dashed ${C.border}`, borderRadius: 20, fontFamily: "Display", fontWeight: 800, fontSize: 72, color: C.text3 }}>
      {label ?? "?"}
    </div>
  );
}

export function moversVideo(rows: MoverVideoRow[], takenAt: string | null, p: VideoParams, siteUrl: string) {
  const t = T[p.locale];
  const l = p.locale;
  const n = p.count;
  const rowH = n === 3 ? 230 : 162;
  const shown = rows.slice(0, n);
  // Compte à rebours : l'étape k révèle les k dernières places (n°5, puis n°4…), le n°1 en dernier.
  const revealed = (i: number) => p.step === 0 || i >= n - p.step;
  return (
    <VideoFrame p={p}>
      <Header title={t[p.dir]} kicker={t.window[p.window]} locale={l} />
      <div style={{ display: "flex", flexDirection: "column", gap: n === 3 ? 28 : 18 }}>
        {shown.length === 0 && <div style={{ display: "flex", padding: 40, background: PANEL, borderRadius: 20, fontSize: 40, color: C.text2 }}>{t.empty}</div>}
        {shown.map((r, i) => {
          if (!revealed(i)) return <Hidden key={i} height={rowH} label={`#${i + 1}`} />;
          const { base, tag } = splitName(r.name);
          const lg = leagueOf(r.league);
          const big = n === 3;
          return (
            <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 24, height: rowH, padding: "0 28px", background: PANEL, border: `2px solid ${C.border}`, borderLeft: `10px solid ${lg ? LEAGUE[lg.tier] : C.border}`, borderRadius: 20 }}>
              <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: big ? 92 : 72, color: C.volt, width: big ? 110 : 90 }}>{`#${i + 1}`}</span>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: nameSize(base, big ? 80 : 64), textTransform: "uppercase", lineHeight: 1 }}>{base}</span>
                  {tag && <span style={{ fontFamily: "Mono", fontSize: big ? 30 : 24, color: C.text2 }}>{tag}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ fontSize: big ? 30 : 25, color: C.text2 }}>{`${formatRank(r.rank, l)} · ${formatNumber(r.score, l)} RS${r.club ? ` · [${r.club}]` : ""}`}</span>
                  <SupporterChip role={r.supporter} locale={l} size={big ? 20 : 17} />
                </div>
              </div>
              <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: big ? 84 : 66, color: deltaColor(r.delta) }}>{formatSigned(r.delta, l)}</span>
            </div>
          );
        })}
      </div>
      <VideoFooter locale={l} takenAt={takenAt} siteUrl={siteUrl} />
    </VideoFrame>
  );
}

function DuelPanel({ card, locale, color }: { card: PlayerCard; locale: Locale; color: string }) {
  const t = T[locale];
  const { base, tag } = splitName(card.name);
  const lg = leagueOf(card.league);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: 360, padding: "22px 32px", background: PANEL, border: `2px solid ${C.border}`, borderTop: `10px solid ${color}`, borderRadius: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: nameSize(base, 96), textTransform: "uppercase", lineHeight: 0.95 }}>{base}</span>
        {tag && <span style={{ fontFamily: "Mono", fontSize: 32, color: C.text2 }}>{tag}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {lg && <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: 40, color: LEAGUE[lg.tier], textTransform: "uppercase" }}>{lg.name}</span>}
        {card.club && <span style={{ fontFamily: "Mono", fontSize: 30, color: C.text2 }}>[{card.club}]</span>}
        <SupporterChip role={card.supporter} locale={locale} size={20} />
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: 84, color: C.volt, lineHeight: 1 }}>{card.rank !== null ? formatRank(card.rank, locale) : "—"}</span>
          <span style={{ fontSize: 34, fontWeight: 600, color: C.text }}>{card.score !== null ? `${formatNumber(card.score, locale)} RS` : t.outside}</span>
          <div style={{ display: "flex", gap: 20, fontSize: 28 }}>
            {card.d24 !== null && <span style={{ color: deltaColor(card.d24) }}>{`${t.d24} ${formatSigned(card.d24, locale)}`}</span>}
            {card.d7 !== null && <span style={{ color: deltaColor(card.d7) }}>{`${t.d7} ${formatSigned(card.d7, locale)}`}</span>}
          </div>
        </div>
        <Spark series={card.series} width={380} height={130} />
      </div>
    </div>
  );
}

export function duelVideo(a: PlayerCard, b: PlayerCard, p: VideoParams, siteUrl: string) {
  const t = T[p.locale];
  const l = p.locale;
  const show = (k: number) => p.step === 0 || p.step >= k;
  const gap = a.score !== null && b.score !== null ? Math.abs(a.score - b.score) : null;
  const color = (c: PlayerCard) => {
    const lg = leagueOf(c.league);
    return lg ? LEAGUE[lg.tier] : C.border;
  };
  const kicker = a.rank === 1 && b.rank === 2 ? (l === "fr" ? "N°1 contre N°2" : "#1 vs #2") : `${splitName(a.name).base} vs ${splitName(b.name).base}`;
  return (
    <VideoFrame p={p}>
      <Header title={t.duel} kicker={kicker} locale={l} />
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {show(1) ? <DuelPanel card={a} locale={l} color={color(a)} /> : <Hidden height={360} />}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 96 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 100, height: 100, borderRadius: 999, background: C.volt, color: C.bg, fontFamily: "Display", fontWeight: 800, fontSize: 52 }}>VS</div>
        </div>
        {show(2) ? <DuelPanel card={b} locale={l} color={color(b)} /> : <Hidden height={360} />}
      </div>
      {show(3) && gap !== null ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 110, padding: "0 32px", background: PANEL, border: `2px solid ${C.volt}`, borderRadius: 20 }}>
          <span style={{ fontFamily: "Sans", fontWeight: 600, fontSize: 36, color: C.text2, textTransform: "uppercase", letterSpacing: 2 }}>{t.gap}</span>
          <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: 80, color: C.volt }}>{`${formatNumber(gap, l)} RS`}</span>
        </div>
      ) : (
        <Hidden height={110} label=" " />
      )}
      <VideoFooter locale={l} takenAt={[a.takenAt, b.takenAt].filter(Boolean).sort().pop() ?? null} siteUrl={siteUrl} />
    </VideoFrame>
  );
}

export function cutoffVideo(d: CutoffVideo, p: VideoParams, siteUrl: string) {
  const t = T[p.locale];
  const l = p.locale;
  const show = (k: number) => p.step === 0 || p.step >= k;
  const fmtDay = (day: string) => new Intl.DateTimeFormat(l === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  return (
    <VideoFrame p={p}>
      <Header title={t.cutoff} kicker={t.cutoffSub} locale={l} />
      {show(1) ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, padding: "30px 36px", background: PANEL, border: `2px solid ${C.border}`, borderRadius: 20 }}>
          <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: 230, color: C.volt, lineHeight: 0.9 }}>{d.score !== null ? formatNumber(d.score, l) : "—"}</span>
          <span style={{ fontFamily: "Display", fontWeight: 700, fontSize: 52, color: C.text2 }}>RS</span>
        </div>
      ) : (
        <Hidden height={300} />
      )}
      {show(2) ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, height: 400, padding: "26px 32px", background: PANEL, border: `2px solid ${C.border}`, borderRadius: 20 }}>
          <div style={{ display: "flex", gap: 48 }}>
            {[
              [t.d24, d.d24],
              [t.d7, d.d7],
            ].map(([label, v]) => (
              <div key={String(label)} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 26, fontWeight: 600, color: C.text2, textTransform: "uppercase", letterSpacing: 2 }}>{String(label)}</span>
                <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: 72, color: deltaColor(v as number | null) }}>{v === null ? "—" : formatSigned(v as number, l)}</span>
              </div>
            ))}
          </div>
          <Spark series={d.series} width={INNER - 64} height={200} />
        </div>
      ) : (
        <Hidden height={400} />
      )}
      {show(3) ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "24px 32px", background: PANEL, border: `2px solid ${C.volt}`, borderRadius: 20 }}>
          {d.projection ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 30, fontWeight: 600, color: C.text2, textTransform: "uppercase", letterSpacing: 2 }}>{t.projection}</span>
                <span style={{ fontFamily: "Display", fontWeight: 800, fontSize: 72, color: C.volt }}>{`≈ ${formatNumber(d.projection.mid, l)}`}</span>
              </div>
              <span style={{ fontSize: 24, color: C.text2 }}>{t.projectionRange(formatNumber(d.projection.low, l), formatNumber(d.projection.high, l))}</span>
            </>
          ) : (
            <span style={{ fontSize: 34, fontWeight: 600, color: C.text2 }}>{d.projectionFrom ? t.projectionLater(fmtDay(d.projectionFrom)) : t.projection}</span>
          )}
          <div style={{ display: "flex", gap: 40, fontSize: 26, color: C.text2 }}>
            {d.rank1 !== null && <span>{`${t.rank1} : ${formatNumber(d.rank1, l)} RS`}</span>}
            {d.last !== null && <span>{`${t.last} : ${formatNumber(d.last, l)} RS`}</span>}
          </div>
        </div>
      ) : (
        <Hidden height={170} />
      )}
      <VideoFooter locale={l} takenAt={d.takenAt} siteUrl={siteUrl} />
    </VideoFrame>
  );
}
