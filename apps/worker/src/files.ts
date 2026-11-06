/**
 * Format des fichiers écrits par le collecteur finals-hq-data (src/types.ts de ce dépôt),
 * validé à la lecture : un fichier qui ne correspond pas est rejeté, jamais interprété.
 */
import { z } from "zod";

export const jsonSchema = z.json();
export type Json = z.infer<typeof jsonSchema>;

/** Une ligne de classement, telle que l'API la renvoie. */
export const rowSchema = z.record(z.string(), jsonSchema);
export type Row = z.infer<typeof rowSchema>;

const sourceInfoSchema = z.object({
  url: z.string(),
  fetchedAt: z.string(),
  status: z.number(),
  durationMs: z.number(),
  headers: z.record(z.string(), z.string()),
});

export const fullSnapshotSchema = z.object({
  v: z.literal(1),
  type: z.literal("full"),
  key: z.string(),
  idField: z.string(),
  source: sourceInfoSchema,
  sha256: z.string(),
  meta: jsonSchema,
  count: z.number(),
  rows: z.array(rowSchema),
});

export const deltaSnapshotSchema = z.object({
  v: z.literal(1),
  type: z.literal("delta"),
  key: z.string(),
  idField: z.string(),
  base: z.string(),
  seq: z.number().int(),
  source: sourceInfoSchema,
  sha256: z.string(),
  meta: jsonSchema,
  count: z.number(),
  stats: z.object({
    changed: z.number(),
    added: z.number(),
    removed: z.number(),
    unchanged: z.number(),
    duplicateIds: z.number(),
  }),
  changed: z.array(rowSchema),
  removed: z.array(z.string()),
});

export const snapshotFileSchema = z.discriminatedUnion("type", [fullSnapshotSchema, deltaSnapshotSchema]);

const fileRefSchema = z.object({ file: z.string(), at: z.string(), sha256: z.string(), count: z.number() });

export const manifestSchema = z.object({
  v: z.literal(1),
  key: z.string(),
  idField: z.string(),
  volatileFields: z.array(z.string()),
  base: fileRefSchema.optional(),
  deltas: z.array(fileRefSchema),
  lastRun: z
    .object({
      at: z.string(),
      outcome: z.string(),
      sha256: z.string().optional(),
      count: z.number().optional(),
      message: z.string().optional(),
    })
    .optional(),
  lastSuccessAt: z.string().optional(),
});

export type FullSnapshot = z.infer<typeof fullSnapshotSchema>;
export type DeltaSnapshot = z.infer<typeof deltaSnapshotSchema>;
export type SnapshotFile = z.infer<typeof snapshotFileSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type FileRef = z.infer<typeof fileRefSchema>;

export class FileFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileFormatError";
  }
}

function issues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(racine)"}: ${i.message}`)
    .join(" ; ");
}

export function parseSnapshotFile(value: unknown, file: string): SnapshotFile {
  const parsed = snapshotFileSchema.safeParse(value);
  if (!parsed.success) throw new FileFormatError(`${file} : format de fichier inattendu (${issues(parsed.error)})`);
  return parsed.data;
}

export function parseManifest(value: unknown, file: string): Manifest {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) throw new FileFormatError(`${file} : manifest inattendu (${issues(parsed.error)})`);
  return parsed.data;
}
