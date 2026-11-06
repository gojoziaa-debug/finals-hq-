/**
 * Sentry côté serveur (Node et edge). Rien n'est initialisé sans SENTRY_DSN : en local et en CI, le site tourne sans compte Sentry.
 * Aucune donnée personnelle envoyée (sendDefaultPii false) ; 10 % des transactions échantillonnées (offre gratuite : 5 000 erreurs par mois).
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export async function onRequestError(...args: unknown[]) {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  // @ts-expect-error signature transmise telle quelle à Sentry
  return Sentry.captureRequestError(...args);
}
