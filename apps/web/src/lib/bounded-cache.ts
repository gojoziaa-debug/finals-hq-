/**
 * Âge maximal d'une lecture en cache (rodage, 2026-11-08).
 *
 * `unstable_cache` sert une entrée périmée puis la recalcule en arrière-plan : avec peu de visiteurs, la
 * première personne qui ouvre une page (ou un onglet de page, comme « Chutes » ou « Saison ») après une nuit voit
 * les données de la veille, et le bandeau « la collecte semble interrompue » alors que tout tourne.
 * Ici chaque entrée porte l'heure de son calcul : au-delà de `maxAgeMs`, on relit la base directement (Next
 * recalcule l'entrée en parallèle pour les visiteurs suivants) et on ne garde l'entrée périmée qu'en secours,
 * si la relecture échoue.
 */
export interface Stamped<T> {
  at: number;
  value: T;
}

export type CacheWrapper = <T>(load: () => Promise<Stamped<T>>) => () => Promise<Stamped<T>>;

/** Live data: 5 minutes, or three revalidation periods for slower entries (rating, profiles). */
export function maxAgeFor(revalidateSeconds: number): number {
  return Math.max(5 * 60_000, 3 * revalidateSeconds * 1000);
}

export function boundedCache<T>(load: () => Promise<T>, wrap: CacheWrapper, maxAgeMs: number, now: () => number = Date.now): () => Promise<T> {
  const cached = wrap(async () => ({ at: now(), value: await load() }));
  return async () => {
    const hit = await cached();
    if (typeof hit?.at === "number" && now() - hit.at <= maxAgeMs) return hit.value;
    try {
      return await load();
    } catch (error) {
      if (hit && "value" in hit) return hit.value;
      throw error;
    }
  };
}
