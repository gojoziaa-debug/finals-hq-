"use client";
import { useEffect } from "react";

/** Dernier filet : une erreur dans le layout lui-même. Envoyée à Sentry si le DSN est configuré. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // Sentry chargé à la demande : hors du JavaScript initial des pages.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);
  return (
    <html lang="fr" className="dark">
      <body style={{ background: "#0B0B0F", color: "#F2F2F5", fontFamily: "system-ui", padding: 24 }}>
        <h1>FINALS HQ</h1>
        <p>Une erreur inattendue est survenue. / An unexpected error occurred.</p>
        <a href="/" style={{ color: "#D7FF3C" }}>
          ← Accueil / Home
        </a>
      </body>
    </html>
  );
}
