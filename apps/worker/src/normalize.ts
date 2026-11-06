/**
 * Normalisation d'une ligne API vers les colonnes de la base. Rien n'est deviné : un champ attendu
 * absent ou mal typé lève RowError et le fichier entier est rejeté.
 */
import type { LeaderboardDef } from "@finals-hq/db/catalog";
import { z } from "zod";
import type { Row } from "./files.ts";

export interface NormalizedRow {
  name: string;
  steamName: string | null;
  psnName: string | null;
  xboxName: string | null;
  rank: number;
  score: number;
  leagueNumber: number | null;
  league: string | null;
  clubTag: string | null;
  clubUuid: string | null;
  officialClubName: string | null;
  raw: Row;
}

export class RowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RowError";
  }
}

const baseRowSchema = z.looseObject({
  rank: z.number().int().min(0),
  name: z.string(),
  steamName: z.string().optional(),
  psnName: z.string().optional(),
  xboxName: z.string().optional(),
  leagueNumber: z.number().int().optional(),
  league: z.string().optional(),
  clubTag: z.string().optional(),
  clubUuid: z.string().optional(),
  officialClubName: z.string().optional(),
});

/** "" and whitespace become NULL: an empty platform name never links anything. */
export function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Names without an Embark discriminator (#1234) belong to one leaderboard only (rule 5). */
export function isLinkableName(name: string): boolean {
  return name.includes("#");
}

export function normalizeRow(row: Row, lb: LeaderboardDef): NormalizedRow {
  const parsed = baseRowSchema.safeParse(row);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new RowError(`ligne invalide (${issue ? `${issue.path.join(".")}: ${issue.message}` : "?"})`);
  }
  const score = row[lb.scoreField];
  if (typeof score !== "number" || !Number.isInteger(score)) {
    throw new RowError(`champ de score "${lb.scoreField}" absent ou non entier`);
  }
  const r = parsed.data;
  return {
    name: r.name.trim(),
    steamName: textOrNull(r.steamName),
    psnName: textOrNull(r.psnName),
    xboxName: textOrNull(r.xboxName),
    rank: r.rank,
    score,
    leagueNumber: r.leagueNumber ?? null,
    league: textOrNull(r.league),
    clubTag: textOrNull(r.clubTag),
    clubUuid: textOrNull(r.clubUuid),
    officialClubName: textOrNull(r.officialClubName),
    raw: row,
  };
}

const COMMON_FIELDS = new Set([
  "rank", "change", "name", "steamName", "psnName", "xboxName", "leagueNumber", "league",
  "clubTag", "clubUuid", "officialClubName",
]);

/** Fields outside the common base and the score field (fame, xp, level, sponsor…), or null. */
export function extraFields(row: Row, lb: LeaderboardDef): Record<string, unknown> | null {
  const extra: Record<string, unknown> = {};
  let any = false;
  for (const [k, v] of Object.entries(row)) {
    if (COMMON_FIELDS.has(k) || k === lb.scoreField) continue;
    extra[k] = v;
    any = true;
  }
  return any ? extra : null;
}

export interface IndexedRows {
  byName: Map<string, NormalizedRow>;
  duplicates: number;
  /** Rows with an empty name: kept out of the database, counted. */
  unidentified: number;
}

/** First occurrence wins on duplicate names (upstream order = rank order). */
export function indexRows(rows: readonly Row[], lb: LeaderboardDef): IndexedRows {
  const byName = new Map<string, NormalizedRow>();
  let duplicates = 0;
  let unidentified = 0;
  for (const row of rows) {
    const normalized = normalizeRow(row, lb);
    if (normalized.name.length === 0) {
      unidentified++;
      continue;
    }
    if (byName.has(normalized.name)) {
      duplicates++;
      continue;
    }
    byName.set(normalized.name, normalized);
  }
  return { byName, duplicates, unidentified };
}
