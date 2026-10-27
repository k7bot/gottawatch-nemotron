import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/lib/store.js";
import { catalogFromEnv, type AppDeps } from "../src/lib/deps.js";
import { stubPicker } from "../src/domain/tonight.js";
import { applySeed, buildSeed } from "../src/seed/seed.js";
import { makeApiDispatcher, matchRoute } from "../src/server/router.js";
import { createRequestListener, redactPath, MAX_BODY_BYTES } from "../src/server/app.js";
import { staticSite } from "../src/server/static.js";

let server: Server;
let base = "";
let store: MemoryStore;
let token = "";
const logs: string[] = [];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "gw-web-"));
  mkdirSync(join(root, "assets"));
  mkdirSync(join(root, "tv", "_expo", "static", "js"), { recursive: true });
  writeFileSync(join(root, "index.html"), "<!doctype html><title>phone</title>" + " ".repeat(2000));
  writeFileSync(join(root, "assets", "app-abc123.js"), "console.log('web');" + "/*pad*/".repeat(300));
  writeFileSync(join(root, "tv", "index.html"), "<!doctype html><title>tv</title>");
  writeFileSync(join(root, "tv", "_expo", "static", "js", "entry-1.js"), "console.log('tv')");
  writeFileSync(join(tmpdir(), "gw-secret.txt"), "nope");
  store = new MemoryStore(() => new Date());
  const deps: AppDeps = { store, clock: () => new Date(), picker: stubPicker, catalog: catalogFromEnv(store, { CATALOG_MODE: "demo" }) };
  const { links } = await applySeed(store, buildSeed({ judges: 1 }, new Date()));
  token = links.find((l) => l.userId === "u-judge-1")!.token;
  const listener = createRequestListener({
    api: makeApiDispatcher(() => deps, () => store),
    web: staticSite(root, "/"),
    tv: staticSite(join(root, "tv"), "/tv/"),
    health: () => ({ store: "memory" }),
    log: (l) => logs.push(l),
  });
  server = createServer((q, s) => void listener(q, s));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const html = { accept: "text/html,application/xhtml+xml" };

describe("single-origin server", () => {
  it("matches API routes with params", () => {
    expect(matchRoute("POST", "/recommendations/r1/seen")).toEqual({ rk: "POST /recommendations/{id}/seen", params: { id: "r1" } });
    expect(matchRoute("GET", "/pair")).toBeUndefined();
    expect(matchRoute("GET", "/titles/movie/%E0%A4%A")).toBeUndefined(); // bad escape → no match, not a crash
  });

  it("serves healthz with security headers", async () => {
    const r = await fetch(`${base}/healthz`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, store: "memory" });
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(r.headers.get("access-control-allow-origin")).toBeNull(); // same origin, no CORS
  });

  it("serves /health as an alias (Cloud Run reserves /healthz)", async () => {
    const r = await fetch(`${base}/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
  });

  it("serves the PWA with SPA fallback and the TV app under /tv/", async () => {
    const home = await fetch(`${base}/`, { headers: html });
    expect(await home.text()).toContain("<title>phone");
    expect(home.headers.get("cache-control")).toBe("no-cache");
    expect(home.headers.get("content-encoding")).toBe("gzip"); // undici negotiates gzip by default
    for (const p of ["/pair?code=ABC", "/u/sometoken", "/invite/xyz"]) expect(await (await fetch(base + p, { headers: html })).text()).toContain("<title>phone");
    const tv = await fetch(`${base}/tv/`, { headers: html });
    expect(await tv.text()).toContain("<title>tv");
    expect(await (await fetch(`${base}/tv/watched`, { headers: html })).text()).toContain("<title>tv");
    const redirect = await fetch(`${base}/tv`, { redirect: "manual" });
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe("/tv/");
  });

  it("caches hashed assets forever and 404s missing files", async () => {
    const a = await fetch(`${base}/assets/app-abc123.js`);
    expect(a.headers.get("cache-control")).toContain("immutable");
    expect(a.headers.get("content-type")).toContain("javascript");
    const t = await fetch(`${base}/tv/_expo/static/js/entry-1.js`);
    expect(await t.text()).toContain("tv");
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
  });

  it("blocks path traversal", async () => {
    for (const p of ["/..%2Fgw-secret.txt", "/assets/..%2F..%2Fgw-secret.txt", "/tv/..%2F..%2Fgw-secret.txt"]) {
      const r = await fetch(base + p);
      expect(await r.text()).not.toContain("nope");
    }
  });

  it("runs the API on the same origin with the bearer token", async () => {
    expect((await fetch(`${base}/me`)).status).toBe(403);
    const me = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${token}` } });
    expect(me.status).toBe(200);
    expect(me.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await me.json())).toContain("Judge 1");
    const feed = await fetch(`${base}/me/feed`, { headers: { authorization: `Bearer ${token}` } });
    expect(feed.status).toBe(200);
    const start = await fetch(`${base}/pair/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: "tv-device-server-test-0001" }) });
    expect(start.status).toBeLessThan(300);
  });

  it("keeps unknown API-looking fetches as JSON 404s", async () => {
    const r = await fetch(`${base}/me/nope`, { headers: { accept: "application/json" } });
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("rejects oversized bodies", async () => {
    const r = await fetch(`${base}/recommendations`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: "x".repeat(MAX_BODY_BYTES + 10) });
    expect(r.status).toBe(413);
  });

  it("never logs profile tokens", async () => {
    await fetch(`${base}/u/${token}`, { headers: html });
    expect(redactPath(`/u/${token}`)).toBe("/u/[redacted]");
    expect(logs.join("\n")).not.toContain(token);
    expect(logs.some((l) => l.includes("/u/[redacted]"))).toBe(true);
  });
});

describe("demo refresh keeps links valid", () => {
  it("preserveTokens re-dates recs without rotating tokens", async () => {
    const s = new MemoryStore(() => new Date());
    const first = await applySeed(s, buildSeed({ judges: 1 }, new Date("2026-12-01T12:00:00Z")));
    const before = (await s.getUser("u-judge-1"))!.tokenHash;
    const again = await applySeed(s, buildSeed({ judges: 1 }, new Date("2026-12-05T12:00:00Z")), { preserveTokens: true });
    expect(again.links).toEqual([]);
    expect((await s.getUser("u-judge-1"))!.tokenHash).toBe(before);
    expect(first.links.length).toBeGreaterThan(0);
    const recs = await s.listRecs("hh-judge-1", { limit: 100 });
    expect(recs.every((r) => r.createdAt >= "2026-11-28")).toBe(true);
  });
});
