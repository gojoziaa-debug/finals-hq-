/**
 * Schéma Drizzle de FINALS HQ. La vérité est dans migrations/*.sql ; ce fichier reflète l'état après
 * la dernière migration pour typer les requêtes. `rs_events` est partitionnée par jour
 * (voir ensure_rs_events_partition) et purgée par le worker.
 */
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const big = (name: string) => bigint(name, { mode: "number" });

export const seasons = pgTable("seasons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ordinal: integer("ordinal").notNull().unique(),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  isLive: boolean("is_live").notNull().default(false),
  hasComparableLeagues: boolean("has_comparable_leagues").notNull().default(false),
});

export const leaderboards = pgTable("leaderboards", {
  id: smallint("id").primaryKey(),
  key: text("key").notNull().unique(),
  upstreamId: text("upstream_id").notNull(),
  platform: text("platform"),
  kind: text("kind").notNull(),
  mode: text("mode").notNull(),
  name: text("name").notNull(),
  seasonId: text("season_id").references(() => seasons.id),
  scoreField: text("score_field").notNull(),
  schemaVersion: text("schema_version").notNull(),
  hasLeagues: boolean("has_leagues").notNull().default(false),
  isLive: boolean("is_live").notNull().default(false),
  history: text("history").notNull().default("daily"),
  historyStartDay: date("history_start_day"),
});

export const players = pgTable(
  "players",
  {
    id: big("id").generatedAlwaysAsIdentity().primaryKey(),
    embarkName: text("embark_name").notNull(),
    steamName: text("steam_name"),
    psnName: text("psn_name"),
    xboxName: text("xbox_name"),
    linkable: boolean("linkable").notNull().default(true),
    scopeKey: text("scope_key"),
    firstSeenAt: tz("first_seen_at").notNull(),
    lastSeenAt: tz("last_seen_at").notNull(),
    hiddenAt: tz("hidden_at"),
    mergedInto: big("merged_into"),
  },
  (t) => [index("players_embark_name_idx").on(t.embarkName)],
);

