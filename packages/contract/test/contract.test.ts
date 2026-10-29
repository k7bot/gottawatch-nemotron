import { describe, expect, it } from "vitest";
import * as C from "../src/index.js";

const feedItem = {
  id: "r1",
  from: { id: "u-priya", displayName: "Priya" },
  title: "Kestrel Bay",
  mediaType: "tv",
  note: "40-min episodes, start at ep 2",
  service: null,
  runtime: 40,
  createdAt: "2026-10-11T20:00:00.000Z",
};

describe("contract", () => {
  it("accepts a valid feed item and rejects bad ones", () => {
    expect(C.FeedItem.parse(feedItem)).toMatchObject({ title: "Kestrel Bay" });
    expect(C.FeedItem.safeParse({ ...feedItem, createdAt: "yesterday" }).success).toBe(false);
    expect(C.FeedItem.safeParse({ ...feedItem, note: "x".repeat(121) }).success).toBe(false);
    const { service: _s, ...noService } = feedItem;
    expect(C.FeedItem.safeParse(noService).success).toBe(false); // service is required (null = unknown)
  });

  it("validates pair codes against the unambiguous alphabet", () => {
    expect(C.PairCode.safeParse("K7Q4ZP").success).toBe(true);
    expect(C.PairCode.safeParse("K0Q4ZP").success).toBe(false); // 0 not allowed
    expect(C.PairCode.safeParse("K7Q4Z").success).toBe(false);
    expect(C.PairCode.safeParse("k7q4zp").success).toBe(false);
  });

  it("validates device ids", () => {
    expect(C.DeviceId.safeParse("tvA1b2C3d4E5f6G7h8I9j0K1").success).toBe(true);
    expect(C.DeviceId.safeParse("tv-abc12345").success).toBe(false); // < 22 chars (128 bits)
    expect(C.DeviceId.safeParse("short").success).toBe(false);
    expect(C.DeviceId.safeParse("has space 12345").success).toBe(false);
  });

  it("pair status is pending or paired with a device token", () => {
    expect(C.PairStatusResponse.parse({ status: "pending" })).toEqual({ status: "pending" });
    expect(C.PairStatusResponse.safeParse({ status: "paired", deviceToken: "wcd_x" }).success).toBe(true);
    expect(C.PairStatusResponse.safeParse({ status: "paired" }).success).toBe(false);
    expect(C.PairStatusResponse.safeParse({ status: "paired", deviceToken: "wcp_x" }).success).toBe(false);
  });

  it("tonight reason is capped at 220 chars and source is bedrock|stub|fallback", () => {
    const ok = { recId: "r1", title: "Kestrel Bay", reason: "Priya and Sam both recommended it.", source: "bedrock" };
    expect(C.TonightResponse.safeParse(ok).success).toBe(true);
    expect(C.TonightResponse.safeParse({ ...ok, reason: "x".repeat(221) }).success).toBe(false);
    expect(C.TonightResponse.safeParse({ ...ok, source: "stub" }).success).toBe(true);
    expect(C.TonightResponse.safeParse({ ...ok, source: "ai" }).success).toBe(false);
  });

  it("feed query defaults and bounds limit", () => {
    expect(C.FeedQuery.parse({})).toEqual({ limit: 50 });
    expect(C.FeedQuery.parse({ limit: "10" })).toEqual({ limit: 10 });
    expect(C.FeedQuery.safeParse({ limit: "1000" }).success).toBe(false);
  });

  it("create recommendation requires at least one recipient and a known title source", () => {
    const base = { titleRef: { source: "demo", id: "kestrel-bay" }, recipientHouseholdIds: ["hh-kiran"] };
    expect(C.CreateRecommendationRequest.safeParse(base).success).toBe(true);
    expect(C.CreateRecommendationRequest.safeParse({ ...base, recipientHouseholdIds: [] }).success).toBe(false);
    expect(C.CreateRecommendationRequest.safeParse({ ...base, titleRef: { source: "tmdb", id: "1" } }).success).toBe(false);
  });

  it("error body shape", () => {
    expect(C.ErrorBody.safeParse({ error: { code: "expired", message: "Code expired" } }).success).toBe(true);
    expect(C.ErrorBody.safeParse({ error: { code: "teapot", message: "" } }).success).toBe(false);
  });
});

import { serviceName, summarizeService } from "../src/index.js";
describe("services (ADR-0012)", () => {
  it("names known ids, null for unknown/other/not sure", () => {
    expect(serviceName("netflix")).toBe("Netflix");
    expect(serviceName("app_a")).toBe("Kitehouse");
    expect(serviceName("other")).toBeNull();
    expect(serviceName("service_a")).toBeNull();
    expect(serviceName(null)).toBeNull();
  });
  it("most common named service wins; ties go to the most recent; Not sure never wins", () => {
    const r = (service: string | null, h: number) => ({ service, createdAt: `2026-10-12T${String(h).padStart(2, "0")}:00:00.000Z` });
    expect(summarizeService([r("hulu", 1), r("netflix", 2), r("hulu", 3)])).toBe("hulu");
    expect(summarizeService([r("hulu", 1), r("netflix", 2)])).toBe("netflix");
    expect(summarizeService([r(null, 5), r(null, 6), r("max", 1)])).toBe("max");
    expect(summarizeService([r(null, 1), r("other", 2)])).toBeNull();
    expect(summarizeService([])).toBeNull();
  });
});

import { CONNECT_TV_LABEL, TV_PAIR_STEP, TV_DISCONNECTED_BANNER } from "../src/index.js";
describe("pairing words (phone and TV say the same thing)", () => {
  it("uses 'Connect a TV' everywhere", () => {
    expect(CONNECT_TV_LABEL).toBe("Connect a TV");
    expect(TV_PAIR_STEP).toBe("On your phone, open your Gottawatch link and choose Connect a TV");
    expect(TV_DISCONNECTED_BANNER).toContain("Connect it again");
    for (const s of [TV_PAIR_STEP, TV_DISCONNECTED_BANNER]) expect(s).not.toMatch(/\bPair\b/);
  });
});
