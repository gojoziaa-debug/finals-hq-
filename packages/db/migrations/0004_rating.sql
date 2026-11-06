-- FINALS HQ · migration 0004 · FINALS HQ Rating v1 (sprint 5).
--
-- rating_runs : un calcul par classement (au plus un par heure), avec les références de population mesurées
--   ce jour-là (médiane et MAD par fenêtre, distribution des reculs moyens, seuil d'anomalie) : le rapport
--   de calibration et la page Méthodologie les lisent ; quelques Ko par ligne, purgées après 60 jours.
-- ratings : la dernière note de chaque joueur du classement, versionnée (rating_version), remplacée à chaque
--   calcul ; ≈ 10 000 lignes de ~120 octets par classement, soit ~2 Mo index compris.
-- La note n'est pas affichée publiquement avant la semaine de calibration : c'est le site qui décide, la base
-- garde toujours le calcul complet.
CREATE TABLE rating_runs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  leaderboard_id smallint NOT NULL REFERENCES leaderboards(id),
  rating_version text NOT NULL,
  computed_at timestamptz NOT NULL,
  -- dernier relevé pris en compte et premier relevé du classement (jours observés = écart des deux)
  data_until timestamptz NOT NULL,
  data_since timestamptz NOT NULL,
  players integer NOT NULL,
  refs jsonb NOT NULL,
  duration_ms integer
);
--> statement-breakpoint
CREATE INDEX rating_runs_board_idx ON rating_runs (leaderboard_id, computed_at DESC);
--> statement-breakpoint
CREATE TABLE ratings (
  leaderboard_id smallint NOT NULL REFERENCES leaderboards(id),
  player_id bigint NOT NULL REFERENCES players(id),
  run_id integer NOT NULL,
  rating_version text NOT NULL,
  rating smallint,
  raw real,
  provisional boolean NOT NULL,
  level real NOT NULL,
  peak real NOT NULL,
  momentum real,
  momentum_z real,
  delta_24h integer,
  delta_7d integer,
  delta_30d integer,
  drawdown real,
  consistency real,
  legacy real NOT NULL,
  active_days_30 smallint NOT NULL,
  hot_streak boolean NOT NULL DEFAULT false,
  anomalies smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (leaderboard_id, player_id)
);
--> statement-breakpoint
CREATE INDEX ratings_order_idx ON ratings (leaderboard_id, raw DESC NULLS LAST);
