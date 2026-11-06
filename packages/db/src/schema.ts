/**
 * Schéma Drizzle de FINALS HQ. La vérité est dans migrations/*.sql ; ce fichier le reflète pour
 * typer les requêtes. `rs_events` est partitionnée par mois (voir ensure_rs_events_partition).
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
  key: text("key").primaryKey(),
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

export const playerNames = pgTable(
  "player_names",
  {
    playerId: big("player_id").notNull().references(() => players.id),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    firstSeenAt: tz("first_seen_at").notNull(),
    lastSeenAt: tz("last_seen_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.kind, t.name] }), index("player_names_kind_name_idx").on(t.kind, t.name)],
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
    leaderboardKey: text("leaderboard_key").notNull().references(() => leaderboards.key),
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
  (t) => [unique().on(t.leaderboardKey, t.sourceFile), index("snapshots_key_taken_idx").on(t.leaderboardKey, t.takenAt)],
);

export const rsEvents = pgTable(
  "rs_events",
  {
    leaderboardKey: text("leaderboard_key").notNull(),
    playerId: big("player_id").notNull(),
    takenAt: tz("taken_at").notNull(),
    score: big("score").notNull(),
    scoreDelta: big("score_delta"),
    rank: integer("rank").notNull(),
    leagueNumber: smallint("league_number"),
    clubTag: text("club_tag"),
    snapshotId: big("snapshot_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.leaderboardKey, t.playerId, t.takenAt] }), index("rs_events_player_idx").on(t.playerId, t.takenAt)],
);

export const rankDaily = pgTable(
  "rank_daily",
  {
    leaderboardKey: text("leaderboard_key").notNull(),
    playerId: big("player_id").notNull(),
    day: date("day").notNull(),
    rank: integer("rank").notNull(),
    score: big("score").notNull(),
    leagueNumber: smallint("league_number"),
  },
  (t) => [primaryKey({ columns: [t.leaderboardKey, t.playerId, t.day] }), index("rank_daily_player_idx").on(t.playerId, t.day)],
);

export const leaderboardCurrent = pgTable(
  "leaderboard_current",
  {
    leaderboardKey: text("leaderboard_key").notNull().references(() => leaderboards.key),
    playerId: big("player_id").notNull().references(() => players.id),
    rank: integer("rank").notNull(),
    score: big("score").notNull(),
    leagueNumber: smallint("league_number"),
    league: text("league"),
    clubTag: text("club_tag"),
    clubUuid: text("club_uuid"),
    officialClubName: text("official_club_name"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    firstSeenAt: tz("first_seen_at").notNull(),
    lastChangeAt: tz("last_change_at").notNull(),
    updatedAt: tz("updated_at").notNull(),
    delta24h: big("delta_24h"),
    delta7d: big("delta_7d"),
  },
  (t) => [primaryKey({ columns: [t.leaderboardKey, t.playerId] }), index("leaderboard_current_order_idx").on(t.leaderboardKey, t.score, t.rank)],
);

export const seasonResults = pgTable(
  "season_results",
  {
    leaderboardKey: text("leaderboard_key").notNull().references(() => leaderboards.key),
    playerId: big("player_id").notNull().references(() => players.id),
    finalRank: integer("final_rank").notNull(),
    finalScore: big("final_score").notNull(),
    finalLeagueNumber: smallint("final_league_number"),
    finalLeague: text("final_league"),
    clubTag: text("club_tag"),
    clubUuid: text("club_uuid"),
    officialClubName: text("official_club_name"),
    peakScore: big("peak_score"),
    peakAt: tz("peak_at"),
    extra: jsonb("extra").$type<Record<string, unknown>>(),
    snapshotId: big("snapshot_id").notNull().references(() => snapshots.id),
  },
  (t) => [primaryKey({ columns: [t.leaderboardKey, t.playerId] }), index("season_results_player_idx").on(t.playerId)],
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
    leaderboardKey: text("leaderboard_key").notNull().references(() => leaderboards.key),
    takenAt: tz("taken_at").notNull(),
    snapshotId: big("snapshot_id").notNull().references(() => snapshots.id),
    rowCount: integer("row_count").notNull(),
    rank1Score: big("rank_1_score"),
    rank500Score: big("rank_500_score"),
    lastScore: big("last_score"),
    leagueCounts: jsonb("league_counts").$type<Record<string, number>>(),
    projection: jsonb("projection").$type<Record<string, unknown>>(),
  },
  (t) => [primaryKey({ columns: [t.leaderboardKey, t.takenAt] })],
);

export const hiddenProfiles = pgTable("hidden_profiles", {
  playerId: big("player_id").primaryKey().references(() => players.id),
  requestedAt: tz("requested_at").notNull(),
  proof: text("proof"),
  appliedAt: tz("applied_at"),
  reason: text("reason"),
});
