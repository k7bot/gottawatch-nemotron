import { beforeEach, describe, expect, it } from "vitest";
import { FeedResponse, TitleSearchResponse } from "@gottawatch/contract";
import { makeAppHandler } from "../src/handlers/routes.js";
import { tmdbCatalog, tmdbFetcher, type FetchJson } from "../src/catalog/tmdb.js";
import { catalogFromEnv } from "../src/lib/deps.js";
import { body, event, profileAuth, world } from "./helpers.js";

describe("CATALOG_MODE=tmdb", () => {
  let w: ReturnType<typeof world>;
  let app: ReturnType<typeof makeAppHandler>;
  let calls: string[];
  let down = false;
  const fake: FetchJson = async (path) => {
    calls.push(path);
    if (down) throw new Error("TMDB 503");
    if (path.startsWith("/search/multi")) {
      return {
        results: [
          { id: 95396, media_type: "tv", name: "Severance", first_air_date: "2022-02-17", poster_path: "/sev.jpg" },
          { id: 1, media_type: "person", name: "Someone" },
          { id: 550, media_type: "movie", title: "Fight Club", release_date: "1999-10-15", poster_path: null },
        ],
      };
    }
    if (path.startsWith("/tv/95396")) return { id: 95396, name: "Severance", first_air_date: "2022-02-17", poster_path: "/sev.jpg", episode_run_time: [50], genres: [{ name: "Drama" }], "watch/providers": { results: { US: { flatrate: [{ provider_id: 350, provider_name: "Apple TV" }, { provider_id: 2243, provider_name: "Apple TV Amazon Channel" }] }, GB: { flatrate: [{ provider_id: 8, provider_name: "Netflix" }] } } } };
    if (path.startsWith("/movie/550")) return { id: 550, title: "Fight Club", "watch/providers": { results: { US: { flatrate: [{ provider_id: 8, provider_name: "Netflix" }, { provider_id: 1796, provider_name: "Netflix Standard with Ads" }, { provider_id: 15, provider_name: "Hulu" }] } } } };
    if (path.startsWith("/movie/551")) return { id: 551, title: "Nowhere", "watch/providers": { results: {} } };
    throw new Error("TMDB 404");
  };
  beforeEach(() => {
    calls = [];
    down = false;
    w = world();
    w.deps.catalog = tmdbCatalog(fake, w.store, w.clock.now);
    app = makeAppHandler(() => w.deps);
  });

  it("search returns movies and TV only, with w342 posters", async () => {
    const r = await app(event("GET /titles/search", { auth: profileAuth(), query: { q: "sev" } }));
    const { results } = TitleSearchResponse.parse(body(r));
    expect(results).toEqual([
      { source: "tmdb", id: "95396", mediaType: "tv", title: "Severance", year: 2022, poster: "https://image.tmdb.org/t/p/w342/sev.jpg" },
      { source: "tmdb", id: "550", mediaType: "movie", title: "Fight Club", year: 1999 },
    ]);
  });

  it("search failure is a gentle 500, not a crash", async () => {
    down = true;
    const r = await app(event("GET /titles/search", { auth: profileAuth(), query: { q: "sev" } }));
    expect(r.statusCode).toBe(500);
    expect(JSON.stringify(body(r))).toContain("show or movie");
  });

  it("recommending a TMDB title uses server metadata and caches TITLE#", async () => {
    const send = () =>
      app(event("POST /recommendations", { auth: profileAuth("u-priya", "hh-priya"), body: { titleRef: { source: "tmdb", id: "95396", mediaType: "tv" }, recipientHouseholdIds: ["hh-kiran"] } }));
    expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(200);
    expect(calls.filter((c) => c.startsWith("/tv/")).length).toBe(1);
    expect(w.store.titles.get("tv-95396")?.title.runtime).toBe(50);
    const f = await app(event("GET /me/feed", { auth: profileAuth() }));
    const item = FeedResponse.parse(body(f)).items[0]!;
    expect(item).toMatchObject({ title: "Severance", year: 2022, runtime: 50, poster: "https://image.tmdb.org/t/p/w342/sev.jpg" });
  });

  it("unknown TMDB id → 404; demo id while in tmdb mode → 400", async () => {
    const send = (titleRef: unknown) => app(event("POST /recommendations", { auth: profileAuth(), body: { titleRef, recipientHouseholdIds: ["hh-kiran"] } }));
    expect((await send({ source: "tmdb", id: "777", mediaType: "movie" })).statusCode).toBe(404);
    expect((await send({ source: "demo", id: "kestrel-bay" })).statusCode).toBe(400);
    expect((await send({ source: "custom", title: "Home movie" })).statusCode).toBe(200);
  });

  it("GET /titles/{mediaType}/{id} returns US subscription providers mapped to our ids", async () => {
    const get = (mediaType: string, id: string) => app(event("GET /titles/{mediaType}/{id}", { auth: profileAuth(), path: { mediaType, id } }));
    const sev = body(await get("tv", "95396")) as { title: { providers: string[] } };
    expect(sev.title.providers).toEqual(["apple_tv"]); // add-on channel and non-US skipped
    const fc = body(await get("movie", "550")) as { title: { providers: string[] } };
    expect(fc.title.providers).toEqual(["netflix", "hulu"]); // ad tier de-duplicated
    const none = body(await get("movie", "551")) as { title: { providers: string[] } };
    expect(none.title.providers).toEqual([]);
    expect((await get("movie", "777")).statusCode).toBe(404);
    expect((await get("book", "1")).statusCode).toBe(400);
    expect(calls.some((c) => c.includes("append_to_response=watch/providers"))).toBe(true);
  });

  it("old cache entries without providers are refreshed once", async () => {
    w.store.titles.set("tv-95396", { key: "tv-95396", cachedAt: w.clock.now().toISOString(), title: { source: "tmdb", id: "95396", mediaType: "tv", title: "Severance" } });
    const r = body(await app(event("GET /titles/{mediaType}/{id}", { auth: profileAuth(), path: { mediaType: "tv", id: "95396" } }))) as { title: { providers: string[] } };
    expect(r.title.providers).toEqual(["apple_tv"]);
  });

  it("details in demo mode → 404", async () => {
    w.deps.catalog = undefined;
    expect((await app(event("GET /titles/{mediaType}/{id}", { auth: profileAuth(), path: { mediaType: "tv", id: "1" } }))).statusCode).toBe(404);
  });

  it("catalogFromEnv: demo by default, tmdb needs a param name", () => {
    expect(catalogFromEnv(w.store, {}).mode).toBe("demo");
    expect(() => catalogFromEnv(w.store, { CATALOG_MODE: "tmdb" })).toThrow();
    expect(catalogFromEnv(w.store, { CATALOG_MODE: "tmdb", TMDB_PARAM_NAME: "/x" }).mode).toBe("tmdb");
    expect(() => catalogFromEnv(w.store, { CATALOG_MODE: "nope" })).toThrow();
  });

  it("fetcher sends the bearer token", async () => {
    let auth = "";
    const f = tmdbFetcher(async () => "tok", (async (_u: string, init?: RequestInit) => {
      auth = (init?.headers as Record<string, string>).Authorization!;
      return new Response("{}", { status: 200 });
    }) as typeof fetch);
    await f("/x");
    expect(auth).toBe("Bearer tok");
  });
});
