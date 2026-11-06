/** Writes synthetic collector files (same format as finals-hq-data) into a temporary data root. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { Row } from "../src/files.ts";

export interface FileRef {
  file: string;
  at: string;
  sha256: string;
  count: number;
}

export const stamp = (at: string): string => at.replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");

const sha = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function writeGz(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, gzipSync(Buffer.from(JSON.stringify(value))));
}

const source = (at: string, key: string) => ({ url: `https://example.invalid/v1/leaderboard/${key}`, fetchedAt: at, status: 200, durationMs: 1, headers: {} });

export async function writeFull(root: string, key: string, at: string, rows: Row[], folder = "state"): Promise<FileRef> {
  const file = `full-${stamp(at)}.json.gz`;
  const sha256 = sha(rows);
  await writeGz(join(root, folder, key, file), { v: 1, type: "full", key, idField: "name", source: source(at, key), sha256, meta: null, count: rows.length, rows });
  return { file, at, sha256, count: rows.length };
}

export async function writeDelta(root: string, key: string, at: string, base: string, seq: number, changed: Row[], removed: string[], count: number): Promise<FileRef> {
  const file = `delta-${stamp(at)}.json.gz`;
  const sha256 = sha({ changed, removed, at });
  await writeGz(join(root, "state", key, file), {
    v: 1, type: "delta", key, idField: "name", base, seq, source: source(at, key), sha256, meta: null, count,
    stats: { changed: 0, added: 0, removed: removed.length, unchanged: 0, duplicateIds: 0 }, changed, removed,
  });
  return { file, at, sha256, count };
}

export async function writeManifest(root: string, key: string, base: FileRef, deltas: FileRef[]): Promise<void> {
  await mkdir(join(root, "state", key), { recursive: true });
  await writeFile(join(root, "state", key, "manifest.json"), JSON.stringify({ v: 1, key, idField: "name", volatileFields: ["rank", "change"], base, deltas, lastSuccessAt: (deltas.at(-1) ?? base).at }));
}

/** A synthetic Season 12 ranked row (R6 fields). Names are made up for the tests. */
export function rankedRow(rank: number, name: string, rankScore: number, leagueNumber: number, extra: Partial<Record<string, string | number>> = {}): Row {
  return {
    rank, change: 0, name, steamName: "", psnName: "", xboxName: "", clubTag: "", clubUuid: "", officialClubName: "",
    leagueNumber, league: `L${leagueNumber}`, rankScore, ...extra,
  };
}
