import "server-only";
import type { LeaderboardDef } from "@finals-hq/db/catalog";
import { unstable_cache } from "next/cache";
import { DEFAULT_BOARD } from "./boards";
import { getDb, withTimeout } from "./db";
import { loadBoard, loadFreshness, loadHome, loadPlayer, loadStatus, searchPlayers } from "./queries";

/**
 * Lectures mises en cache par Next (cache de données partagé entre les pages et les routes API) :
 * 60 s pour ce qui suit le collecteur (relevé toutes les 10 min, cache de l'API source 10 à 20 min),
 * une journée pour les archives figées. Chaque page affiche l'heure du relevé, le cache ne ment donc pas.
 */
export const LIVE_REVALIDATE = 60;
/** Au-delà, la page s'affiche avec son état « données indisponibles » plutôt que de charger sans fin. */
const QUERY_BUDGET_MS = 8_000;
const ARCHIVE_REVALIDATE = 86_400;

export function getBoard(lb: LeaderboardDef) {
  return unstable_cache(() => withTimeout(loadBoard(getDb(), lb), QUERY_BUDGET_MS), ["board", String(lb.id)], {
    revalidate: lb.isLive ? LIVE_REVALIDATE : ARCHIVE_REVALIDATE,
    tags: [`board:${lb.id}`],
  })();
}

export const getFreshness = unstable_cache(() => withTimeout(loadFreshness(getDb(), DEFAULT_BOARD.id), QUERY_BUDGET_MS), ["freshness"], { revalidate: LIVE_REVALIDATE, tags: ["freshness"] });

export const getHome = unstable_cache(() => withTimeout(loadHome(getDb(), DEFAULT_BOARD), QUERY_BUDGET_MS), ["home"], { revalidate: LIVE_REVALIDATE, tags: ["home"] });

export const getStatus = unstable_cache(() => withTimeout(loadStatus(getDb()), QUERY_BUDGET_MS), ["status"], { revalidate: LIVE_REVALIDATE, tags: ["status"] });

export function getPlayer(candidates: string[]) {
  return unstable_cache(() => withTimeout(loadPlayer(getDb(), candidates), QUERY_BUDGET_MS), ["player", ...candidates], { revalidate: 120, tags: ["players"] })();
}

/** Recherche : pas de cache de données (requêtes trop variées), le CDN garde les réponses 60 s. */
export function search(q: string, limit?: number) {
  return withTimeout(searchPlayers(getDb(), q, DEFAULT_BOARD.id, limit), QUERY_BUDGET_MS);
}
