/**
 * Limitation de débit en mémoire, fenêtre glissante par adresse IP (phase C : 60 requêtes par minute,
 * 20 pour la recherche). Par instance de fonction : une protection contre l'abus simple, le pare-feu
 * de Vercel couvre le reste. Les pages HTML passent par le CDN et n'en ont pas besoin.
 */
export interface Limiter {
  /** null si autorisé, sinon le nombre de secondes à attendre (en-tête Retry-After). */
  check: (key: string, now?: number) => number | null;
}

export function createLimiter(limit: number, windowMs = 60_000, maxKeys = 5_000): Limiter {
  const hits = new Map<string, number[]>();
  return {
    check(key, now = Date.now()) {
      const since = now - windowMs;
      const list = (hits.get(key) ?? []).filter((t) => t > since);
      if (list.length >= limit) {
        hits.set(key, list);
        return Math.max(1, Math.ceil((list[0]! + windowMs - now) / 1000));
      }
      list.push(now);
      hits.delete(key);
      hits.set(key, list);
      if (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return null;
    },
  };
}

export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
