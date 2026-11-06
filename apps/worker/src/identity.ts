/**
 * Résolution d'identité v1 (phase C). Entrée : les lignes d'un fichier dont le nom Embark n'était
 * pas dans l'état précédent du classement (règle 1 déjà appliquée par l'appelant).
 *
 *   règle 2  renommage : un nom disparaît et un autre apparaît avec un nom de plateforme identique,
 *            non vide et unique dans le classement → même joueur, nom mis à jour
 *   règle 3  même nom Embark déjà connu (autre classement ou saison) → même joueur, sauf
 *            contradiction de plateforme (non vide et différent des deux côtés) → nouveau joueur + candidature
 *   règle 4  nom Embark différent mais plateformes identiques → candidature seulement
 *   règle 5  nom sans # → identité propre au classement (`linkable = false`)
 */
import { schema, type Db } from "@finals-hq/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { isLinkableName, type NormalizedRow } from "./normalize.ts";
import { chunk } from "./state.ts";

const { players, playerNames, identityCandidates } = schema;

export type PlatformKind = "steamName" | "psnName" | "xboxName";
export const PLATFORM_KINDS: readonly PlatformKind[] = ["steamName", "psnName", "xboxName"];
const NAME_KIND: Record<PlatformKind, string> = { steamName: "steam", psnName: "psn", xboxName: "xbox" };

export interface PlatformNames {
  steamName: string | null;
  psnName: string | null;
  xboxName: string | null;
}

export interface RemovedPlayer extends PlatformNames {
  playerId: number;
  name: string;
}

export interface ResolveContext {
  key: string;
  takenAt: Date;
  /** Players whose name disappeared from the leaderboard in this same file (rule 2 pool). */
  removed: RemovedPlayer[];
  /** Occurrences of each platform name in the whole new state (rule 2 needs uniqueness). */
  platformCounts: Record<PlatformKind, Map<string, number>>;
}

export interface Resolution {
  byName: Map<string, number>;
  created: number;
  renamed: number;
  linked: number;
  candidates: number;
  unlinked: number;
}

interface PlayerRec extends PlatformNames {
  id: number;
  embarkName: string;
  lastSeenAt: Date;
}

export function platformCounts(rows: Iterable<NormalizedRow>): Record<PlatformKind, Map<string, number>> {
  const counts = { steamName: new Map<string, number>(), psnName: new Map<string, number>(), xboxName: new Map<string, number>() };
  for (const row of rows) {
    for (const kind of PLATFORM_KINDS) {
      const value = row[kind];
      if (value) counts[kind].set(value, (counts[kind].get(value) ?? 0) + 1);
    }
  }
  return counts;
}

/** Non-empty on both sides and different: never the same person. */
export function contradicts(a: PlatformNames, b: PlatformNames): boolean {
  return PLATFORM_KINDS.some((kind) => a[kind] !== null && b[kind] !== null && a[kind] !== b[kind]);
}

const CHUNK = 2000; // see ingest.ts

async function insertPlayers(
  tx: Db,
  rows: readonly NormalizedRow[],
  at: Date,
  scope: { linkable: boolean; scopeKey: string | null },
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const part of chunk(rows, CHUNK)) {
    const inserted = await tx
      .insert(players)
      .values(
        part.map((r) => ({
          embarkName: r.name,
          steamName: r.steamName,
          psnName: r.psnName,
          xboxName: r.xboxName,
          linkable: scope.linkable,
          scopeKey: scope.scopeKey,
          firstSeenAt: at,
          lastSeenAt: at,
        })),
      )
      .returning({ id: players.id, embarkName: players.embarkName });
    for (const row of inserted) ids.set(row.embarkName, row.id);
  }
  return ids;
}

