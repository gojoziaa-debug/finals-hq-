import { createTestDb, type TestDb } from "@finals-hq/db/test";
import { queryRows } from "@finals-hq/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyHide, findPlayer, liftHide, listRequests, maskContact, overdueRequests, purgeContacts, rejectRequest } from "./privacy.ts";

let t: TestDb;
const T0 = new Date("2026-11-10T12:00:00Z");

beforeAll(async () => {
  t = await createTestDb();
  await t.db.execute(sql`INSERT INTO players (embark_name, first_seen_at, last_seen_at) VALUES
    ('GOJO#6255', now(), now()), ('Other#0001', now(), now()), ('Old#1111', now(), now())`);
  await t.db.execute(sql`UPDATE players SET merged_into = (SELECT id FROM players WHERE embark_name = 'GOJO#6255') WHERE embark_name = 'Old#1111'`);
});
afterAll(() => t.close());

const hidden = async (name: string) => (await queryRows<{ h: boolean }>(t.db, sql`SELECT hidden_at IS NOT NULL AS h FROM players WHERE embark_name = ${name}`))[0]?.h;

describe("privacy", () => {
  it("masks contact details for public logs", () => {
    expect(maskContact("jean.dupont@gmail.com")).toBe("j***@g***.com");
    expect(maskContact("gojo_discord")).toBe("g***");
    expect(maskContact(null)).toBeNull();
  });

  it("finds a player by name, slug, id, case-insensitively, and follows merges", async () => {
    const byName = await findPlayer(t.db, "gojo#6255");
    expect(byName?.name).toBe("GOJO#6255");
    expect((await findPlayer(t.db, "GOJO-6255"))?.id).toBe(byName?.id);
    expect((await findPlayer(t.db, byName!.id))?.name).toBe("GOJO#6255");
    expect((await findPlayer(t.db, "Old#1111"))?.name).toBe("GOJO#6255");
    expect(await findPlayer(t.db, "Nobody#0000")).toBeNull();
  });

  it("applies a pending request, then lifts it", async () => {
    const p = (await findPlayer(t.db, "GOJO#6255"))!;
    await t.db.execute(sql`INSERT INTO hidden_profiles (player_id, requested_at, contact, message) VALUES (${p.id}::bigint, '2026-11-09T08:00:00Z', 'jean@gmail.com', 'c''est moi')`);
    const pending = await listRequests(t.db);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.contact).toBe("j***@g***.com");
    expect(pending[0]!.message).toBe("(9 caractères)");
    expect((await overdueRequests(t.db, T0)).map((r) => r.name)).toEqual(["GOJO#6255"]);

    await applyHide(t.db, p.id, "preuve par capture Discord", T0);
    expect(await hidden("GOJO#6255")).toBe(true);
    expect(await listRequests(t.db)).toHaveLength(0);
    const [done] = await listRequests(t.db, { all: true, showContact: true });
    expect(done).toMatchObject({ status: "applied", contact: "jean@gmail.com", hiddenNow: true });

    expect(await purgeContacts(t.db, new Date("2026-11-20T12:00:00Z"))).toBe(0);
    expect(await purgeContacts(t.db, new Date("2026-12-11T12:00:00Z"))).toBe(1);
    expect((await listRequests(t.db, { all: true, showContact: true }))[0]!.contact).toBeNull();

    await liftHide(t.db, p.id, T0);
    expect(await hidden("GOJO#6255")).toBe(false);
    expect((await listRequests(t.db, { all: true }))[0]!.status).toBe("lifted");
  });

  it("applies without a prior request and rejects only pending ones", async () => {
    const o = (await findPlayer(t.db, "Other#0001"))!;
    expect(await rejectRequest(t.db, o.id, "tiers")).toBe(false);
    await t.db.execute(sql`INSERT INTO hidden_profiles (player_id, requested_at) VALUES (${o.id}::bigint, ${T0.toISOString()}::timestamptz)`);
    expect(await rejectRequest(t.db, o.id, "demande d'un tiers")).toBe(true);
    expect(await hidden("Other#0001")).toBe(false);
    await applyHide(t.db, o.id, null, T0);
    expect(await hidden("Other#0001")).toBe(true);
    const row = (await listRequests(t.db, { all: true })).find((r) => r.playerId === o.id)!;
    expect(row).toMatchObject({ status: "applied", reason: "demande d'un tiers" });
  });
});
