/** Ligues Embark : 1–4 Bronze 4→1, 5–8 Silver, 9–12 Gold, 13–16 Platinum, 17–20 Diamond, 21 Ruby (vérifié, phase B). */
export type LeagueTier = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "ruby";

const TIERS: LeagueTier[] = ["bronze", "silver", "gold", "platinum", "diamond"];
const TIER_NAMES: Record<LeagueTier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum", diamond: "Diamond", ruby: "Ruby" };

export interface League {
  number: number;
  tier: LeagueTier;
  /** 1 à 4, null pour Ruby. */
  division: number | null;
  /** « Platinum 2 » : les noms restent ceux du jeu dans les deux langues. */
  name: string;
  /** « P2 », « R » : badge sm des tableaux. */
  short: string;
  /** Slug de filtre d'URL : p2, d1, ruby. */
  slug: string;
}

export function league(n: number | null | undefined): League | null {
  if (n === null || n === undefined || n <= 0 || n > 21) return null;
  if (n === 21) return { number: 21, tier: "ruby", division: null, name: "Ruby", short: "R", slug: "ruby" };
  const tier = TIERS[Math.floor((n - 1) / 4)]!;
  const division = 4 - ((n - 1) % 4);
  return { number: n, tier, division, name: `${TIER_NAMES[tier]} ${division}`, short: `${TIER_NAMES[tier][0]}${division}`, slug: `${TIER_NAMES[tier][0]!.toLowerCase()}${division}` };
}

export function leagueFromSlug(slug: string): League | null {
  for (let n = 1; n <= 21; n++) {
    const l = league(n);
    if (l && l.slug === slug.toLowerCase()) return l;
  }
  return null;
}

/**
 * Seuils de RS déduits pour la S12 (phase B : écarts de 2 500 RS observés, pas une donnée publiée).
 * Toujours affichés avec la mention « déduit ».
 */
export const DEDUCED_THRESHOLDS_S12: ReadonlyArray<{ league: number; rs: number }> = [
  { league: 15, rs: 35_000 },
  { league: 16, rs: 37_500 },
  { league: 17, rs: 40_000 },
  { league: 18, rs: 42_500 },
  { league: 19, rs: 45_000 },
  { league: 20, rs: 47_500 },
];
