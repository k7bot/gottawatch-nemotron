import { beforeEach, describe, expect, it } from "vitest";
import { FeedResponse, FriendsResponse, TonightResponse } from "@gottawatch/contract";
import { applySeed, buildSeed, DEMO_RECS } from "../src/seed/seed.js";
import { MemoryStore } from "../src/lib/store.js";
import { makeAppHandler, makeTonightHandler } from "../src/handlers/routes.js";
import { makeAuthorizer } from "../src/handlers/authorizer.js";
import { stubPicker } from "../src/domain/tonight.js";
import { DAY_MS } from "../src/lib/time.js";
import { hashToken, recIdLowerBound } from "../src/lib/tokens.js";
import type { AppDeps } from "../src/lib/deps.js";
import { body, event, FakeClock } from "./helpers.js";

describe("seed (API-12)", () => {
  let clock: FakeClock, store: MemoryStore, deps: AppDeps;
  beforeEach(() => {
    clock = new FakeClock();
    store = new MemoryStore(clock.now);
    deps = { store, clock: clock.now, picker: stubPicker };
  });

  it("builds the provisional personas, judge households and recs relative to now", () => {
    const plan = buildSeed({ judges: 2 }, clock.now());
    expect(plan.users.map((u) => u.id)).toEqual(["u-kiran", "u-priya", "u-sam", "u-maya", "u-judge-1", "u-judge-2"]);
    expect(plan.households.every((h) => h.timezone === "America/New_York")).toBe(true);
    expect(plan.viewerHouseholdIds).toEqual(["hh-kiran", "hh-judge-1", "hh-judge-2"]);
    expect(plan.friendships).toContainEqual(["u-kiran", "u-priya"]);
    expect(plan.friendships).not.toContainEqual(["u-priya", "u-sam"]); // friends of Kiran only (OQ-18 proposal)
    expect(plan.recs).toHaveLength(3 * DEMO_RECS.length);
    for (const r of plan.recs) {
      const age = clock.now().getTime() - Date.parse(r.createdAt);
      expect(age).toBeGreaterThan(0);
      expect(age).toBeLessThan(7 * DAY_MS); // inside both windows
      expect(r.recId.startsWith(recIdLowerBound(new Date(r.createdAt)))).toBe(true); // recId from createdAt
      expect(r.genres?.length).toBeGreaterThan(0); // demo catalog metadata is copied for Ask
      if (r.seen) expect(Date.parse(r.seenAt!)).toBeGreaterThan(Date.parse(r.createdAt));
    }
    const kiran = plan.recs.filter((r) => r.householdId === "hh-kiran");
    expect(kiran.filter((r) => r.seen).map((r) => r.title)).toEqual(["Below Quarry Lake", "The Lighthouse Supper Club"]);
    expect(new Set(kiran.filter((r) => !r.seen).map((r) => r.title)).size).toBeGreaterThanOrEqual(10); // enough for the Ask demo
    expect(kiran.filter((r) => !r.seen && r.note).length).toBeGreaterThanOrEqual(10);
    expect(kiran.some((r) => r.title === "Saltwater Static")).toBe(false); // live send in the video
  });

  it("prefixes every id (throwaway seeds for smoke tests)", () => {
    const plan = buildSeed({ idPrefix: "smoke-x-", judges: 1 }, clock.now());
    const ids = [...plan.users.map((u) => u.id), ...plan.households.map((h) => h.id), ...plan.recs.map((r) => r.householdId), ...plan.recs.map((r) => r.fromUserId)];
    expect(ids.every((id) => id.startsWith("smoke-x-"))).toBe(true);
  });

  it("apply: tokens work end to end, only hashes are stored, tonight picks the 2-sender title", async () => {
    const { links } = await applySeed(store, buildSeed({ judges: 1 }, clock.now()));
    expect(links).toHaveLength(5);
    expect(links.every((l) => l.token.startsWith("wcp_") && l.rotated)).toBe(true);
    const dump = JSON.stringify({ t: [...store.tokens.values()], u: [...store.users.values()] });
    for (const l of links) expect(dump).not.toContain(l.token);

    const authz = makeAuthorizer(() => store);
    const priya = links.find((l) => l.userId === "u-priya")!;
    const res = await authz({ headers: { authorization: `Bearer ${priya.token}` } } as never);
    expect(res.isAuthorized).toBe(true);

    const app = makeAppHandler(() => deps);
    const friends = FriendsResponse.parse(body(await app(event("GET /friends", { auth: { kind: "profile", subjectId: "u-priya", householdId: "hh-priya" } }))));
    expect(friends.friends.map((f) => f.id).sort()).toEqual(["u-judge-1", "u-kiran"]);

    const dev = { kind: "device" as const, subjectId: "tvA1b2C3d4E5f6G7h8I9j0K1", householdId: "hh-kiran" };
    const feed = FeedResponse.parse(body(await app(event("GET /feed", { auth: dev }))));
    expect(feed.items.map((i) => i.title)).toEqual([
      "Kestrel Bay", "Small Hours Bakery", "Lanternfish and Co", "Ninety Seconds to Orbit", "Kestrel Bay", "The Paper Comet",
      "Small Hours Bakery", "Night Desk at Hollow Pines", "The Quiet Orchard", "Copper and Thistle", "The Marigold Line", "Fjordlight", "The Birdie Rule",
    ]);
    const t = TonightResponse.parse(body(await makeTonightHandler(() => deps)(event("GET /tonight", { auth: dev }))));
    expect(t).toMatchObject({ title: "Kestrel Bay", source: "stub" });
  });

  it("re-run resets Seen, re-dates recs, clears the cached pick and rotates tokens (unless kept)", async () => {
    const first = await applySeed(store, buildSeed({ judges: 1 }, clock.now()));
    const app = makeAppHandler(() => deps);
    const dev = { kind: "device" as const, subjectId: "tvA1b2C3d4E5f6G7h8I9j0K1", householdId: "hh-kiran" };
    await makeTonightHandler(() => deps)(event("GET /tonight", { auth: dev }));
    const firstFeed = body(await app(event("GET /feed", { auth: dev }))).items;
    for (const i of firstFeed) await app(event("POST /recommendations/{id}/seen", { auth: dev, path: { id: i.id } }));
    expect(body(await app(event("GET /feed", { auth: dev }))).items).toHaveLength(0);

    clock.advance(20 * DAY_MS); // the old recs would now be outside every window
    const kiranOld = first.links.find((l) => l.userId === "u-kiran")!.token;
    const priyaOld = first.links.find((l) => l.userId === "u-priya")!.token;
    const second = await applySeed(store, buildSeed({ judges: 1 }, clock.now()), { keepTokens: { "u-kiran": kiranOld } });

    const feed = body(await app(event("GET /feed", { auth: dev }))).items;
    const unseen = DEMO_RECS.filter((d) => d.seenHoursAgo === undefined).length;
    expect(feed).toHaveLength(unseen);
    expect(feed.every((i: { createdAt: string }) => clock.now().getTime() - Date.parse(i.createdAt) < 7 * DAY_MS)).toBe(true);
    expect(store.recs.size).toBe(2 * DEMO_RECS.length); // no duplicates: one set per viewer household
    const t = await makeTonightHandler(() => deps)(event("GET /tonight", { auth: dev }));
    expect(t.statusCode).toBe(200);

    expect(second.links.find((l) => l.userId === "u-kiran")).toMatchObject({ token: kiranOld, rotated: false });
    const priyaNew = second.links.find((l) => l.userId === "u-priya")!;
    expect(priyaNew.rotated).toBe(true);
    expect(await store.getToken(hashToken(priyaOld))).toBeUndefined(); // old token revoked
    expect(await store.getToken(hashToken(priyaNew.token))).toBeDefined();
    expect(store.tokens.size).toBe(5);
    expect((await store.listFriendIds("u-kiran")).sort()).toEqual(["u-maya", "u-priya", "u-sam"]);
  });

  it("keepTokens with a token that doesn't match the stored hash rotates instead", async () => {
    await applySeed(store, buildSeed({ judges: 0 }, clock.now()));
    const r = await applySeed(store, buildSeed({ judges: 0 }, clock.now()), { keepTokens: { "u-kiran": "wcp_forged" } });
    expect(r.links.find((l) => l.userId === "u-kiran")!.rotated).toBe(true);
  });
});
