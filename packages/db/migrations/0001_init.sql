-- FINALS HQ · migration 0001 · schéma initial (phase C), sprint 1.
-- Chaque instruction est séparée par la ligne "--> statement-breakpoint" (exécution une par une).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE seasons (
  id text PRIMARY KEY,
  name text NOT NULL,
  ordinal integer NOT NULL UNIQUE,
  starts_on date,
  ends_on date,
  is_live boolean NOT NULL DEFAULT false,
  has_comparable_leagues boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE TABLE leaderboards (
  key text PRIMARY KEY,
  upstream_id text NOT NULL,
  platform text,
  kind text NOT NULL,
  mode text NOT NULL,
  name text NOT NULL,
  season_id text REFERENCES seasons(id),
  score_field text NOT NULL,
  schema_version text NOT NULL,
  has_leagues boolean NOT NULL DEFAULT false,
  is_live boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE TABLE players (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  embark_name text NOT NULL,
  steam_name text,
  psn_name text,
  xbox_name text,
  -- false : identité propre à un classement (noms sans #, anciennes archives), exclue de la recherche
  linkable boolean NOT NULL DEFAULT true,
  scope_key text,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  hidden_at timestamptz,
  merged_into bigint REFERENCES players(id)
);
--> statement-breakpoint
CREATE INDEX players_embark_name_idx ON players (embark_name) WHERE linkable AND merged_into IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX players_scope_name_idx ON players (scope_key, embark_name) WHERE NOT linkable;
--> statement-breakpoint
CREATE TABLE player_names (
  player_id bigint NOT NULL REFERENCES players(id),
  kind text NOT NULL,
  name text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY (player_id, kind, name)
);
--> statement-breakpoint
CREATE INDEX player_names_kind_name_idx ON player_names (kind, name);
--> statement-breakpoint
CREATE INDEX player_names_name_trgm_idx ON player_names USING gin (name gin_trgm_ops);
--> statement-breakpoint
CREATE TABLE identity_candidates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_a bigint NOT NULL REFERENCES players(id),
  player_b bigint NOT NULL REFERENCES players(id),
  reason text NOT NULL,
  confidence text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (player_a, player_b, reason)
);
--> statement-breakpoint
CREATE TABLE ingestion_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  command text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL,
  files_applied integer NOT NULL DEFAULT 0,
  files_rejected integer NOT NULL DEFAULT 0,
  files_skipped integer NOT NULL DEFAULT 0,
  source_freshness_at timestamptz,
  error text,
  details jsonb
);
--> statement-breakpoint
CREATE TABLE snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  leaderboard_key text NOT NULL REFERENCES leaderboards(key),
  kind text NOT NULL,
  source_file text NOT NULL,
  base_file text,
  seq integer,
  sha256 text NOT NULL,
  taken_at timestamptz NOT NULL,
  row_count integer NOT NULL,
  added_count integer,
  changed_count integer,
  removed_count integer,
  duplicates integer NOT NULL DEFAULT 0,
  unidentified integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  reason text,
  ingestion_run_id bigint REFERENCES ingestion_runs(id),
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (leaderboard_key, source_file)
);
--> statement-breakpoint
CREATE INDEX snapshots_key_taken_idx ON snapshots (leaderboard_key, taken_at DESC);
--> statement-breakpoint
CREATE TABLE rs_events (
  leaderboard_key text NOT NULL,
  player_id bigint NOT NULL,
  taken_at timestamptz NOT NULL,
  score bigint NOT NULL,
  score_delta bigint,
  rank integer NOT NULL,
  league_number smallint,
  club_tag text,
  snapshot_id bigint NOT NULL,
  PRIMARY KEY (leaderboard_key, player_id, taken_at)
) PARTITION BY RANGE (taken_at);
--> statement-breakpoint
CREATE INDEX rs_events_player_idx ON rs_events (player_id, taken_at);
--> statement-breakpoint
CREATE INDEX rs_events_key_taken_idx ON rs_events (leaderboard_key, taken_at);
--> statement-breakpoint
CREATE TABLE rs_events_default PARTITION OF rs_events DEFAULT;
--> statement-breakpoint
CREATE FUNCTION ensure_rs_events_partition(any_day date) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  month_start date := date_trunc('month', any_day)::date;
  month_end date := (date_trunc('month', any_day) + interval '1 month')::date;
  partition_name text := 'rs_events_' || to_char(month_start, 'YYYY_MM');
