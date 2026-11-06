/**
 * Formes de données échangées entre le serveur et le navigateur. Les dates voyagent en ISO (cache JSON).
 */

/**
 * Un classement complet en colonnes : 10 000 lignes ≈ 450 Ko de JSON brut, ≈ 130 Ko compressé,
 * environ deux fois moins qu'un tableau d'objets. L'élément i de chaque colonne décrit la ligne i,
 * dans l'ordre du classement (rang affiché = i + 1 pour un classement en cours).
 */
export interface BoardColumns {
  /** Rang affiché. En cours : ordre des scores du dernier relevé. Archive : rang final de l'API. */
  rank: number[];
  /** null = profil masqué à la demande du joueur. */
  name: (string | null)[];
  score: number[];
  league: (number | null)[];
  club: (string | null)[];
  /** Variation de score sur 24 h et 7 jours (null = inconnue) ; absentes des archives. */
  d24: (number | null)[] | null;
  d7: (number | null)[] | null;
}

export interface BoardMeta {
  id: number;
  key: string;
  isLive: boolean;
  hasLeagues: boolean;
  /** Heure du relevé appliqué le plus récent (archive : date de l'instantané figé). */
  takenAt: string | null;
  rowCount: number;
}

export interface BoardPayload {
  meta: BoardMeta;
  rows: BoardColumns;
}

export interface FreshnessInfo {
  takenAt: string | null;
  /** Fichiers rejetés sur les dernières 24 h (format de l'API changé, chaîne rompue). */
  rejected24h: number;
}

export interface SearchResult {
  playerId: string;
  name: string;
  /** Ancien pseudo qui a fait remonter ce joueur (« anciennement … »). */
  formerName: string | null;
  /** Position dans le classement ranked en cours, null si absent du top 10 000. */
  rank: number | null;
  score: number | null;
  league: number | null;
  club: string | null;
}

export interface StatusBoard {
  id: number;
  key: string;
  takenAt: string | null;
  kind: string | null;
  rows: number;
  rejected24h: number;
}

export interface StatusData {
  generatedAt: string;
  boards: StatusBoard[];
  runs: Array<{ id: number; command: string; status: string; startedAt: string; finishedAt: string | null; applied: number; rejected: number; error: string | null }>;
  archives: { imported: number; expected: number };
  database: { sizeBytes: number | null; limitBytes: number; players: number };
}

export interface HomeData {
  takenAt: string | null;
  top: Array<{ rank: number; name: string | null; score: number; league: number | null; club: string | null; d24: number | null }>;
  top500: { score: number | null; change24h: number | null; lastScore: number | null; rank1Score: number | null } | null;
  leagues: Array<{ league: number; count: number }>;
  movers: Array<{ name: string; d7: number; score: number; league: number | null; rank: number }>;
}

export interface PlayerCurrent {
  leaderboardId: number;
  rank: number;
  score: number;
  league: number | null;
  club: string | null;
  d24: number | null;
  d7: number | null;
  updatedAt: string;
  /** Dernier changement de score observé sur ce classement. */
  lastChangeAt: string;
  /** Première apparition sur ce classement. */
  firstSeenAt: string;
}

export interface PlayerSeason {
  leaderboardId: number;
  rank: number;
  score: number;
  league: number | null;
  club: string | null;
}

/**
 * Un point de la courbe du classement ranked en cours. close = clôture quotidienne (player_history, à 23:59:59 UTC),
 * event = changement de score relevé (rs_events, 8 jours), now = état au dernier relevé (le rang bouge même sans match).
 * score null = absent du top 10 000 ce jour-là (trou, jamais interpolé).
 */
export interface ProfilePoint {
  t: string;
  score: number | null;
  rank: number | null;
  league: number | null;
  kind: "close" | "event" | "now";
}

export interface ProfileLive {
  leaderboardId: number;
  /** Heure du dernier relevé appliqué du classement. */
  takenAt: string | null;
  /** Premier jour de clôture quotidienne du classement (début de la collecte), AAAA-MM-JJ. */
  historyStart: string | null;
  /** Points dans l'ordre chronologique. */
  series: ProfilePoint[];
  /** Changements de score par jour UTC (AAAA-MM-JJ), depuis le début de la collecte. */
  activity: Array<{ day: string; changes: number }>;
  /** Dernier relevé de la ligne de coupe : 500e, 10 000e, 1er, joueurs par ligue. */
  cutoff: { takenAt: string; rank500: number | null; last: number | null; rank1: number | null; rowCount: number; leagueCounts: Array<{ league: number; count: number }> } | null;
}