async function upsertNames(tx: Db, entries: ReadonlyArray<{ playerId: number; row: NormalizedRow }>, at: Date): Promise<void> {
  const values: Array<typeof playerNames.$inferInsert> = [];
  for (const { playerId, row } of entries) {
    values.push({ playerId, kind: "embark", name: row.name, firstSeenAt: at, lastSeenAt: at });
    for (const kind of PLATFORM_KINDS) {
      const value = row[kind];
      if (value) values.push({ playerId, kind: NAME_KIND[kind], name: value, firstSeenAt: at, lastSeenAt: at });
    }
  }
  for (const part of chunk(values, CHUNK)) {
    await tx
      .insert(playerNames)
      .values(part)
      .onConflictDoUpdate({
        target: [playerNames.playerId, playerNames.kind, playerNames.name],
        set: {
          firstSeenAt: sql`least(${playerNames.firstSeenAt}, excluded.first_seen_at)`,
          lastSeenAt: sql`greatest(${playerNames.lastSeenAt}, excluded.last_seen_at)`,
        },
      });
  }
}

/** Platform names learned later replace the stored ones; a missing value never erases a known one. */
async function refreshPlatformNames(tx: Db, player: PlayerRec, row: NormalizedRow, at: Date): Promise<void> {
  const changed = PLATFORM_KINDS.some((kind) => row[kind] !== null && row[kind] !== player[kind]);
  if (!changed) return;
  await tx
    .update(players)
    .set({
      steamName: row.steamName ?? player.steamName,
      psnName: row.psnName ?? player.psnName,
      xboxName: row.xboxName ?? player.xboxName,
      lastSeenAt: at,
    })
    .where(eq(players.id, player.id));
}