BEGIN
  IF to_regclass(partition_name) IS NULL THEN
    -- Les lignes arrivées dans la partition par défaut pour ce mois sont déplacées, sinon la création échoue.
    CREATE TEMP TABLE rs_events_moving (LIKE rs_events) ON COMMIT DROP;
    EXECUTE format(
      'WITH moved AS (DELETE FROM rs_events_default WHERE taken_at >= %L AND taken_at < %L RETURNING *) INSERT INTO rs_events_moving SELECT * FROM moved',
      month_start, month_end);
    EXECUTE format('CREATE TABLE %I PARTITION OF rs_events FOR VALUES FROM (%L) TO (%L)', partition_name, month_start, month_end);
    INSERT INTO rs_events SELECT * FROM rs_events_moving;
    DROP TABLE rs_events_moving;
  END IF;
  RETURN partition_name;
END
$$;
--> statement-breakpoint
CREATE TABLE rank_daily (
  leaderboard_key text NOT NULL,
  player_id bigint NOT NULL,
  day date NOT NULL,
  rank integer NOT NULL,
  score bigint NOT NULL,
  league_number smallint,
  PRIMARY KEY (leaderboard_key, player_id, day)
);
--> statement-breakpoint
CREATE INDEX rank_daily_player_idx ON rank_daily (player_id, day);
--> statement-breakpoint
CREATE TABLE leaderboard_current (
  leaderboard_key text NOT NULL REFERENCES leaderboards(key),
  player_id bigint NOT NULL REFERENCES players(id),
  rank integer NOT NULL,
  score bigint NOT NULL,
  league_number smallint,
  league text,
  club_tag text,
  club_uuid text,
  official_club_name text,
  raw jsonb NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_change_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  delta_24h bigint,
  delta_7d bigint,
  PRIMARY KEY (leaderboard_key, player_id)
);
--> statement-breakpoint
CREATE INDEX leaderboard_current_order_idx ON leaderboard_current (leaderboard_key, score DESC, rank);
--> statement-breakpoint
CREATE INDEX leaderboard_current_club_idx ON leaderboard_current (club_uuid) WHERE club_uuid IS NOT NULL;
--> statement-breakpoint
CREATE TABLE season_results (
  leaderboard_key text NOT NULL REFERENCES leaderboards(key),
  player_id bigint NOT NULL REFERENCES players(id),
  final_rank integer NOT NULL,
  final_score bigint NOT NULL,
  final_league_number smallint,
  final_league text,
  club_tag text,
  club_uuid text,
  official_club_name text,
  peak_score bigint,
  peak_at timestamptz,
  -- champs hors du socle commun (fame, xp, level, sponsor…) ; le fichier source garde la ligne complète
  extra jsonb,
  snapshot_id bigint NOT NULL REFERENCES snapshots(id),
  PRIMARY KEY (leaderboard_key, player_id)
);
--> statement-breakpoint
CREATE INDEX season_results_player_idx ON season_results (player_id);
--> statement-breakpoint
CREATE TABLE clubs (
  club_uuid text PRIMARY KEY,
  tag text NOT NULL,
  official_name text,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE cutoff_history (
  leaderboard_key text NOT NULL REFERENCES leaderboards(key),
  taken_at timestamptz NOT NULL,
  snapshot_id bigint NOT NULL REFERENCES snapshots(id),
  row_count integer NOT NULL,
  rank_1_score bigint,
  rank_500_score bigint,
  last_score bigint,
  league_counts jsonb,
  projection jsonb,
  PRIMARY KEY (leaderboard_key, taken_at)
);
--> statement-breakpoint
CREATE TABLE hidden_profiles (
  player_id bigint PRIMARY KEY REFERENCES players(id),
  requested_at timestamptz NOT NULL,
  proof text,
  applied_at timestamptz,
  reason text
);
