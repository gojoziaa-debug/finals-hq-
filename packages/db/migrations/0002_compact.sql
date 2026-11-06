-- FINALS HQ · migration 0002 · compaction (sprint 1b).
--
-- Le schéma 0001 pesait 617 Mo après l'import des archives et grossissait de 30 à 50 Mo par jour,
-- pour 500 Mo de quota Supabase Free. Tout ce qui se recharge depuis le dépôt de données est recréé :
--   · identifiant numérique de classement (2 octets) à la place de la clé texte (jusqu'à 27 octets) ;
--   · historique quotidien compacté : un tableau par (classement, joueur) au lieu d'une ligne par jour ;
--   · événements bruts en partitions journalières, purgées après quelques jours, et seulement pour
--     les classements dont history = 'events' (ranked, World Tour, sponsor) ;
--   · noms : un seul index composite, le nom Embark courant reste dans players, recherche floue sur
--     players.embark_name seulement ;
--   · classement courant sans copie JSON brute (reconstruite depuis les colonnes pour les deltas).
-- Les scores tiennent dans integer : maximum observé 187 897 000 (World Tour S6), pour 2 147 483 647.

DROP TABLE IF EXISTS hidden_profiles, cutoff_history, season_results, leaderboard_current, rank_daily, rs_events,
  player_history, clubs, snapshots, identity_candidates, player_names, players, ingestion_runs, leaderboards CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS ensure_rs_events_partition(date);
--> statement-breakpoint
CREATE TABLE leaderboards (
  -- identifiant stable du catalogue (packages/db/src/catalog.ts) ; ne jamais renuméroter
  id smallint PRIMARY KEY,
  key text NOT NULL UNIQUE,
  upstream_id text NOT NULL,
  platform text,
  kind text NOT NULL,
  mode text NOT NULL,
  name text NOT NULL,
  season_id text REFERENCES seasons(id),
  score_field text NOT NULL,
  schema_version text NOT NULL,
  has_leagues boolean NOT NULL DEFAULT false,
  is_live boolean NOT NULL DEFAULT false,
  -- 'events' : chaque changement de score gardé quelques jours dans rs_events ; 'daily' : clôtures seulement
  history text NOT NULL DEFAULT 'daily',
  -- jour de la première clôture quotidienne : indice 1 des tableaux de player_history
  history_start_day date
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
CREATE INDEX players_embark_name_trgm_idx ON players USING gin (embark_name gin_trgm_ops) WHERE linkable AND merged_into IS NULL;
--> statement-breakpoint
-- Noms de plateforme (steam, psn, xbox) et anciens noms Embark (kind = 'embark') ; le nom Embark courant est dans players.
CREATE TABLE player_names (
  kind text NOT NULL,
  name text NOT NULL,
  player_id bigint NOT NULL REFERENCES players(id),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY (kind, name, player_id)
);
--> statement-breakpoint
CREATE INDEX player_names_player_idx ON player_names (player_id);
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
  leaderboard_id smallint NOT NULL REFERENCES leaderboards(id),
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
  UNIQUE (leaderboard_id, source_file)
);
--> statement-breakpoint
CREATE INDEX snapshots_board_taken_idx ON snapshots (leaderboard_id, taken_at DESC);
--> statement-breakpoint
-- Colonnes ordonnées des plus larges aux plus étroites pour limiter le remplissage d'alignement (~60 octets par ligne).
CREATE TABLE rs_events (
  player_id bigint NOT NULL,
  taken_at timestamptz NOT NULL,
  score integer NOT NULL,
  score_delta integer,
  rank integer NOT NULL,
  snapshot_id integer NOT NULL,
  leaderboard_id smallint NOT NULL,
  league_number smallint,
  club_tag text,
  PRIMARY KEY (leaderboard_id, player_id, taken_at)
) PARTITION BY RANGE (taken_at);
--> statement-breakpoint
CREATE INDEX rs_events_player_idx ON rs_events (player_id, taken_at);
--> statement-breakpoint
CREATE TABLE rs_events_default PARTITION OF rs_events DEFAULT;
--> statement-breakpoint
-- Une partition par jour UTC (rs_events_YYYY_MM_DD) : la purge supprime les partitions entières, sans vacuum.
CREATE FUNCTION ensure_rs_events_partition(any_day date) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  day_end date := any_day + 1;
  partition_name text := 'rs_events_' || to_char(any_day, 'YYYY_MM_DD');
BEGIN
  IF to_regclass(partition_name) IS NULL THEN
    -- Les lignes arrivées dans la partition par défaut pour ce jour sont déplacées, sinon la création échoue.
    CREATE TEMP TABLE rs_events_moving (LIKE rs_events) ON COMMIT DROP;
    EXECUTE format(
      'WITH moved AS (DELETE FROM rs_events_default WHERE taken_at >= %L AND taken_at < %L RETURNING *) INSERT INTO rs_events_moving SELECT * FROM moved',
      any_day, day_end);
    EXECUTE format('CREATE TABLE %I PARTITION OF rs_events FOR VALUES FROM (%L) TO (%L)', partition_name, any_day, day_end);
    INSERT INTO rs_events SELECT * FROM rs_events_moving;
    DROP TABLE rs_events_moving;
  END IF;
  RETURN partition_name;
END
$$;
--> statement-breakpoint
-- Historique quotidien compacté : l'élément i des tableaux = clôture du jour history_start_day + i - 1 du classement
-- (NULL = absent du top 10 000 ce jour-là ; un tableau plus court = pas encore revu depuis).
CREATE TABLE player_history (
  player_id bigint NOT NULL,
  leaderboard_id smallint NOT NULL,
  scores integer[] NOT NULL DEFAULT '{}',
  ranks smallint[] NOT NULL DEFAULT '{}',
  league_numbers smallint[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (leaderboard_id, player_id)
);
--> statement-breakpoint
CREATE INDEX player_history_player_idx ON player_history (player_id);
--> statement-breakpoint
CREATE TABLE leaderboard_current (
  player_id bigint NOT NULL REFERENCES players(id),
  first_seen_at timestamptz NOT NULL,
  last_change_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  score integer NOT NULL,
  rank integer NOT NULL,
  -- variation depuis la clôture de la veille / d'il y a 7 jours (player_history) ; NULL si inconnue
  delta_24h integer,
  delta_7d integer,
  leaderboard_id smallint NOT NULL REFERENCES leaderboards(id),
  league_number smallint,
  -- nom tel qu'affiché sur ce classement (peut différer de players.embark_name juste après un renommage)
  name text NOT NULL,
  club_tag text,
  club_uuid text,
  official_club_name text,
  -- champs hors du socle commun de la ligne API (change…), pour reconstruire la ligne avant un delta
  extra jsonb,
  PRIMARY KEY (leaderboard_id, player_id)
);
--> statement-breakpoint
CREATE INDEX leaderboard_current_order_idx ON leaderboard_current (leaderboard_id, score DESC, rank);
--> statement-breakpoint
CREATE INDEX leaderboard_current_club_idx ON leaderboard_current (club_uuid) WHERE club_uuid IS NOT NULL;
--> statement-breakpoint
CREATE TABLE season_results (
  player_id bigint NOT NULL REFERENCES players(id),
  snapshot_id bigint NOT NULL REFERENCES snapshots(id),
  final_score integer NOT NULL,
  final_rank integer NOT NULL,
  leaderboard_id smallint NOT NULL REFERENCES leaderboards(id),
  final_league_number smallint,
  final_league text,
  club_tag text,
  club_uuid text,
  official_club_name text,
  -- champs hors du socle commun (xp, level, sponsor…) ; le fichier source garde la ligne complète
  extra jsonb,
  PRIMARY KEY (leaderboard_id, player_id)
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
  taken_at timestamptz NOT NULL,
  snapshot_id bigint NOT NULL REFERENCES snapshots(id),
  row_count integer NOT NULL,
  rank_1_score integer,
  rank_500_score integer,
  last_score integer,
  leaderboard_id smallint NOT NULL REFERENCES leaderboards(id),
  league_counts jsonb,
  projection jsonb,
  PRIMARY KEY (leaderboard_id, taken_at)
);
--> statement-breakpoint
CREATE TABLE hidden_profiles (
  player_id bigint PRIMARY KEY REFERENCES players(id),
  requested_at timestamptz NOT NULL,
  proof text,
  applied_at timestamptz,
  reason text
);