async function addCandidates(
  tx: Db,
  pairs: ReadonlyArray<{ a: number; b: number; reason: string; confidence: string }>,
): Promise<number> {
  if (pairs.length === 0) return 0;
  const seen = new Set<string>();
  const values = pairs
    .map((p) => ({ playerA: Math.min(p.a, p.b), playerB: Math.max(p.a, p.b), reason: p.reason, confidence: p.confidence }))
    .filter((p) => {
      const id = `${p.playerA}:${p.playerB}:${p.reason}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  for (const part of chunk(values, CHUNK)) {
    await tx.insert(identityCandidates).values(part).onConflictDoNothing();
  }
  return values.length;
}

export async function resolveIdentities(tx: Db, rows: readonly NormalizedRow[], ctx: ResolveContext): Promise<Resolution> {
  const result: Resolution = { byName: new Map(), created: 0, renamed: 0, linked: 0, candidates: 0, unlinked: 0 };
  const named: Array<{ playerId: number; row: NormalizedRow }> = [];
  const pairs: Array<{ a: number; b: number; reason: string; confidence: string }> = [];

  // Rule 5: identities scoped to this leaderboard.
  const scoped = rows.filter((r) => !isLinkableName(r.name));
  if (scoped.length > 0) {
    const existing = new Map<string, number>();
    for (const part of chunk(scoped.map((r) => r.name), CHUNK)) {
      const found = await tx
        .select({ id: players.id, embarkName: players.embarkName })
        .from(players)
        .where(and(eq(players.linkable, false), eq(players.scopeKey, ctx.key), inArray(players.embarkName, part)));
      for (const p of found) existing.set(p.embarkName, p.id);
    }
    const missing = scoped.filter((r) => !existing.has(r.name));
    const created = await insertPlayers(tx, missing, ctx.takenAt, { linkable: false, scopeKey: ctx.key });
    for (const row of scoped) {
      const id = existing.get(row.name) ?? created.get(row.name);
      if (id === undefined) continue;
      result.byName.set(row.name, id);
      named.push({ playerId: id, row });
    }
    result.unlinked += scoped.length;
    result.created += created.size;
  }

  // Rule 3: a known Embark name.
  const linkable = rows.filter((r) => isLinkableName(r.name));
  const known = new Map<string, PlayerRec[]>();
  for (const part of chunk(linkable.map((r) => r.name), CHUNK)) {
    const found = await tx
      .select({
        id: players.id,
        embarkName: players.embarkName,
        steamName: players.steamName,
        psnName: players.psnName,
        xboxName: players.xboxName,
        lastSeenAt: players.lastSeenAt,
      })
      .from(players)
      .where(and(eq(players.linkable, true), isNull(players.mergedInto), inArray(players.embarkName, part)));
    for (const p of found) {
      const list = known.get(p.embarkName) ?? [];
      list.push(p);
      known.set(p.embarkName, list);
    }
  }
  let pending: NormalizedRow[] = [];
  const contradicted = new Map<string, PlayerRec[]>();
  for (const row of linkable) {
    const candidates = known.get(row.name) ?? [];
    const compatible = candidates.filter((p) => !contradicts(p, row)).sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
    const match = compatible[0];
    if (match) {
      result.byName.set(row.name, match.id);
      result.linked++;
      named.push({ playerId: match.id, row });
      await refreshPlatformNames(tx, match, row, ctx.takenAt);
    } else {
      if (candidates.length > 0) contradicted.set(row.name, candidates);
      pending.push(row);
    }
  }

  // Rule 2: a rename seen in this very file.
  const pool = [...ctx.removed];
  const stillPending: NormalizedRow[] = [];
  for (const row of pending) {
    let renamed: RemovedPlayer | undefined;
    for (const kind of PLATFORM_KINDS) {
      const value = row[kind];
      if (!value || ctx.platformCounts[kind].get(value) !== 1) continue;
      const index = pool.findIndex((p) => p[kind] === value);
      if (index === -1) continue;
      renamed = pool.splice(index, 1)[0];
      break;
    }
    if (!renamed) {
      stillPending.push(row);
      continue;
    }
    await tx
      .update(players)
      .set({
        embarkName: row.name,
        steamName: row.steamName ?? renamed.steamName,
        psnName: row.psnName ?? renamed.psnName,
        xboxName: row.xboxName ?? renamed.xboxName,
        lastSeenAt: ctx.takenAt,
      })
      .where(eq(players.id, renamed.playerId));
    result.byName.set(row.name, renamed.playerId);
    result.renamed++;
    named.push({ playerId: renamed.playerId, row });
  }
  pending = stillPending;

  // New players, then rule 4 candidates and the rule 3 contradictions.
  const created = await insertPlayers(tx, pending, ctx.takenAt, { linkable: true, scopeKey: null });
  result.created += created.size;
  const createdIds = new Set(created.values());
  for (const row of pending) {
    const id = created.get(row.name);
    if (id === undefined) continue;
    result.byName.set(row.name, id);
    named.push({ playerId: id, row });
    for (const other of contradicted.get(row.name) ?? []) {
      pairs.push({ a: id, b: other.id, reason: "same_embark_name_platform_mismatch", confidence: "low" });
    }
  }
  const lookups: Array<{ kind: string; name: string }> = [];
  for (const row of pending) {
    for (const kind of PLATFORM_KINDS) if (row[kind]) lookups.push({ kind: NAME_KIND[kind], name: row[kind]! });
  }
  if (lookups.length > 0) {
    const holders = new Map<string, Set<number>>(); // "kind:name" -> players holding it (new ones excluded)
    for (const part of chunk(lookups, CHUNK)) {
      const found = await tx
        .select({ playerId: playerNames.playerId, kind: playerNames.kind, name: playerNames.name })
        .from(playerNames)
        .where(
          and(
            inArray(playerNames.kind, [...new Set(part.map((l) => l.kind))]),
            inArray(playerNames.name, [...new Set(part.map((l) => l.name))]),
          ),
        );
      for (const f of found) {
        if (createdIds.has(f.playerId)) continue;
        const id = `${f.kind}:${f.name}`;
        const set = holders.get(id) ?? new Set<number>();
        set.add(f.playerId);
        holders.set(id, set);
      }
    }
    for (const row of pending) {
      const newId = created.get(row.name);
      if (newId === undefined) continue;
      const matches = new Map<number, number>(); // other player -> number of platform names in common
      let uniqueMatch: number | null = null;
      for (const kind of PLATFORM_KINDS) {
        const value = row[kind];
        if (!value) continue;
        const set = holders.get(`${NAME_KIND[kind]}:${value}`);
        if (!set) continue;
        for (const other of set) matches.set(other, (matches.get(other) ?? 0) + 1);
        if (set.size === 1) uniqueMatch = [...set][0]!;
      }
      for (const [other, count] of matches) {
        if (count >= 2 || other === uniqueMatch) {
          pairs.push({ a: newId, b: other, reason: "same_platform_names", confidence: "medium" });
        }
      }
    }
  }

  await upsertNames(tx, named, ctx.takenAt);
  result.candidates = await addCandidates(tx, pairs);
  return result;
}
