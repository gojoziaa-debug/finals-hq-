-- FINALS HQ · migration 0005 · demandes de masquage et compteurs d'audience (sprint 6).
--
-- hidden_profiles (créée en 0002, jamais remplie) devient la file des demandes de masquage envoyées par le
--   formulaire /privacy/request : une ligne par joueur. Le site n'y écrit qu'une demande « pending » ; seul
--   le worker (commande `privacy`, lancée par GOJO) l'applique en posant players.hidden_at, la refuse ou la
--   lève. Les coordonnées de contact sont effacées 30 jours après la décision (purge du worker).
-- usage_counters : compteurs agrégés par jour, sans identifiant de visiteur ni adresse IP (profil vu, carte
--   générée, joueur suivi, recherche sans résultat, partage). Quelques dizaines de lignes par jour.
ALTER TABLE hidden_profiles
  ADD COLUMN status text NOT NULL DEFAULT 'pending',
  ADD COLUMN contact text,
  ADD COLUMN message text,
  ADD COLUMN locale text,
  ADD COLUMN decided_at timestamptz,
  ADD CONSTRAINT hidden_profiles_status_check CHECK (status IN ('pending', 'applied', 'rejected', 'lifted'));
--> statement-breakpoint
CREATE INDEX hidden_profiles_pending_idx ON hidden_profiles (requested_at) WHERE status = 'pending';
--> statement-breakpoint
CREATE TABLE usage_counters (
  day date NOT NULL,
  event text NOT NULL,
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event)
);
