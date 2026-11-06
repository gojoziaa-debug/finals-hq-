/**
 * Sentry dans le navigateur, chargé après la page (import dynamique) pour rester hors du budget JavaScript initial
 * (150 ko sur le classement). Erreurs seulement, pas de replay ni de traces côté client. Rien sans NEXT_PUBLIC_SENTRY_DSN.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  const start = () =>
    void import("@sentry/nextjs").then((Sentry) =>
      Sentry.init({ dsn, environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development", tracesSampleRate: 0, sendDefaultPii: false }),
    );
  if (typeof window !== "undefined") {
    if ("requestIdleCallback" in window) window.requestIdleCallback(start);
    else setTimeout(start, 2000);
  }
}
export {};
