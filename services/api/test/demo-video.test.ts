// Offline rehearsal of the demo video storyboard (docs/design/demo-video-shot-list.md) against the
// real handlers with CATALOG_MODE=demo: made-up titles only, no posters, generic services, the
// Tonight's pick stays put after a live send, Mark seen + Undo work, and the reseed is safe for
// Kiran's real sign-in email and the judge / App Review accounts.
import { beforeEach, describe, expect, it } from "vitest";
import { FeedResponse, FriendsResponse, TitleSearchResponse, TonightResponse, DEMO_SERVICES } from "@gottawatch/contract";
import { applySeed, buildSeed } from "../src/seed/seed.js";
import { applyJudgeSeed } from "../src/seed/judge.js";
import { applyReviewSeed } from "../src/seed/appReview.js";
import { MemoryStore } from "../src/lib/store.js";
import { catalogFromEnv, type AppDeps } from "../src/lib/deps.js";
import { makeAppHandler, makeTonightHandler } from "../src/handlers/routes.js";
import { stubPicker } from "../src/domain/tonight.js";
import { DEMO_CATALOG } from "../src/catalog/demo.js";
import type { TitleRef } from "@gottawatch/contract";
import { body, event, FakeClock } from "./helpers.js";

const DEMO_TITLES = new Set(DEMO_CATALOG.map((t) => t.title));
const GENERIC = new Set<string | null>([null, ...DEMO_SERVICES.map((s) => s.id)]);
const tv = { kind: "device" as const, subjectId: "tvA1b2C3d4E5f6G7h8I9j0K1", householdId: "hh-kiran" };
const maya = { kind: "profile" as const, subjectId: "u-maya", householdId: "hh-maya" };

const tmdb = (id: string, title: string, mediaType: "tv" | "movie" = "tv"): TitleRef => ({ source: "tmdb", id, mediaType, title, poster: "https://image.tmdb.org/t/p/w342/x.jpg" });
const JUDGE_TITLES: Record<string, TitleRef> = {
  bear: tmdb("136315", "The Bear"), severance: tmdb("95396", "Severance"), robot: tmdb("1184918", "The Wild Robot", "movie"),
  slowhorses: tmdb("95480", "Slow Horses"), dune2: tmdb("693134", "Dune: Part Two", "movie"), shogun: tmdb("126308", "Shōgun"),
};

