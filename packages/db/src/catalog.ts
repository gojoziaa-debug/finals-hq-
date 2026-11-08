/**
 * Catalogue des saisons et des 82 classements (+ 2 événements communautaires) de l'API
 * api.the-finals-leaderboard.com, tel que vérifié le 5 novembre 2026
 * (voir 01-verification-api.md dans les fichiers du projet).
 *
 * Vérifié : ids, plateformes, champ de score, version de schéma des classements classés.
 * Déduit des ids (pas une donnée du jeu) : les libellés `name` des modes.
 * Inconnu : les dates de saison (laissées vides tant qu'elles ne sont pas établies).
 */

export type LeaderboardKind = "ranked" | "worldtour" | "sponsor" | "mode" | "special" | "event";

export interface SeasonDef {
  id: string;
  name: string;
  /** Ordre chronologique (1 = première bêta fermée). */
  ordinal: number;
  /** Faux pour cb1, cb2, ob, s1, s2 : pas de système de ligues comparable (Legacy du rating). */
  hasComparableLeagues: boolean;
  isLive: boolean;
}

export type HistoryMode = "events" | "daily";

export interface LeaderboardDef {
  /**
   * Identifiant numérique stable, stocké en base à la place de la clé texte (2 octets au lieu de 27).
   * ordinal de saison × 100 + rang du mode × 4 + plateforme ; 9000 + pour les classements spéciaux
   * et les événements. Ne jamais renuméroter : les tables de volume y font référence.
   */
  id: number;
  /** `<id>-<plateforme>` ou `<id>` seul : la clé des fichiers du collecteur. */
  key: string;
  upstreamId: string;
  platform: string | null;
  kind: LeaderboardKind;
  /** Slug du mode : ranked, worldtour, sponsor, powershift… */
  mode: string;
  name: string;
  seasonId: string | null;
  /** Champ de la ligne API qui porte le score classant. */
  scoreField: string;
  /** R1–R6 pour les classés, WT, SP, MODE, SPECIAL, EVENT sinon. */
  schemaVersion: string;
  hasLeagues: boolean;
  isLive: boolean;
  /**
   * `events` : chaque changement de score est conservé 8 jours dans rs_events (ranked en cours seulement) ;
   * `daily` : seulement la clôture quotidienne compactée de player_history (World Tour, sponsor, modes casual).
   * World Tour et sponsor faisaient 90 % des événements (≈ 12 Mo par jour) pour une base Supabase Free de 500 Mo :
   * ils passent en `daily` depuis le rodage (2026-11-08), le ranked garde le détail dont le Rating a besoin.
   */
  history: HistoryMode;
}

export const SEASONS: readonly SeasonDef[] = [
  { id: "cb1", name: "Closed Beta 1", ordinal: 1, hasComparableLeagues: false, isLive: false },
  { id: "cb2", name: "Closed Beta 2", ordinal: 2, hasComparableLeagues: false, isLive: false },
  { id: "ob", name: "Open Beta", ordinal: 3, hasComparableLeagues: false, isLive: false },
  { id: "s1", name: "Season 1", ordinal: 4, hasComparableLeagues: false, isLive: false },
  { id: "s2", name: "Season 2", ordinal: 5, hasComparableLeagues: false, isLive: false },
  { id: "s3", name: "Season 3", ordinal: 6, hasComparableLeagues: true, isLive: false },
  { id: "s4", name: "Season 4", ordinal: 7, hasComparableLeagues: true, isLive: false },
  { id: "s5", name: "Season 5", ordinal: 8, hasComparableLeagues: true, isLive: false },
  { id: "s6", name: "Season 6", ordinal: 9, hasComparableLeagues: true, isLive: false },
  { id: "s7", name: "Season 7", ordinal: 10, hasComparableLeagues: true, isLive: false },
  { id: "s8", name: "Season 8", ordinal: 11, hasComparableLeagues: true, isLive: false },
  { id: "s9", name: "Season 9", ordinal: 12, hasComparableLeagues: true, isLive: false },
  { id: "s10", name: "Season 10", ordinal: 13, hasComparableLeagues: true, isLive: false },
  { id: "s11", name: "Season 11", ordinal: 14, hasComparableLeagues: true, isLive: false },
  { id: "s12", name: "Season 12", ordinal: 15, hasComparableLeagues: true, isLive: true },
];

const MODE_NAMES: Record<string, string> = {
  ranked: "Ranked Cashout",
  original: "Ranked Cashout (before reset)",
  worldtour: "World Tour",
  sponsor: "Sponsor",
  terminalattack: "Terminal Attack",
  powershift: "Power Shift",
  quickcash: "Quick Cash",
  bankit: "Bank It",
  teamdeathmatch: "Team Deathmatch",
  heavyhitters: "Heavy Hitters",
  blastoff: "Blast Off",
  cashball: "Cashball",
  head2head: "Head 2 Head",
  ghoulrush: "Ghoul Rush",
  heavenorelse: "Heaven or Else",
  pointbreak: "Point Break",
  starlighthollow: "Starlight Hollow",
  the24hourgauntlet: "The 24 Hour Gauntlet",
  creatorgauntlet: "Creator Gauntlet",
  orbitalhitters: "Orbital Hitters",
  soloshowdown: "Solo Showdown",
};

