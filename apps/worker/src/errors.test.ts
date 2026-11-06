import { describe, expect, it } from "vitest";
import { describeError } from "./errors.ts";

describe("describeError", () => {
  it("keeps the query head, drops the parameters and follows the causes with their Postgres code", () => {
    const pg = Object.assign(new Error("canceling statement due to statement timeout"), { name: "PostgresError", code: "57014" });
    const drizzle = new Error(`Failed query: update "players" set "last_seen_at" = $1 where id in ($2)\nparams: 2026-11-05T22:05:21.579Z,1`, { cause: pg });
    const text = describeError(drizzle);
    expect(text).toContain('Error: Failed query: update "players"');
    expect(text).not.toContain("params:");
    expect(text).toContain("← PostgresError: canceling statement due to statement timeout code=57014");
  });

  it("truncates long messages and accepts non-errors", () => {
    expect(describeError("boom")).toBe("boom");
    expect(describeError(new Error("x".repeat(500)))).toHaveLength("Error: ".length + 240 + 1);
  });
});
