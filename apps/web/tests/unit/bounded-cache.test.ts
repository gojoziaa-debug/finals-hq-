import { describe, expect, it } from "vitest";
import { boundedCache, maxAgeFor, type CacheWrapper, type Stamped } from "@/lib/bounded-cache";

/** Stand-in for unstable_cache: keeps the first value forever (worst case: no visitor ever triggers a refresh). */
function frozenCache(): CacheWrapper {
  let entry: Stamped<unknown> | undefined;
  return <T,>(load: () => Promise<Stamped<T>>) => async () => (entry ??= await load()) as Stamped<T>;
}

describe("cache à âge borné (rodage)", () => {
  it("serves the cached value while it is young, then reads the database again", async () => {
    let clock = 0;
    let reads = 0;
    const get = boundedCache(async () => ++reads, frozenCache(), 300_000, () => clock);
    expect(await get()).toBe(1);
    clock = 299_000;
    expect(await get()).toBe(1);
    clock = 20 * 3_600_000; // the night: before, the first visitor got the 20-hour-old value
    expect(await get()).toBe(2);
    expect(reads).toBe(2);
  });

  it("falls back to the stale value when the fresh read fails, and rethrows without one", async () => {
    let clock = 0;
    let fail = false;
    const get = boundedCache(async () => { if (fail) throw new Error("timeout"); return "ok"; }, frozenCache(), 1_000, () => clock);
    expect(await get()).toBe("ok");
    fail = true;
    clock = 5_000;
    expect(await get()).toBe("ok");
    const empty = boundedCache(async () => { throw new Error("down"); }, frozenCache(), 1_000, () => clock);
    await expect(empty()).rejects.toThrow("down");
  });

  it("ignores entries written before the change (no timestamp)", async () => {
    const legacy: CacheWrapper = <T,>() => async () => ({ rows: [] }) as unknown as Stamped<T>;
    const get = boundedCache(async () => "fresh", legacy, 1_000);
    expect(await get()).toBe("fresh");
  });

  it("bounds live data to 5 minutes and slower entries to three periods", () => {
    expect(maxAgeFor(60)).toBe(300_000);
    expect(maxAgeFor(300)).toBe(900_000);
    expect(maxAgeFor(86_400)).toBe(3 * 86_400_000);
  });
});
