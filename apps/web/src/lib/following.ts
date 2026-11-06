"use client";
/**
 * Joueurs suivis, stockés dans le navigateur du visiteur (localStorage, clé hq-following) : aucun compte,
 * rien n'est envoyé au serveur hormis les identifiants au moment d'afficher la page Suivi.
 * Un joueur est gardé par son identifiant interne (stable malgré un changement de pseudo) et son dernier pseudo connu.
 */
import { useSyncExternalStore } from "react";

export const FOLLOWING_KEY = "hq-following";
export const FOLLOWING_MAX = 50;

export interface FollowedPlayer {
  id: string;
  name: string;
}

const listeners = new Set<() => void>();
let cache: { raw: string | null; list: FollowedPlayer[] } = { raw: null, list: [] };
const EMPTY: FollowedPlayer[] = [];

/** Lecture tolérante : un contenu corrompu ou d'un autre format donne une liste vide, jamais une erreur. */
export function parseFollowing(raw: string | null): FollowedPlayer[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    const items = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { players?: unknown }).players) ? (data as { players: unknown[] }).players : [];
    const out: FollowedPlayer[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const { id, name } = item as { id?: unknown; name?: unknown };
      const sid = typeof id === "number" ? String(id) : id;
      if (typeof sid !== "string" || !/^\d{1,18}$/.test(sid) || typeof name !== "string" || seen.has(sid)) continue;
      seen.add(sid);
      out.push({ id: sid, name: name.slice(0, 64) });
      if (out.length >= FOLLOWING_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

function read(): FollowedPlayer[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(FOLLOWING_KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cache.raw) cache = { raw, list: parseFollowing(raw) };
  return cache.list;
}

function write(list: FollowedPlayer[]): boolean {
  try {
    localStorage.setItem(FOLLOWING_KEY, JSON.stringify(list.slice(0, FOLLOWING_MAX)));
  } catch {
    return false; // stockage refusé (navigation privée stricte)
  }
  listeners.forEach((l) => l());
  return true;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === FOLLOWING_KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Liste suivie, synchronisée entre onglets ; vide au rendu serveur. */
export function useFollowing(): FollowedPlayer[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function isFollowed(list: readonly FollowedPlayer[], id: string): boolean {
  return list.some((p) => p.id === id);
}

/** Ajoute ou retire ; false si la liste est pleine ou le stockage refusé. */
export function toggleFollow(player: FollowedPlayer): boolean {
  const list = read();
  if (isFollowed(list, player.id)) return write(list.filter((p) => p.id !== player.id));
  if (list.length >= FOLLOWING_MAX) return false;
  return write([...list, player]);
}

/** Met à jour les pseudos (renommages vus par le serveur) sans changer l'ordre. */
export function refreshNames(names: ReadonlyMap<string, string>): void {
  const list = read();
  if (!list.some((p) => names.has(p.id) && names.get(p.id) !== p.name)) return;
  write(list.map((p) => ({ ...p, name: names.get(p.id) ?? p.name })));
}

export function removeFollow(id: string): void {
  write(read().filter((p) => p.id !== id));
}

/** Fichier d'export : { app, version, exportedAt, players }. */
export function exportFollowing(): string {
  return JSON.stringify({ app: "finals-hq", version: 1, exportedAt: new Date().toISOString(), players: read() }, null, 2);
}

/** Fusionne un fichier importé avec la liste actuelle ; renvoie le nombre de joueurs ajoutés. */
export function importFollowing(raw: string): number | null {
  const incoming = parseFollowing(raw);
  if (incoming.length === 0) return null;
  const list = read();
  const ids = new Set(list.map((p) => p.id));
  const added = incoming.filter((p) => !ids.has(p.id));
  const merged = [...list, ...added].slice(0, FOLLOWING_MAX);
  if (!write(merged)) return null;
  return Math.min(added.length, FOLLOWING_MAX - list.length);
}
