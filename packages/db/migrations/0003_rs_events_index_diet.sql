-- FINALS HQ · migration 0003 · régime d'index sur rs_events (sprint 1b, mesure après réimport).
--
-- Mesuré en CI le 2026-11-06 : 48 685 événements = 8,2 Mo, dont 4,4 Mo d'index (≈ 170 octets par ligne).
-- L'index (player_id, taken_at) doublait la clé primaire (leaderboard_id, player_id, taken_at) : les profils
-- ne lisent que trois classements en direct (ranked, World Tour, sponsor) et passent par la clé primaire avec
-- leaderboard_id IN (...). Le supprimer enlève un tiers du volume de rs_events sur toutes les partitions.
DROP INDEX IF EXISTS rs_events_player_idx;
