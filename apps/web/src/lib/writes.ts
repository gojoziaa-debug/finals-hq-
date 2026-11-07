/**
 * Les deux seules écritures du site (sprint 6) : une demande de masquage « pending » et un compteur d'audience
 * agrégé par jour. Rien d'autre n'écrit ; appliquer un masquage reste une décision humaine (worker privacy).
 */
import { queryRows, type Db } from "@finals-hq/db";
import { sql } from "drizzle-orm";

export const USAGE_EVENTS = ["profile_view", "card", "story", "follow", "search_empty", "share", "hide_request"] as const;
export type UsageEvent = (typeof USAGE_EVENTS)[number];

export function isUsageEvent(e: unknown): e is UsageEvent {
  return typeof e === "string" && (USAGE_EVENTS as readonly string[]).includes(e);
}

export async function bumpUsage(db: Db, event: UsageEvent, now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  await db.execute(sql`INSERT INTO usage_counters (day, event, n) VALUES (${day}::date, ${event}, 1)
                       ON CONFLICT (day, event) DO UPDATE SET n = usage_counters.n + 1`);
}

export type HideRequestResult = "created" | "already_pending" | "already_hidden";

/**
 * Enregistre la demande. Une demande déjà en attente ou déjà appliquée n'est pas réécrite (pas d'écrasement des
 * coordonnées par un tiers) ; une demande refusée ou levée peut être refaite.
 */
export async function insertHideRequest(db: Db, input: { playerId: string; contact: string; message: string; locale: string }, now = new Date()): Promise<HideRequestResult> {
  const rows = await queryRows<{ status: string }>(
    db,
    sql`INSERT INTO hidden_profiles (player_id, requested_at, status, contact, message, locale)
        VALUES (${input.playerId}::bigint, ${now.toISOString()}::timestamptz, 'pending', ${input.contact}, ${input.message || null}, ${input.locale})
        ON CONFLICT (player_id) DO UPDATE SET status = 'pending', requested_at = EXCLUDED.requested_at, contact = EXCLUDED.contact,
          message = EXCLUDED.message, locale = EXCLUDED.locale, decided_at = NULL
        WHERE hidden_profiles.status IN ('rejected', 'lifted')
        RETURNING status`,
  );
  if (rows.length > 0) return "created";
  const [existing] = await queryRows<{ status: string }>(db, sql`SELECT status FROM hidden_profiles WHERE player_id = ${input.playerId}::bigint`);
  return existing?.status === "applied" ? "already_hidden" : "already_pending";
}
