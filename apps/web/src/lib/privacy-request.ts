/** Validation du formulaire de masquage, partagée par la route API et ses tests (pas de dépendance serveur). */

export interface PrivacyRequestInput {
  player: string;
  contact: string;
  message: string;
  locale: "fr" | "en";
  /** Case « je suis ce joueur ou son représentant légal ». */
  owner: boolean;
  /** Champ piège invisible : rempli = robot. */
  website: string;
}

export type PrivacyRequestError = "player" | "contact" | "owner" | "message" | "bot";

export const CONTACT_MAX = 200;
export const MESSAGE_MAX = 1000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Pseudo Discord (2 à 32 caractères, lettres, chiffres, point, tiret bas), éventuellement préfixé de @. */
const DISCORD = /^@?[a-z0-9_.]{2,32}$/i;

export function parsePrivacyRequest(body: unknown): { ok: true; value: PrivacyRequestInput } | { ok: false; error: PrivacyRequestError } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
  const value: PrivacyRequestInput = {
    player: str("player"),
    contact: str("contact"),
    message: str("message"),
    locale: str("locale") === "en" ? "en" : "fr",
    owner: b.owner === true || b.owner === "on" || b.owner === "true",
    website: str("website"),
  };
  if (value.website) return { ok: false, error: "bot" };
  if (!value.player || value.player.length > 80) return { ok: false, error: "player" };
  if (!value.contact || value.contact.length > CONTACT_MAX || !(EMAIL.test(value.contact) || DISCORD.test(value.contact))) return { ok: false, error: "contact" };
  if (value.message.length > MESSAGE_MAX) return { ok: false, error: "message" };
  if (!value.owner) return { ok: false, error: "owner" };
  return { ok: true, value };
}

/** Accepte un pseudo (« GOJO#6255 »), un slug (« GOJO-6255 ») ou une adresse de profil collée. */
export function playerRefFromInput(raw: string): string {
  const s = raw.trim();
  const m = /\/players\/([^/?#]+)/.exec(s);
  return m ? m[1]! : s;
}