/** Rang de chaque mode dans l'identifiant numérique (ajouter en fin de liste, ne jamais réordonner). */
const MODE_ORDER = [
  "ranked", "original", "worldtour", "sponsor", "terminalattack", "powershift", "quickcash", "bankit", "teamdeathmatch",
  "heavyhitters", "blastoff", "cashball", "head2head", "ghoulrush", "heavenorelse", "pointbreak", "starlighthollow",
  "the24hourgauntlet", "creatorgauntlet", "orbitalhitters", "soloshowdown",
] as const;
const PLATFORM_ORDER: Record<string, number> = { crossplay: 0, steam: 1, xbox: 2, psn: 3 };

function leaderboardId(season: SeasonDef, mode: string, platform: string | null): number {
  const modeIndex = MODE_ORDER.indexOf(mode as (typeof MODE_ORDER)[number]);
  if (modeIndex === -1) throw new Error(`mode ${mode} absent de MODE_ORDER`);
  const platformIndex = platform === null ? 0 : PLATFORM_ORDER[platform];
  if (platformIndex === undefined) throw new Error(`plateforme ${platform} inconnue`);
  return season.ordinal * 100 + modeIndex * 4 + platformIndex;
}

/** Ids par saison, dans l'ordre du dépôt leonlarsson/the-finals-api (commit a59da60). */
const SEASON_IDS: Record<string, readonly string[]> = {
  cb1: ["cb1"],
  cb2: ["cb2"],
  ob: ["ob"],
  s1: ["s1"],
  s2: ["s2"],
  s3: ["s3", "s3original", "s3worldtour"],
  s4: ["s4", "s4worldtour", "s4sponsor"],
  s5: ["s5", "s5sponsor", "s5worldtour", "s5terminalattack", "s5powershift", "s5quickcash", "s5bankit"],
  s6: ["s6", "s6sponsor", "s6worldtour", "s6terminalattack", "s6powershift", "s6quickcash", "s6teamdeathmatch", "s6heavyhitters"],
  s7: ["s7", "s7sponsor", "s7worldtour", "s7terminalattack", "s7powershift", "s7quickcash", "s7teamdeathmatch", "s7blastoff", "s7cashball"],
  s8: ["s8", "s8sponsor", "s8worldtour", "s8head2head", "s8powershift", "s8quickcash", "s8teamdeathmatch", "s8blastoff", "s8ghoulrush", "s8heavenorelse"],
  s9: ["s9", "s9sponsor", "s9worldtour", "s9head2head", "s9powershift", "s9quickcash", "s9teamdeathmatch", "s9pointbreak", "s9bankit"],
  s10: ["s10", "s10sponsor", "s10worldtour", "s10powershift", "s10quickcash", "s10teamdeathmatch", "s10pointbreak", "s10starlighthollow", "s10the24hourgauntlet", "s10creatorgauntlet"],
  s11: ["s11", "s11sponsor", "s11worldtour", "s11powershift", "s11quickcash", "s11teamdeathmatch", "s11pointbreak", "s11orbitalhitters"],
  s12: ["s12", "s12sponsor", "s12worldtour", "s12powershift", "s12quickcash", "s12teamdeathmatch", "s12pointbreak", "s12soloshowdown"],
};

/** Version de schéma des classements classés, par saison (section 3 de la vérification). */
const RANKED_SCHEMA: Record<string, { version: string; scoreField: string }> = {
  cb1: { version: "R1", scoreField: "fame" },
  cb2: { version: "R1", scoreField: "fame" },
  ob: { version: "R2", scoreField: "fame" },
  s1: { version: "R2", scoreField: "fame" },
  s2: { version: "R3", scoreField: "cashouts" }, // cashouts vaut 0 partout : S2 n'a pas de score de rang exploitable
  s3: { version: "R4", scoreField: "rankScore" },
  s4: { version: "R4", scoreField: "rankScore" },
  s5: { version: "R5", scoreField: "rankScore" },
  s6: { version: "R5", scoreField: "rankScore" },
  s7: { version: "R5", scoreField: "rankScore" },
  s8: { version: "R6", scoreField: "rankScore" },
  s9: { version: "R6", scoreField: "rankScore" },
  s10: { version: "R6", scoreField: "rankScore" },
  s11: { version: "R6", scoreField: "rankScore" },
  s12: { version: "R6", scoreField: "rankScore" },
};

const MULTI_PLATFORM = ["crossplay", "steam", "xbox", "psn"] as const;