/** Platform names and former Embark names; the current Embark name lives in players. */
export const playerNames = pgTable(
  "player_names",
  {
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    playerId: big("player_id").notNull().references(() => players.id),
    firstSeenAt: tz("first_seen_at").notNull(),
    lastSeenAt: tz("last_seen_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.name, t.playerId] }), index("player_names_player_idx").on(t.playerId)],
);

export const identityCandidates = pgTable(
  "identity_candidates",
  {
    id: big("id").generatedAlwaysAsIdentity().primaryKey(),
    playerA: big("player_a").notNull().references(() => players.id),
    playerB: big("player_b").notNull().references(() => players.id),
    reason: text("reason").notNull(),
    confidence: text("confidence").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: tz("created_at").notNull().defaultNow(),
    decidedAt: tz("decided_at"),
  },
  (t) => [unique().on(t.playerA, t.playerB, t.reason)],
);

export const ingestionRuns = pgTable("ingestion_runs", {
  id: big("id").generatedAlwaysAsIdentity().primaryKey(),
  command: text("command").notNull(),
  startedAt: tz("started_at").notNull(),
  finishedAt: tz("finished_at"),
  status: text("status").notNull(),
  filesApplied: integer("files_applied").notNull().default(0),
  filesRejected: integer("files_rejected").notNull().default(0),
  filesSkipped: integer("files_skipped").notNull().default(0),
  sourceFreshnessAt: tz("source_freshness_at"),
  error: text("error"),
  details: jsonb("details").$type<Record<string, unknown>>(),
});

export const snapshots = pgTable(
  "snapshots",
  {
    id: big("id").generatedAlwaysAsIdentity().primaryKey(),
    leaderboardId: smallint("leaderboard_id").notNull().references(() => leaderboards.id),
    kind: text("kind").notNull(),
    sourceFile: text("source_file").notNull(),
    baseFile: text("base_file"),
    seq: integer("seq"),
    sha256: text("sha256").notNull(),
    takenAt: tz("taken_at").notNull(),
    rowCount: integer("row_count").notNull(),
    addedCount: integer("added_count"),
    changedCount: integer("changed_count"),
    removedCount: integer("removed_count"),
    duplicates: integer("duplicates").notNull().default(0),
    unidentified: integer("unidentified").notNull().default(0),
    status: text("status").notNull(),
    reason: text("reason"),
    ingestionRunId: big("ingestion_run_id").references(() => ingestionRuns.id),
    ingestedAt: tz("ingested_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.leaderboardId, t.sourceFile), index("snapshots_board_taken_idx").on(t.leaderboardId, t.takenAt)],
);

export const rsEvents = pgTable(
  "rs_events",
  {
    playerId: big("player_id").notNull(),
    takenAt: tz("taken_at").notNull(),
    score: integer("score").notNull(),
    scoreDelta: integer("score_delta"),
    rank: integer("rank").notNull(),
    snapshotId: integer("snapshot_id").notNull(),
    leaderboardId: smallint("leaderboard_id").notNull(),
    leagueNumber: smallint("league_number"),
    clubTag: text("club_tag"),
  },
  (t) => [primaryKey({ columns: [t.leaderboardId, t.playerId, t.takenAt] })],
);

/** Daily closes as arrays: element i = close of day leaderboards.history_start_day + i - 1. */
export const playerHistory = pgTable(
  "player_history",
  {
    playerId: big("player_id").notNull(),
    leaderboardId: smallint("leaderboard_id").notNull(),
    scores: integer("scores").array().notNull(),
    ranks: smallint("ranks").array().notNull(),
    leagueNumbers: smallint("league_numbers").array().notNull(),
  },
  (t) => [primaryKey({ columns: [t.leaderboardId, t.playerId] }), index("player_history_player_idx").on(t.playerId)],
);

export const leaderboardCurrent = pgTable(
  "leaderboard_current",
  {
    playerId: big("player_id").notNull().references(() => players.id),
    firstSeenAt: tz("first_seen_at").notNull(),
    lastChangeAt: tz("last_change_at").notNull(),
    updatedAt: tz("updated_at").notNull(),
    score: integer("score").notNull(),
    rank: integer("rank").notNull(),
    delta24h: integer("delta_24h"),
    delta7d: integer("delta_7d"),
    leaderboardId: smallint("leaderboard_id").notNull().references(() => leaderboards.id),
    leagueNumber: smallint("league_number"),
    name: text("name").notNull(),
    clubTag: text("club_tag"),
    clubUuid: text("club_uuid"),
    officialClubName: text("official_club_name"),
    extra: jsonb("extra").$type<Record<string, unknown>>(),
  },
  (t) => [primaryKey({ columns: [t.leaderboardId, t.playerId] }), index("leaderboard_current_order_idx").on(t.leaderboardId, t.score, t.rank)],
);

export const seasonResults = pgTable(
  "season_results",
  {
    playerId: big("player_id").notNull().references(() => players.id),
    snapshotId: big("snapshot_id").notNull().references(() => snapshots.id),
    finalScore: integer("final_score").notNull(),
    finalRank: integer("final_rank").notNull(),
    leaderboardId: smallint("leaderboard_id").notNull().references(() => leaderboards.id),
    finalLeagueNumber: smallint("final_league_number"),
    finalLeague: text("final_league"),
    clubTag: text("club_tag"),
    clubUuid: text("club_uuid"),
    officialClubName: text("official_club_name"),
    extra: jsonb("extra").$type<Record<string, unknown>>(),
  },
  (t) => [primaryKey({ columns: [t.leaderboardId, t.playerId] }), index("season_results_player_idx").on(t.playerId)],
);

export const clubs = pgTable("clubs", {
  clubUuid: text("club_uuid").primaryKey(),
  tag: text("tag").notNull(),
  officialName: text("official_name"),
  firstSeenAt: tz("first_seen_at").notNull(),
  lastSeenAt: tz("last_seen_at").notNull(),
});

export const cutoffHistory = pgTable(
  "cutoff_history",
  {
    takenAt: tz("taken_at").notNull(),
    snapshotId: big("snapshot_id").notNull().references(() => snapshots.id),
    rowCount: integer("row_count").notNull(),
    rank1Score: integer("rank_1_score"),
    rank500Score: integer("rank_500_score"),
    lastScore: integer("last_score"),
    leaderboardId: smallint("leaderboard_id").notNull().references(() => leaderboards.id),
    leagueCounts: jsonb("league_counts").$type<Record<string, number>>(),
    projection: jsonb("projection").$type<Record<string, unknown>>(),
  },
  (t) => [primaryKey({ columns: [t.leaderboardId, t.takenAt] })],
);

export const hiddenProfiles = pgTable("hidden_profiles", {
  playerId: big("player_id").primaryKey().references(() => players.id),
  requestedAt: tz("requested_at").notNull(),
  proof: text("proof"),
  appliedAt: tz("applied_at"),
  reason: text("reason"),
});

/** Migration 0004 : un calcul du Rating par classement, avec les références de population du moment. */
export const ratingRuns = pgTable(
  "rating_runs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    leaderboardId: smallint("leaderboard_id").notNull().references(() => leaderboards.id),
    ratingVersion: text("rating_version").notNull(),
    computedAt: tz("computed_at").notNull(),
    dataUntil: tz("data_until").notNull(),
    dataSince: tz("data_since").notNull(),
    players: integer("players").notNull(),
    refs: jsonb("refs").$type<Record<string, unknown>>().notNull(),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("rating_runs_board_idx").on(t.leaderboardId, t.computedAt)],
);

/** Migration 0004 : dernière note de chaque joueur d'un classement (remplacée à chaque calcul). */
export const ratings = pgTable(
  "ratings",
  {
    leaderboardId: smallint("leaderboard_id").notNull().references(() => leaderboards.id),
    playerId: big("player_id").notNull().references(() => players.id),
    runId: integer("run_id").notNull(),
    ratingVersion: text("rating_version").notNull(),
    rating: smallint("rating"),
    raw: real("raw"),
    provisional: boolean("provisional").notNull(),
    level: real("level").notNull(),
    peak: real("peak").notNull(),
    momentum: real("momentum"),
    momentumZ: real("momentum_z"),
    delta24h: integer("delta_24h"),
    delta7d: integer("delta_7d"),
    delta30d: integer("delta_30d"),
    drawdown: real("drawdown"),
    consistency: real("consistency"),
    legacy: real("legacy").notNull(),
    activeDays30: smallint("active_days_30").notNull(),
    hotStreak: boolean("hot_streak").notNull().default(false),
    anomalies: smallint("anomalies").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.leaderboardId, t.playerId] }), index("ratings_order_idx").on(t.leaderboardId, t.raw)],
);
