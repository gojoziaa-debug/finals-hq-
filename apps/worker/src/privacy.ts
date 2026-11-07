/**
 * Demandes de masquage (RGPD, sprint 6). Le site n'enregistre qu'une demande « pending » dans hidden_profiles ;
 * c'est ici, à la main, qu'on l'applique (players.hidden_at), qu'on la refuse ou qu'on lève un masquage.
 *
 * Les journaux GitHub Actions de ce dépôt sont publics : rien ici n'écrit les coordonnées de contact ni le
 * message en clair, sauf avec --show-contact (à n'utiliser que sur son propre PC). Pour lire une demande en
 * entier : éditeur SQL de Supabase, `SELECT * FROM hidden_profiles WHERE status = 'pending'`.
 */
import { queryRows, timestamptz, type Db } from "@finals-hq/db";
import { sql } from "drizzle-orm";

/** Promesse de la page de confidentialité : masquage appliqué sous 48 h. L'alerte part à 24 h pour laisser de la marge. */
export const PENDING_ALERT_HOURS = 24;
/** Coordonnées et message effacés 30 jours après la décision. */
export const CONTACT_KEEP_DAYS = 30;

export type PrivacyStatus = "pending" | "applied" | "rejected" | "lifted";

export interface PrivacyRequest {
  playerId: string;
  name: string;
  status: PrivacyStatus;
  requestedAt: string;
  decidedAt: string | null;
  /** Masqué (« j***@g***.com ») sauf avec showContact. */
  contact: string | null;
  message: string | null;
  reason: string | null;
  hiddenNow: boolean;
}

/** « jean.dupont@gmail.com » → « j***@g***.com » ; « pseudo » (Discord) → « p*** ». */
export function maskContact(contact: string | null): string | null {
  if (!contact) return null;
  const c = contact.trim();
  const at = c.indexOf("@");
  if (at > 0) {
    const domain = c.slice(at + 1);
    const dot = domain.lastIndexOf(".");
    const tld = dot > 0 ? domain.slice(dot) : "";
    return `${c[0]}***@${domain[0] ?? ""}***${tld}`;
  }
  return `${c[0]}***`;
}

/**
 * Retrouve un joueur par identifiant numérique, pseudo exact (« GOJO#6255 ») ou slug d'URL (« GOJO-6255 »).
 * Joueurs fusionnés : on suit merged_into jusqu'à l'identité gardée.
 */
export async function findPlayer(db: Db, ref: string): Promise<{ id: string; name: string } | null> {
  const raw = ref.trim();
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // slug mal encodé : on cherche tel quel
  }
  const slug = /^(.*)-(\d{4})$/.exec(decoded);
  const names = [decoded, ...(slug ? [`${slug[1]}#${slug[2]}`] : [])];
  const rows = /^\d+$/.test(raw)
    ? await queryRows<{ id: string; embark_name: string; merged_into: string | null }>(db, sql`SELECT id::text, embark_name, merged_into::text FROM players WHERE id = ${raw}::bigint`)
    : await queryRows<{ id: string; embark_name: string; merged_into: string | null }>(
        db,
        sql`SELECT id::text, embark_name, merged_into::text FROM players
            WHERE lower(embark_name) IN (${sql.join(names.map((n) => sql`lower(${n})`), sql`, `)}) AND linkable
            ORDER BY merged_into IS NULL DESC, last_seen_at DESC LIMIT 1`,
      );
  let row = rows[0];
  for (let hops = 0; row?.merged_into && hops < 5; hops++) {
    [row] = await queryRows<{ id: string; embark_name: string; merged_into: string | null }>(db, sql`SELECT id::text, embark_name, merged_into::text FROM players WHERE id = ${row.merged_into}::bigint`);
  }
  return row ? { id: row.id, name: row.embark_name } : null;
}

export async function listRequests(db: Db, options: { all?: boolean; showContact?: boolean } = {}): Promise<PrivacyRequest[]> {
  const rows = await queryRows<{ player_id: string; name: string; status: PrivacyStatus; requested_at: Date | string; decided_at: Date | string | null; contact: string | null; message: string | null; reason: string | null; hidden: boolean }>(
    db,
    sql`SELECT h.player_id::text, p.embark_name AS name, h.status, h.requested_at, h.decided_at, h.contact, h.message, h.reason, (p.hidden_at IS NOT NULL) AS hidden
        FROM hidden_profiles h JOIN players p ON p.id = h.player_id
        ${options.all ? sql`` : sql`WHERE h.status = 'pending'`}
        ORDER BY h.requested_at`,
  );
  const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());
  return rows.map((r) => ({
    playerId: r.player_id,
    name: r.name,
    status: r.status,
    requestedAt: iso(r.requested_at)!,
    decidedAt: iso(r.decided_at),
    contact: options.showContact ? r.contact : maskContact(r.contact),
    message: options.showContact ? r.message : r.message ? `(${r.message.length} caractères)` : null,
    reason: r.reason,
    hiddenNow: r.hidden,
  }));
}

