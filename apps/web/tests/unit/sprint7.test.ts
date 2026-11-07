import { describe, expect, it } from "vitest";
import raw from "../../src/data/supporters.json";
import { isPatreonUrl, parseSupportConfig, supportConfig, supporterRole } from "../../src/lib/supporters";
import { isVideoKind, maxSteps, parseVideoParams, videoFilename, videoPath } from "../../src/lib/video";
import { isUsageEvent } from "../../src/lib/writes";

describe("supporters", () => {
  it("accepts only https patreon.com links", () => {
    expect(isPatreonUrl("https://www.patreon.com/c/gojo")).toBe(true);
    expect(isPatreonUrl("https://patreon.com/gojo/membership")).toBe(true);
    expect(isPatreonUrl("http://www.patreon.com/gojo")).toBe(false);
    expect(isPatreonUrl("https://patreon.com.evil.example/gojo")).toBe(false);
    expect(isPatreonUrl("https://ko-fi.com/gojo")).toBe(false);
    expect(isPatreonUrl("pas une url")).toBe(false);
  });

  it("parses the hand-kept list, skipping malformed and duplicate entries", () => {
    const cfg = parseSupportConfig({
      patreonUrl: "https://www.patreon.com/gojo",
      tierName: "  Supporter HQ ",
      tierPrice: "",
      supporters: [
        { embarkId: "GOJO#6255", role: "creator", since: "2026-11" },
        { embarkId: "gojo#6255", role: "supporter" },
        { embarkId: "SansTag" },
        { embarkId: "Fan#0001", role: "admin", since: "novembre" },
        null,
        "Texte#1234",
      ],
    });
    expect(cfg.patreonUrl).toBe("https://www.patreon.com/gojo");
    expect(cfg.tierName).toBe("Supporter HQ");
    expect(cfg.tierPrice).toBeNull();
    expect(cfg.supporters).toEqual([
      { embarkId: "GOJO#6255", role: "creator", since: "2026-11" },
      { embarkId: "Fan#0001", role: "supporter", since: null },
    ]);
    expect(supporterRole("Gojo#6255", cfg)).toBe("creator");
    expect(supporterRole("FAN#0001", cfg)).toBe("supporter");
    expect(supporterRole("Fan#0002", cfg)).toBeNull();
    expect(supporterRole(null, cfg)).toBeNull();
  });

  it("lets the Vercel variable override the file and refuses a non-Patreon address", () => {
    expect(parseSupportConfig({ patreonUrl: "" }, { NEXT_PUBLIC_PATREON_URL: "https://patreon.com/x" }).patreonUrl).toBe("https://patreon.com/x");
    expect(parseSupportConfig({ patreonUrl: "https://paypal.me/x" }).patreonUrl).toBeNull();
    expect(parseSupportConfig(undefined)).toEqual({ patreonUrl: null, tierName: "Supporter HQ", tierPrice: null, supporters: [] });
  });

  it("ships a valid file: every entry survives validation", () => {
    expect(supportConfig().supporters.length).toBe((raw as { supporters: unknown[] }).supporters.length);
  });
});

describe("video templates", () => {
  it("parses parameters with safe defaults and clamps steps", () => {
    const p = parseVideoParams("movers", new URLSearchParams("l=en&bg=transparent&w=24h&dir=down&n=3&step=9&dl=1"));
    expect(p).toMatchObject({ kind: "movers", locale: "en", bg: "transparent", window: "24h", dir: "down", count: 3, step: 3, download: true, safe: false });
    const d = parseVideoParams("movers", new URLSearchParams("w=1y&step=-2&n=7"));
    expect(d).toMatchObject({ locale: "fr", bg: "solid", window: "7d", dir: "up", count: 5, step: 0 });
    expect(parseVideoParams("duel", new URLSearchParams("p=GOJO-6255")).players).toEqual([]);
    expect(parseVideoParams("duel", new URLSearchParams("p=GOJO-6255,Autre-1234,Trois-0001")).players).toEqual(["GOJO-6255", "Autre-1234"]);
    expect(isVideoKind("cutoff")).toBe(true);
    expect(isVideoKind("club")).toBe(false);
    expect(maxSteps("movers", 3)).toBe(3);
    expect(maxSteps("duel", 5)).toBe(3);
  });

  it("builds short addresses that parse back to the same parameters", () => {
    expect(videoPath({ kind: "movers", locale: "fr", window: "7d", dir: "up", count: 5 })).toBe("/api/og/video/movers?l=fr");
    const path = videoPath({ kind: "movers", locale: "en", window: "season", dir: "down", count: 3, bg: "transparent", step: 2, download: true });
    const back = parseVideoParams("movers", new URL(path, "http://x").searchParams);
    expect(back).toMatchObject({ locale: "en", window: "season", dir: "down", count: 3, bg: "transparent", step: 2, download: true });
    expect(videoPath({ kind: "duel", locale: "fr", players: ["A-0001", "B-0002"], window: "24h" })).toBe("/api/og/video/duel?l=fr&p=A-0001%2CB-0002");
  });

  it("names files so steps sort in order", () => {
    const p = parseVideoParams("movers", new URLSearchParams("step=2&bg=transparent"));
    expect(videoFilename(p, "2026-11-07T20:40:00.000Z")).toBe("finals-hq-movers-up-7d-top5-2026-11-07-alpha-02.png");
    expect(videoFilename(parseVideoParams("cutoff", new URLSearchParams()), null)).toBe("finals-hq-cutoff-na-full.png");
  });

  it("counts video renders and Patreon clicks", () => {
    expect(isUsageEvent("video")).toBe(true);
    expect(isUsageEvent("support_click")).toBe(true);
  });
});
