/**
 * Supporters (sprint 7) : lien vers le palier Patreon et badge sur le profil des donateurs.
 *
 * Aucune API Patreon et aucun paiement sur le site (le plan Vercel Hobby n'autorise que les liens de dons) :
 * la liste est tenue à la main dans src/data/supporters.json. Un nom n'y entre que si la personne l'a demandé
 * (elle envoie son Embark ID après son adhésion), car le dépôt est public. Module pur, testé.
 */
import raw from "@/data/supporters.json";

export type SupporterRole = "creator" | "supporter";

export interface Supporter {
  /** Embark ID exact, avec le #1234. */
  embarkId: string;
  role: SupporterRole;
  /** Mois d'adhésion AAAA-MM (affiché sur le mur). */
  since: string | null;
}

export interface SupportConfig {
  /** Adresse de la page ou du palier Patreon ; vide = pas encore ouvert (la page Soutenir le dit). */
  patreonUrl: string | null;
  tierName: string;
  /** Prix mensuel affiché (« 3 € », la page ajoute « / mois ») ; vide = non affiché. */
  tierPrice: string | null;
  supporters: Supporter[];
}

const EMBARK_ID = /^.{1,40}#\d{4}$/;

/** Valide le fichier : une entrée mal formée est ignorée plutôt que de casser le site. */
export function parseSupportConfig(input: unknown, env: Record<string, string | undefined> = {}): SupportConfig {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const url = str(env.NEXT_PUBLIC_PATREON_URL) ?? str(o.patreonUrl);
  const list = Array.isArray(o.supporters) ? o.supporters : [];
  const seen = new Set<string>();
  const supporters: Supporter[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const id = str(s.embarkId);
    if (!id || !EMBARK_ID.test(id) || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    const since = str(s.since);
    supporters.push({ embarkId: id, role: s.role === "creator" ? "creator" : "supporter", since: since && /^\d{4}-\d{2}$/.test(since) ? since : null });
  }
  return {
    patreonUrl: url && isPatreonUrl(url) ? url : null,
    tierName: str(o.tierName) ?? "Supporter HQ",
    tierPrice: str(o.tierPrice),
    supporters,
  };
}

/** Seules les adresses https de patreon.com sont acceptées : le bouton ne peut pas pointer ailleurs par erreur. */
export function isPatreonUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "patreon.com" || u.hostname.endsWith(".patreon.com"));
  } catch {
    return false;
  }
}

let cached: SupportConfig | null = null;
export function supportConfig(): SupportConfig {
  if (!cached) cached = parseSupportConfig(raw, process.env);
  return cached;
}

/** Rôle du joueur s'il figure dans la liste (comparaison sans casse sur l'Embark ID actuel), sinon null. */
export function supporterRole(name: string | null | undefined, config: SupportConfig = supportConfig()): SupporterRole | null {
  if (!name) return null;
  const key = name.toLowerCase();
  return config.supporters.find((s) => s.embarkId.toLowerCase() === key)?.role ?? null;
}