function platformsOf(seasonId: string, upstreamId: string): readonly (string | null)[] {
  if (upstreamId === "cb1" || upstreamId === "cb2") return [null];
  if (seasonId === "ob" || seasonId === "s1" || seasonId === "s2") return MULTI_PLATFORM;
  return ["crossplay"];
}

function modeOf(seasonId: string, upstreamId: string): string {
  if (upstreamId === seasonId) return "ranked";
  if (upstreamId === "s3original") return "original";
  return upstreamId.slice(seasonId.length);
}

function build(): LeaderboardDef[] {
  const out: LeaderboardDef[] = [];
  for (const season of SEASONS) {
    const ids = SEASON_IDS[season.id] ?? [];
    for (const upstreamId of ids) {
      const mode = modeOf(season.id, upstreamId);
      const name = MODE_NAMES[mode] ?? mode;
      let kind: LeaderboardKind;
      let scoreField: string;
      let schemaVersion: string;
      let hasLeagues = false;
      if (mode === "ranked" || mode === "original") {
        const ranked = RANKED_SCHEMA[season.id];
        if (!ranked) throw new Error(`no ranked schema for ${season.id}`);
        kind = "ranked";
        scoreField = ranked.scoreField;
        schemaVersion = ranked.version;
        hasLeagues = true;
      } else if (mode === "worldtour") {
        kind = "worldtour";
        scoreField = "cashouts";
        schemaVersion = "WT";
      } else if (mode === "sponsor") {
        kind = "sponsor";
        scoreField = "fans";
        schemaVersion = "SP";
      } else {
        kind = "mode";
        scoreField = "points";
        schemaVersion = "MODE";
      }
      for (const platform of platformsOf(season.id, upstreamId)) {
        out.push({
          id: leaderboardId(season, mode, platform),
          key: platform ? `${upstreamId}-${platform}` : upstreamId,
          upstreamId,
          platform,
          kind,
          mode,
          name: `${season.name} · ${name}${platform && platform !== "crossplay" ? ` (${platform})` : ""}`,
          seasonId: season.id,
          scoreField,
          schemaVersion,
          hasLeagues,
          isLive: season.isLive,
          history: season.isLive && kind === "ranked" ? "events" : "daily",
        });
      }
    }
  }
  out.push(
    { id: 9001, key: "orf-crossplay", upstreamId: "orf", platform: "crossplay", kind: "special", mode: "orf", name: "ORF", seasonId: null, scoreField: "score", schemaVersion: "SPECIAL", hasLeagues: false, isLive: false, history: "daily" },
    { id: 9002, key: "the-finals-crossplay", upstreamId: "the-finals", platform: "crossplay", kind: "special", mode: "the-finals", name: "THE FINALS (tournament wins)", seasonId: null, scoreField: "tournamentWins", schemaVersion: "SPECIAL", hasLeagues: false, isLive: false, history: "daily" },
    { id: 9044, key: "ce44", upstreamId: "ce44", platform: null, kind: "event", mode: "community-event", name: "Community event 44", seasonId: null, scoreField: "score", schemaVersion: "EVENT", hasLeagues: false, isLive: false, history: "daily" },
    { id: 9048, key: "ce48", upstreamId: "ce48", platform: null, kind: "event", mode: "community-event", name: "Community event 48", seasonId: null, scoreField: "score", schemaVersion: "EVENT", hasLeagues: false, isLive: false, history: "daily" },
  );
  return out;
}

export const LEADERBOARDS: readonly LeaderboardDef[] = build();

const BY_KEY = new Map(LEADERBOARDS.map((lb) => [lb.key, lb]));
const BY_ID = new Map(LEADERBOARDS.map((lb) => [lb.id, lb]));

export function leaderboardByKey(key: string): LeaderboardDef | undefined {
  return BY_KEY.get(key);
}

export function leaderboardById(id: number): LeaderboardDef | undefined {
  return BY_ID.get(id);
}

export function seasonById(id: string): SeasonDef | undefined {
  return SEASONS.find((s) => s.id === id);
}

/** Segment d'URL de l'API pour un classement. */
export function upstreamPath(lb: LeaderboardDef): string {
  const family = lb.kind === "event" ? "community-event" : "leaderboard";
  return `/v1/${family}/${encodeURIComponent(lb.upstreamId)}${lb.platform ? `/${encodeURIComponent(lb.platform)}` : ""}`;
}

/** Ligues Embark : 0 Unranked, 1–4 Bronze 4→1, 5–8 Silver, 9–12 Gold, 13–16 Platinum, 17–20 Diamond, 21 Ruby. */
export function leagueName(leagueNumber: number): string {
  if (leagueNumber <= 0) return "Unranked";
  if (leagueNumber === 21) return "Ruby";
  const tiers = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const;
  const tier = tiers[Math.floor((leagueNumber - 1) / 4)] ?? "Unranked";
  const division = 4 - ((leagueNumber - 1) % 4);
  return `${tier} ${division}`;
}
