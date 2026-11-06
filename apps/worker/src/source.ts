/**
 * Lecture du dépôt finals-hq-data (checkout local) :
 *   state/<clé>/manifest.json, state/<clé>/{full,delta}-<stamp>.json.gz   chaîne courante
 *   archive/<clé>/AAAA/MM/JJ/<fichier>                                      chaînes précédentes
 *   seasons/<clé>/full-<stamp>.json.gz                                      archives figées (import unique)
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { FileFormatError, parseManifest, parseSnapshotFile, type Manifest, type SnapshotFile } from "./files.ts";

const SNAPSHOT_FILE = /^(full|delta)-(\d{4})-(\d{2})-(\d{2})T\d{2}-\d{2}-\d{2}Z\.json\.gz$/;

/** "full-2026-11-05T22-05-21Z.json.gz" → "2026-11-05T22-05-21Z" */
export function stampOf(file: string): string {
  const match = SNAPSHOT_FILE.exec(file);
  if (!match) throw new FileFormatError(`nom de fichier inattendu : ${file}`);
  return file.slice(match[1]!.length + 1, -".json.gz".length);
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export class DataSource {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async listStateKeys(): Promise<string[]> {
    try {
      const entries = await readdir(join(this.root, "state"), { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }

  async readManifest(key: string): Promise<Manifest | null> {
    const path = join(this.root, "state", key, "manifest.json");
    try {
      return parseManifest(JSON.parse(await readFile(path, "utf8")), path);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  private async readGzJson(path: string): Promise<unknown> {
    const buffer = await readFile(path);
    try {
      return JSON.parse(gunzipSync(buffer).toString("utf8"));
    } catch (error) {
      throw new FileFormatError(`${path} : gzip ou JSON illisible (${(error as Error).message})`);
    }
  }

  /** Reads a chain file from state/, falling back to its archive folder. */
  async readSnapshot(key: string, file: string): Promise<SnapshotFile> {
    const match = SNAPSHOT_FILE.exec(file);
    if (!match) throw new FileFormatError(`nom de fichier inattendu : ${file}`);
    const candidates = [
      join(this.root, "state", key, file),
      join(this.root, "archive", key, match[2]!, match[3]!, match[4]!, file),
    ];
    for (const path of candidates) {
      try {
        return parseSnapshotFile(await this.readGzJson(path), file);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
    throw new FileFormatError(`${key}/${file} introuvable dans state/ ni archive/`);
  }

  /** Every chain file found under archive/<key>, oldest first. */
  async listArchiveFiles(key: string): Promise<string[]> {
    const found: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) await walk(join(dir, entry.name));
        else if (SNAPSHOT_FILE.test(entry.name)) found.push(entry.name);
      }
    };
    await walk(join(this.root, "archive", key));
    return found.sort((a, b) => stampOf(a).localeCompare(stampOf(b)));
  }

  async listSeasonFiles(): Promise<Array<{ key: string; file: string }>> {
    const out: Array<{ key: string; file: string }> = [];
    let keys;
    try {
      keys = (await readdir(join(this.root, "seasons"), { withFileTypes: true })).filter((e) => e.isDirectory());
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    for (const dir of keys) {
      const files = (await readdir(join(this.root, "seasons", dir.name))).filter((f) => SNAPSHOT_FILE.test(f) && f.startsWith("full-"));
      for (const file of files.sort()) out.push({ key: dir.name, file });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file));
  }

  async readSeasonSnapshot(key: string, file: string): Promise<SnapshotFile> {
    return parseSnapshotFile(await this.readGzJson(join(this.root, "seasons", key, file)), file);
  }
}