export interface PlayerData {
  id: string;
  name: string;
  hidden: boolean;
  platforms: { steam: string | null; psn: string | null; xbox: string | null };
  firstSeenAt: string;
  lastSeenAt: string;
  current: PlayerCurrent[];
  seasons: PlayerSeason[];
  formerNames: Array<{ name: string; lastSeenAt: string }>;
  /** Historique du classement ranked en cours ; null pour un profil masqué. */
  live: ProfileLive | null;
}

export interface FollowedRow {
  id: string;
  name: string;
  /** null = hors du top 10 000 au dernier relevé. */
  rank: number | null;
  score: number | null;
  league: number | null;
  club: string | null;
  d24: number | null;
  d7: number | null;
}

/* ───────────────────────────── Sprint 4 : ligne top 500, clubs, progressions ───────────────────────────── */

export interface Top500Data {
  takenAt: string | null;
  /** RS du 500e, un relevé par heure (le dernier de l'heure), depuis le début de la collecte. */
  series: Array<{ t: string; score: number }>;
  latest: { takenAt: string; rank500: number | null; rank1: number | null; last: number | null; rowCount: number; leagueCounts: Array<{ league: number; count: number }> } | null;
  /** Joueurs autour de la ligne (rangs 495 à 505), au dernier relevé. */
  around: Array<{ rank: number; name: string | null; score: number; league: number | null; club: string | null; d24: number | null }>;
}

export interface PastThreshold {
  seasonId: string;
  seasonName: string;
  leaderboardId: number;
  /** RS final du 500e, du 1er et du dernier de l'archive (null si l'archive a moins de 500 lignes). */
  rank500: number | null;
  rank1: number | null;
  /** Ligue finale du 500e (V : relevée dans l'archive). */
  league500: number | null;
  takenAt: string;
}

export interface ClubRow {
  tag: string;
  name: string | null;
  /** Membres présents dans le top 10 000 du classement ranked en cours. */
  members: number;
  total: number;
  avg: number;
  bestRank: number;
  /** Meilleur membre visible (null si tous masqués). */
  bestName: string | null;
  bestLeague: number | null;
  /** Somme des variations 7 j connues, et nombre de membres pour qui elle est connue. */
  d7: number | null;
  d7Known: number;
}

export interface ClubsData {
  takenAt: string | null;
  clubs: ClubRow[];
}

export interface ClubMember {
  rank: number;
  name: string | null;
  score: number;
  league: number | null;
  d24: number | null;
  d7: number | null;
}

export interface ClubData {
  tag: string;
  name: string | null;
  takenAt: string | null;
  members: ClubMember[];
  /** Dernière fois que le club a été vu dans un relevé (table clubs), pour l'état « aucun membre classé ». */
  lastSeenAt: string | null;
}

export type MoverWindow = "24h" | "7d" | "season";

export interface MoverRow {
  rank: number;
  name: string;
  score: number;
  league: number | null;
  club: string | null;
  delta: number;
}

export interface MoversData {
  takenAt: string | null;
  historyStart: string | null;
  rows: MoverRow[];
}

/* ───────────────────────────── Sprint 5 : Rating ───────────────────────────── */

export type RatingComponentKey = "level" | "peak" | "momentum" | "consistency" | "legacy";

/** Dernier calcul du Rating d'un classement et les références de population mesurées ce jour-là. */
export interface RatingRunInfo {
  computedAt: string;
  dataUntil: string;
  dataSince: string;
  observedDays: number;
  calibrationDays: number;
  players: number;
  version: string;
  refs: {
    momentum: Record<"h24" | "d7" | "d30", { median: number; mad: number; n: number } | null>;
    drawdown: { n: number; p10: number; p25: number; median: number; p75: number; p90: number } | null;
    anomalyThreshold: number | null;
    anomalySamples: number;
    topRs: number;
  };
}

export interface PlayerRatingData {
  rating: number | null;
  raw: number | null;
  provisional: boolean;
  level: number;
  peak: number;
  momentum: number | null;
  consistency: number | null;
  legacy: number;
  momentumZ: number | null;
  deltas: { h24: number | null; d7: number | null; d30: number | null };
  drawdown: number | null;
  activeDays30: number;
  hotStreak: boolean;
  anomalies: number;
  /** Place dans l'ordre du Rating (profils masqués exclus). */
  position: number | null;
  run: RatingRunInfo;
}

export type RatingSort = "rating" | "momentum" | "consistency";

export interface RatingBoardRow {
  position: number;
  rank: number;
  name: string;
  score: number;
  league: number | null;
  club: string | null;
  rating: number | null;
  raw: number | null;
  provisional: boolean;
  level: number;
  momentum: number | null;
  consistency: number | null;
  legacy: number;
  hotStreak: boolean;
}

export interface RatingBoardData {
  run: RatingRunInfo | null;
  rows: RatingBoardRow[];
}
