import { beforeEach, describe, expect, it } from "vitest";
import { CreateRecommendationResponse, FeedResponse, FriendsResponse, TitleSearchResponse } from "@gottawatch/contract";
import { makeAppHandler } from "../src/handlers/routes.js";
import { DEMO_CATALOG } from "../src/catalog/demo.js";
import { body, deviceAuth, event, profileAuth, world } from "./helpers.js";

describe("friends, title search, create recommendation (API-11)", () => {
  let w: ReturnType<typeof world>;
  let app: ReturnType<typeof makeAppHandler>;
  const priya = () => profileAuth("u-priya", "hh-priya");
  beforeEach(() => {
    w = world();
    w.store.users.set("u-maya", { id: "u-maya", displayName: "Maya", householdId: "hh-maya" }); // not Priya's friend
    app = makeAppHandler(() => w.deps);
  });

  it("GET /friends lists friends with households, sorted by name", async () => {
    const r = await app(event("GET /friends", { auth: profileAuth() }));
    expect(r.statusCode).toBe(200);
    const { friends } = FriendsResponse.parse(body(r));
    expect(friends).toEqual([
      { id: "u-priya", displayName: "Priya", householdId: "hh-priya" },
      { id: "u-sam", displayName: "Sam", householdId: "hh-sam" },
    ]);
  });

  it("GET /friends and /titles/search need a profile token", async () => {
    expect((await app(event("GET /friends", { auth: deviceAuth() }))).statusCode).toBe(403);
    expect((await app(event("GET /titles/search", { auth: deviceAuth(), query: { q: "bay" } }))).statusCode).toBe(403);
  });

  it("GET /titles/search matches the demo catalog case-insensitively", async () => {
    const r = await app(event("GET /titles/search", { auth: profileAuth(), query: { q: "  KESTREL " } }));
    const { results } = TitleSearchResponse.parse(body(r));
    expect(results.map((t) => t.id)).toEqual(["kestrel-bay"]);
    const none = await app(event("GET /titles/search", { auth: profileAuth(), query: { q: "zzz" } }));
    expect(body(none).results).toEqual([]);
    expect((await app(event("GET /titles/search", { auth: profileAuth(), query: { q: " " } }))).statusCode).toBe(400);
    expect((await app(event("GET /titles/search", { auth: profileAuth() }))).statusCode).toBe(400);
  });

  it("every catalog entry is a valid TitleRef with a unique id", () => {
    expect(TitleSearchResponse.parse({ results: DEMO_CATALOG }).results).toHaveLength(DEMO_CATALOG.length);
    expect(new Set(DEMO_CATALOG.map((t) => t.id)).size).toBe(DEMO_CATALOG.length);
  });

  it("POST /recommendations writes one rec per friend household; it shows up in that TV feed", async () => {
    const r = await app(
      event("POST /recommendations", {
        auth: priya(),
        body: {
          titleRef: { source: "demo", id: "kestrel-bay" },
          note: "40-min episodes, start at ep 2",
          recipientHouseholdIds: ["hh-kiran", "hh-kiran"],
        },
      }),
    );
    expect(r.statusCode).toBe(200);
    const { ids } = CreateRecommendationResponse.parse(body(r));
    expect(ids).toHaveLength(1); // duplicates collapse
    const feed = FeedResponse.parse(body(await app(event("GET /feed", { auth: deviceAuth() }))));
    expect(feed.items[0]).toMatchObject({
      id: ids[0],
      title: "Kestrel Bay",
      mediaType: "tv",
      runtime: 40,
      note: "40-min episodes, start at ep 2",
      service: null,
      from: { id: "u-priya", displayName: "Priya" },
    });
  });

  it("title metadata comes from the server catalog, not the client", async () => {
    const r = await app(
      event("POST /recommendations", {
        auth: priya(),
        body: { titleRef: { source: "demo", id: "kestrel-bay", title: "Injected", poster: "https://evil.example/x.png" }, recipientHouseholdIds: ["hh-kiran"] },
      }),
    );
    expect(r.statusCode).toBe(200);
    const stored = [...w.store.recs.values()][0]!;
    expect(stored.title).toBe("Kestrel Bay");
    expect(stored.poster).toBeUndefined();
  });

  it("allows the sender's own household; rejects non-friends' households (403) and leaves no partial writes", async () => {
    const own = await app(event("POST /recommendations", { auth: priya(), body: { titleRef: { source: "demo", id: "saltwater-static" }, recipientHouseholdIds: ["hh-priya"] } }));
    expect(own.statusCode).toBe(200);
    const before = w.store.recs.size;
    const bad = await app(
      event("POST /recommendations", {
        auth: priya(),
        body: { titleRef: { source: "demo", id: "saltwater-static" }, recipientHouseholdIds: ["hh-kiran", "hh-maya"] },
      }),
    );
    expect(bad.statusCode).toBe(403);
    expect(w.store.recs.size).toBe(before);
  });

  it("unknown demo title → 404; tmdb → 400; bad body → 400; device token → 403", async () => {
    const send = (b: unknown, auth = priya()) => app(event("POST /recommendations", { auth, body: b }));
    expect((await send({ titleRef: { source: "demo", id: "nope" }, recipientHouseholdIds: ["hh-kiran"] })).statusCode).toBe(404);
    expect((await send({ titleRef: { source: "tmdb", id: "1", mediaType: "movie" }, recipientHouseholdIds: ["hh-kiran"] })).statusCode).toBe(400);
    expect((await send({ titleRef: { source: "demo", id: "kestrel-bay" }, recipientHouseholdIds: [] })).statusCode).toBe(400);
    expect((await send({ titleRef: { source: "demo", id: "kestrel-bay" }, note: "x".repeat(121), recipientHouseholdIds: ["hh-kiran"] })).statusCode).toBe(400);
    expect((await send({ titleRef: { source: "demo", id: "kestrel-bay" }, recipientHouseholdIds: ["hh-kiran"] }, deviceAuth())).statusCode).toBe(403);
  });

  it("a profile whose user record is gone → 401", async () => {
    const r = await app(event("GET /titles/search", { auth: profileAuth("u-ghost", "hh-x"), query: { q: "bay" } }));
    expect(r.statusCode).toBe(200); // search doesn't need the user record
    const c = await app(event("POST /recommendations", { auth: profileAuth("u-ghost", "hh-x"), body: { titleRef: { source: "demo", id: "kestrel-bay" }, recipientHouseholdIds: ["hh-x"] } }));
    expect(c.statusCode).toBe(401);
  });

  it("POST /recommendations accepts a free-text title (no catalog match), sanitized; TV feed shows it", async () => {
    const send = (titleRef: unknown) =>
      app(event("POST /recommendations", { auth: priya(), body: { titleRef, recipientHouseholdIds: ["hh-kiran"] } }));
    const r = await send({ source: "custom", title: "  The\u0000  <b>Long</b>\u200b   Night \n", year: 2019 });
    expect(r.statusCode).toBe(200);
    const feed = FeedResponse.parse(body(await app(event("GET /feed", { auth: deviceAuth() })))).items;
    const it0 = feed.find((f) => f.title.includes("Long"))!;
    expect(it0).toMatchObject({ title: "The b Long /b Night", year: 2019 });
    expect(it0.poster).toBeUndefined();
    expect(it0.mediaType).toBeUndefined();
    // Same typed title (any case) groups as one title for Seen.
    const rec = [...w.store.recs.values()].find((x) => x.title.includes("Long"))!;
    expect(rec).toMatchObject({ titleSource: "custom", titleId: "the-b-long-b-night-2019" });
    // Validation
    expect((await send({ source: "custom", title: " \u0000 <> " })).statusCode).toBe(400);
    expect((await send({ source: "custom", title: "x".repeat(301) })).statusCode).toBe(400);
    expect((await send({ source: "custom", title: "Ok", year: 1700 })).statusCode).toBe(400);
    expect((await send({ source: "custom", title: "Ok", year: 2099 })).statusCode).toBe(400); // > now + 3
    const long = await send({ source: "custom", title: "y".repeat(250) });
    expect(long.statusCode).toBe(200);
    expect([...w.store.recs.values()].some((x) => x.title === "y".repeat(100))).toBe(true);
  });
});