describe("demo video rehearsal (CATALOG_MODE=demo)", () => {
  let clock: FakeClock, store: MemoryStore, deps: AppDeps;
  beforeEach(async () => {
    clock = new FakeClock(new Date("2026-10-19T23:20:00.000Z")); // Mon 7:20pm ET, recording night
    store = new MemoryStore(clock.now);
    deps = { store, clock: clock.now, picker: stubPicker, catalog: catalogFromEnv(store, { CATALOG_MODE: "demo" }) };
    // Prod today: Kiran signs in by email; judge + App Review accounts already seeded.
    store.users.set("u-kiran", { id: "u-kiran", displayName: "Kiran", householdId: "hh-kiran", email: "kiran@example.com" });
    await applyJudgeSeed(store, "123456", JUDGE_TITLES, clock.now());
    await applyReviewSeed(store, "654321", clock.now());
  });

  it("reseed keeps Kiran's sign-in email and leaves judge + App Review data alone", async () => {
    const judgeBefore = JSON.stringify([...store.recs.values()].filter((r) => r.householdId.startsWith("judge-")));
    const reviewBefore = JSON.stringify([...store.recs.values()].filter((r) => r.householdId.startsWith("appreview-")));
    await applySeed(store, buildSeed({ judges: 0 }, clock.now()));
    expect((await store.getUser("u-kiran"))?.email).toBe("kiran@example.com");
    expect(JSON.stringify([...store.recs.values()].filter((r) => r.householdId.startsWith("judge-")))).toBe(judgeBefore);
    expect(JSON.stringify([...store.recs.values()].filter((r) => r.householdId.startsWith("appreview-")))).toBe(reviewBefore);
  });

  it("shots 1-6: demo titles only, pick stays Kestrel Bay after Maya's live send, Mark seen + Undo", async () => {
    await applySeed(store, buildSeed({ judges: 0 }, clock.now()));
    const app = makeAppHandler(() => deps);
    const tonight = makeTonightHandler(() => deps);

    // Shot 1: Tonight's pick from the seeded notes.
    const pick = TonightResponse.parse(body(await tonight(event("GET /tonight", { auth: tv }))));
    expect(pick).toMatchObject({ title: "Kestrel Bay", source: "stub" });
    expect(pick.poster).toBeUndefined();

    // Shot 2: Maya searches "sal" → only the made-up title, no poster, no providers.
    const search = TitleSearchResponse.parse(body(await app(event("GET /titles/search", { auth: maya, query: { q: "sal" } }))));
    expect(search.results).toEqual([expect.objectContaining({ source: "demo", id: "saltwater-static", title: "Saltwater Static" })]);
    expect(search.results.every((t) => !t.poster && !t.providers)).toBe(true);
    // Real-world searches find nothing (no TMDB in demo mode), and details are off.
    expect(body(await app(event("GET /titles/search", { auth: maya, query: { q: "the bear" } }))).results).toEqual([]);
    expect((await app(event("GET /titles/{mediaType}/{id}", { auth: maya, path: { mediaType: "tv", id: "136315" } }))).statusCode).toBe(404);

    const friends = FriendsResponse.parse(body(await app(event("GET /friends", { auth: maya }))));
    expect(friends.friends.map((f) => f.householdId)).toEqual(["hh-kiran"]);
    const sent = await app(event("POST /recommendations", { auth: maya, body: { titleRef: { source: "demo", id: "saltwater-static" }, note: "Perfect for a weeknight", service: null, recipientHouseholdIds: ["hh-kiran"] } }));
    expect(sent.statusCode).toBe(200);

    // Shot 3: it lands at the top of the TV feed.
    clock.advance(20_000);
    const feed = FeedResponse.parse(body(await app(event("GET /feed", { auth: tv })))).items;
    expect(feed[0]).toMatchObject({ title: "Saltwater Static", from: { displayName: "Maya" }, note: "Perfect for a weeknight" });
    for (const i of feed) {
      expect(DEMO_TITLES.has(i.title)).toBe(true);
      expect(i.poster).toBeUndefined();
      expect(GENERIC.has(i.service)).toBe(true);
    }

    // Shot 4: the pick did not flip to the new send (cached per household per night).
    expect(TonightResponse.parse(body(await tonight(event("GET /tonight", { auth: tv })))).title).toBe("Kestrel Bay");

    // Shot 6: Mark seen removes Kestrel Bay; Undo brings it back.
    const kb = feed.filter((i) => i.title === "Kestrel Bay");
    for (const i of kb) expect((await app(event("POST /recommendations/{id}/seen", { auth: tv, path: { id: i.id } }))).statusCode).toBe(200);
    const after = FeedResponse.parse(body(await app(event("GET /feed", { auth: tv })))).items;
    expect(after.some((i) => i.title === "Kestrel Bay")).toBe(false);
    for (const i of kb) expect((await app(event("DELETE /recommendations/{id}/seen", { auth: tv, path: { id: i.id } }))).statusCode).toBe(200);
    expect(FeedResponse.parse(body(await app(event("GET /feed", { auth: tv })))).items.filter((i) => i.title === "Kestrel Bay")).toHaveLength(2);
  });

  it("a stale TMDB pick in demo mode is refused gently, and the judge feed still reads", async () => {
    const app = makeAppHandler(() => deps);
    const judge = { kind: "profile" as const, subjectId: "judge-u-judge", householdId: "judge-hh-judge" };
    const r = await app(event("POST /recommendations", { auth: judge, body: { titleRef: { source: "tmdb", id: "136315", mediaType: "tv" }, recipientHouseholdIds: ["judge-hh-priya"] } }));
    expect(r.statusCode).toBe(400);
    const judgeTv = { kind: "device" as const, subjectId: "tvZ1b2C3d4E5f6G7h8I9j0K1", householdId: "judge-hh-judge" };
    const feed = FeedResponse.parse(body(await app(event("GET /feed", { auth: judgeTv })))).items;
    expect(feed.map((i) => i.title)).toContain("The Bear");
  });
});
