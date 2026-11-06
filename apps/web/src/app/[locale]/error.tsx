"use client";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/hq/Button";
import { ErrorState } from "@/components/hq/States";

/** Erreur de rendu d'une page (base injoignable au premier rendu, par exemple). */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  useEffect(() => {
    // Sentry chargé à la demande : hors du JavaScript initial des pages.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);
  return (
    <div className="py-10">
      <ErrorState title={t("errors.title")} body={t("errors.body")} action={<Button variant="primary" onClick={reset}>{t("common.retry")}</Button>} />
    </div>
  );
}
