import "server-only";
import type { LeaderboardDef } from "@finals-hq/db/catalog";
import { unstable_cache } from "next/cache";
import { boundedCache, maxAgeFor, type Stamped } from "./bounded-cache";
import { DEFAULT_BOARD } from "./boards";
import { getDb, withTimeout } from "./db";
import { loadBoard, loadClub, loadClubs, loadFollowed, loadFreshness, loadHome, loadMovers, loadPastThresholds, loadPlayer, loadSitemap, loadStatus, loadTop500, searchPlayers } from "./queries";
import { loadPlayerRating, loadRatingBoard, loadRatingExample, loadRatingRun } from "./rating-queries";
import type { MoverWindow, RatingSort } from "./types";

/**
 * Lectures mises en cache par Next (cache de données partagé entre les pages et les routes API) :
 * 60 s pour ce qui suit le collecteur (relevé toutes les 10 min, cache de l'API source 10 à 20 min),
 * une journée pour les archives figées. Chaque page affiche l'heure du relevé, le cache ne ment donc pas,
 * et une entrée de plus de 5 min n'est plus servie telle quelle (voir `cached` plus bas).
 */
export const LIVE_REVALIDATE = 60;
/** Au-delà, la page s'affiche avec son état « données indisponibles » plutôt que de charger sans fin. */
const QUERY_BUDGET_MS = 8_000;
const ARCHIVE_REVALIDATE = 86_400;

/**
 * `unstable_cache` à âge borné (voir bounded-cache.ts) : jamais plus de 5 min de retard sur la base pour ce qui
 * suit le collecteur, même sur une page que personne n'a ouverte depuis des heures.
 */
function cached<T>(load: () => Promise<T>, keyParts: string[], options: { revalidate: number; tags: string[] }): () => Promise<T> {
  return boundedCache(load, <S,>(stamped: () => Promise<Stamped<S>>) => unstable_cache(stamped, keyParts, options), maxAgeFor(options.revalidate));
}

export function getBoard(lb: LeaderboardDef) {
  return cached(() => withTimeout(loadBoard(getDb(), lb), QUERY_BUDGET_MS), ["board", String(lb.id)], {
    revalidate: lb.isLive ? LIVE_REVALIDATE : ARCHIVE_REVALIDATE,
    tags: [`board:${lb.id}`],
  })();
}

export const getFreshness = cached(() => withTimeout(loadFreshness(getDb(), DEFAULT_BOARD.id), QUERY_BUDGET_MS), ["freshness"], { revalidate: LIVE_REVALIDATE, tags: ["freshness"] });

export const getHome = cached(() => withTimeout(loadHome(getDb(), DEFAULT_BOARD), QUERY_BUDGET_MS), ["home"], { revalidate: LIVE_REVALIDATE, tags: ["home"] });

export const getStatus = cached(() => withTimeout(loadStatus(getDb()), QUERY_BUDGET_MS), ["status"], { revalidate: LIVE_REVALIDATE, tags: ["status"] });

export function getPlayer(candidates: string[]) {
  return cached(() => withTimeout(loadPlayer(getDb(), candidates), QUERY_BUDGET_MS), ["player", ...candidates], { revalidate: 120, tags: ["players"] })();
}

/** Recherche : pas de cache de données (requêtes trop variées), le CDN garde les réponses 60 s. */
export function search(q: string, limit?: number) {
  return withTimeout(searchPlayers(getDb(), q, DEFAULT_BOARD.id, limit), QUERY_BUDGET_MS);
}

/** Page Suivi : identifiants triés comme clé de cache, 60 s comme les classements. */
export function getFollowed(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return cached(() => withTimeout(loadFollowed(getDb(), key), QUERY_BUDGET_MS), ["followed", key.join(",")], { revalidate: LIVE_REVALIDATE, tags: ["players"] })();
}

/* Sprint 4 */
export const getTop500 = cached(() => withTimeout(loadTop500(getDb(), DEFAULT_BOARD), QUERY_BUDGET_MS), ["top500"], { revalidate: LIVE_REVALIDATE, tags: ["top500"] });

/** Seuils figés des saisons passées : une journée, comme les archives. */
export const getPastThresholds = cached(() => withTimeout(loadPastThresholds(getDb()), QUERY_BUDGET_MS), ["past-thresholds"], { revalidate: ARCHIVE_REVALIDATE, tags: ["archives"] });

export const getClubs = cached(() => withTimeout(loadClubs(getDb(), DEFAULT_BOARD), QUERY_BUDGET_MS), ["clubs"], { revalidate: LIVE_REVALIDATE, tags: ["clubs"] });

export function getClub(tag: string) {
  return cached(() => withTimeout(loadClub(getDb(), DEFAULT_BOARD, tag), QUERY_BUDGET_MS), ["club", tag], { revalidate: LIVE_REVALIDATE, tags: ["clubs"] })();
}

export function getMovers(window: MoverWindow, direction: "up" | "down") {
  return cached(() => withTimeout(loadMovers(getDb(), DEFAULT_BOARD, window, direction), QUERY_BUDGET_MS), ["movers", window, direction], { revalidate: LIVE_REVALIDATE, tags: ["movers"] })();
}

/* Sprint 5 : Rating (recalculé au plus une fois par heure par le worker). */
export function getPlayerRating(playerId: string) {
  return cached(() => withTimeout(loadPlayerRating(getDb(), playerId, DEFAULT_BOARD.id), QUERY_BUDGET_MS), ["rating", playerId], { revalidate: 120, tags: ["rating"] })();
}

export const getRatingRun = cached(() => withTimeout(loadRatingRun(getDb(), DEFAULT_BOARD), QUERY_BUDGET_MS), ["rating-run"], { revalidate: LIVE_REVALIDATE * 5, tags: ["rating"] });

export function getRatingBoard(sort: RatingSort) {
  return cached(() => withTimeout(loadRatingBoard(getDb(), DEFAULT_BOARD, sort), QUERY_BUDGET_MS), ["rating-board", sort], { revalidate: LIVE_REVALIDATE * 5, tags: ["rating"] })();
}

export const getRatingExample = cached(() => withTimeout(loadRatingExample(getDb(), DEFAULT_BOARD), QUERY_BUDGET_MS), ["rating-example"], { revalidate: LIVE_REVALIDATE * 5, tags: ["rating"] });

/** Environnement de déploiement, pour ouvrir le Rating sur les previews avant sa publication. */
export function ratingEnv() {
  return { vercelEnv: process.env.VERCEL_ENV, nodeEnv: process.env.NODE_ENV };
}

/* Sprint 6 : sitemaps, une heure de cache (Google ne repasse pas plus souvent). */
export const getSitemap = cached(() => withTimeout(loadSitemap(getDb(), DEFAULT_BOARD.id), QUERY_BUDGET_MS), ["sitemap"], { revalidate: 3600, tags: ["sitemap"] });
