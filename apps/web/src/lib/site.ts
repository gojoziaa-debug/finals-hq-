/**
 * Adresse publique, indexation, alternates hreflang et identité de l'éditeur (sprint 6).
 * Aucun nom ni adresse e-mail dans le dépôt (il est public) : l'identité vient des variables Vercel.
 */
import type { Metadata } from "next";

export const LOCALES = ["fr", "en"] as const;

/** finalshq.gg une fois le domaine branché (NEXT_PUBLIC_SITE_URL), sinon l'URL de production Vercel. */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/**
 * Indexé seulement en production ET sur le domaine définitif : tant que le site vit sur *.vercel.app, Google
 * n'indexe rien (sinon l'adresse provisoire serait indexée puis à migrer). HQ_INDEX=1 force l'indexation.
 */
export function indexable(env: Record<string, string | undefined> = process.env): boolean {
  if (env.HQ_INDEX === "1") return true;
  if (env.VERCEL_ENV !== "production") return false;
  return !/\.vercel\.app$/i.test(new URL(siteUrl(env)).hostname);
}

/**
 * Une fois le domaine définitif branché, l'ancienne adresse de production *.vercel.app renvoie vers lui (308),
 * chemin et paramètres conservés. Rien en preview, rien tant que NEXT_PUBLIC_SITE_URL est encore un *.vercel.app.
 */
export function canonicalRedirect(host: string | null, pathAndSearch: string, env: Record<string, string | undefined> = process.env): string | null {
  if (!host || env.VERCEL_ENV !== "production") return null;
  const target = new URL(siteUrl(env));
  if (/\.vercel\.app$/i.test(target.hostname)) return null;
  const requested = host.split(":")[0]!.toLowerCase();
  if (requested === target.hostname.toLowerCase() || !/\.vercel\.app$/i.test(requested)) return null;
  return `${target.origin}${pathAndSearch}`;
}

/** canonical + hreflang fr/en + x-default (français, langue par défaut) pour un chemin sans préfixe de langue. */
export function alternates(locale: string, path: string): NonNullable<Metadata["alternates"]> {
  const p = path === "/" ? "" : path;
  return {
    canonical: `/${locale}${p}`,
    languages: { fr: `/fr${p}`, en: `/en${p}`, "x-default": `/fr${p}` },
  };
}

export interface LegalIdentity {
  /** Nom de la personne responsable du site (responsable du traitement au sens du RGPD). */
  name: string | null;
  /** Adresse de contact dédiée au site. */
  email: string | null;
  /** Ville et pays (une adresse postale complète n'est pas exigée d'un particulier sans activité commerciale). */
  location: string | null;
}

export function legalIdentity(env: Record<string, string | undefined> = process.env): LegalIdentity {
  const v = (k: string) => env[k]?.trim() || null;
  return { name: v("LEGAL_NAME"), email: v("LEGAL_EMAIL"), location: v("LEGAL_LOCATION") };
}

/** Durée de traitement promise sur la page de confidentialité. */
export const HIDE_PROMISE_HOURS = 48;
