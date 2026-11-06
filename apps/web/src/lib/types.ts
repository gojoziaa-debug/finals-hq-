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

export interface PlayerData {
  id: string;
  name: string;
  hidden: boolean;
  platforms: { steam: string | null; psn: string | null; xbox: string | null };
  firstSeenAt: string;
  lastSeenAt: string;
  current: Array<{ leaderboardId: number; rank: number; score: number; league: number | null; club: string | null; d24: number | null; d7: number | null; updatedAt: string }>;
  seasons: Array<{ leaderboardId: number; rank: number; score: number; league: number | null; club: string | null }>;
  formerNames: Array<{ name: string; lastSeenAt: string }>;
}