/**
 * Masque le profil : le site ne montre plus le pseudo nulle part (classements, recherche, clubs, Rating,
 * cartes de partage) dès que ses caches expirent (2 min au plus, 10 min pour les cartes). Crée la demande si
 * elle est arrivée par un autre canal (e-mail, Discord).
 */
export async function applyHide(db: Db, playerId: string, reason: string | null, now = new Date()): Promise<void> {
  await db.execute(sql`UPDATE players SET hidden_at = ${timestamptz(now)} WHERE id = ${playerId}::bigint AND hidden_at IS NULL`);
  await db.execute(
    sql`INSERT INTO hidden_profiles (player_id, requested_at, status, decided_at, applied_at, reason)
        VALUES (${playerId}::bigint, ${timestamptz(now)}, 'applied', ${timestamptz(now)}, ${timestamptz(now)}, ${reason})
        ON CONFLICT (player_id) DO UPDATE SET status = 'applied', decided_at = EXCLUDED.decided_at, applied_at = EXCLUDED.applied_at,
          reason = COALESCE(EXCLUDED.reason, hidden_profiles.reason)`,
  );
}

/** Refus (demande d'un tiers, preuve impossible) : le profil reste visible, la raison est gardée. */
export async function rejectRequest(db: Db, playerId: string, reason: string, now = new Date()): Promise<boolean> {
  const rows = await queryRows<{ player_id: string }>(
    db,
    sql`UPDATE hidden_profiles SET status = 'rejected', decided_at = ${timestamptz(now)}, reason = ${reason}
        WHERE player_id = ${playerId}::bigint AND status = 'pending' RETURNING player_id::text`,
  );
  return rows.length > 0;
}

/** Le joueur veut réapparaître : on lève le masquage, la ligne reste comme trace (statut lifted). */
export async function liftHide(db: Db, playerId: string, now = new Date()): Promise<void> {
  await db.execute(sql`UPDATE players SET hidden_at = NULL WHERE id = ${playerId}::bigint`);
  await db.execute(sql`UPDATE hidden_profiles SET status = 'lifted', decided_at = ${timestamptz(now)} WHERE player_id = ${playerId}::bigint`);
}

/** Efface coordonnées et message des demandes décidées depuis plus de CONTACT_KEEP_DAYS jours. */
export async function purgeContacts(db: Db, now = new Date(), keepDays = CONTACT_KEEP_DAYS): Promise<number> {
  const limit = new Date(now.getTime() - keepDays * 86_400_000);
  const rows = await queryRows<{ player_id: string }>(
    db,
    sql`UPDATE hidden_profiles SET contact = NULL, message = NULL
        WHERE status <> 'pending' AND decided_at < ${timestamptz(limit)} AND (contact IS NOT NULL OR message IS NOT NULL)
        RETURNING player_id::text`,
  );
  return rows.length;
}

/** Totaux d'audience gardés 25 mois au plus (page de confidentialité). */
export async function purgeUsage(db: Db, now = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - 760 * 86_400_000).toISOString().slice(0, 10);
  const rows = await queryRows<{ day: string }>(db, sql`DELETE FROM usage_counters WHERE day < ${limit}::date RETURNING day::text`);
  return rows.length;
}

/** Demandes en attente depuis plus de PENDING_ALERT_HOURS heures : le workflow échoue et GitHub prévient par e-mail. */
export async function overdueRequests(db: Db, now = new Date(), hours = PENDING_ALERT_HOURS): Promise<PrivacyRequest[]> {
  const limit = now.getTime() - hours * 3_600_000;
  return (await listRequests(db)).filter((r) => Date.parse(r.requestedAt) < limit);
}

/** Compteurs d'audience des derniers jours (table usage_counters), pour le résumé de `status`. */
export async function usageSummary(db: Db, days = 7, now = new Date()): Promise<Array<{ day: string; event: string; n: number }>> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await queryRows<{ day: string | Date; event: string; n: number }>(db, sql`SELECT day, event, n FROM usage_counters WHERE day >= ${since}::date ORDER BY day, event`);
  return rows.map((r) => ({ day: typeof r.day === "string" ? r.day.slice(0, 10) : r.day.toISOString().slice(0, 10), event: r.event, n: Number(r.n) }));
}
