/**
 * Adresse d'un profil : /players/GOJO-6255 pour « GOJO#6255 ». Le # devient un tiret devant les 4 chiffres
 * finaux ; un nom sans # (anciennes archives) garde sa forme. Pur : utilisable côté client.
 */
export function playerSlug(name: string): string {
  const m = /^(.*)#(\d{4})$/.exec(name);
  return encodeURIComponent(m ? `${m[1]}-${m[2]}` : name);
}

/** Noms candidats pour un slug : « GOJO-6255 » → [« GOJO#6255 », « GOJO-6255 »]. */
export function namesFromSlug(slug: string): string[] {
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return [];
  }
  const m = /^(.*)-(\d{4})$/.exec(decoded);
  return m ? [`${m[1]}#${m[2]}`, decoded] : [decoded];
}

/** « GOJO » et « #6255 » pour afficher la partie chiffrée en plus pâle. */
export function splitName(name: string): { base: string; tag: string | null } {
  const m = /^(.*)(#\d{4})$/.exec(name);
  return m ? { base: m[1]!, tag: m[2]! } : { base: name, tag: null };
}
