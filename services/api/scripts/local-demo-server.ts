// Offline rehearsal server for the demo video: the real route handlers over an in-memory store with
// CATALOG_MODE=demo and the demo seed (no AWS, no TMDB, nothing written anywhere but /tmp).
// Point a local web build (VITE_API_URL) and TV web export (EXPO_PUBLIC_API_URL) at it.
//   npx tsx services/api/scripts/local-demo-server.ts      → http://localhost:8787
// Profile links for the seeded personas go to /tmp/gottawatch-local-links.txt (throwaway tokens).
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { MemoryStore } from "../src/lib/store.js";
import { askFromEnv, catalogFromEnv, pickerFromEnv, type AppDeps } from "../src/lib/deps.js";
import { makeAppHandler, makeAskHandler, makePairHandler, makeTonightHandler } from "../src/handlers/routes.js";
import { makeAuthorizer } from "../src/handlers/authorizer.js";
import { systemClock } from "../src/lib/time.js";
import { applySeed, buildSeed } from "../src/seed/seed.js";

const PORT = Number(process.env.PORT ?? 8787);
const store = new MemoryStore(systemClock);
// PICK_MODE=nebius / ASK_MODE=nebius use Nemotron on Nebius Token Factory (needs NEBIUS_API_KEY).
// Defaults: stub picks; Ask uses Nemotron when NEBIUS_API_KEY is set, else deterministic answers.
const deps: AppDeps = { store, clock: systemClock, picker: pickerFromEnv(), ...askFromEnv(), catalog: catalogFromEnv(store, { CATALOG_MODE: "demo" }) };
const { links } = await applySeed(store, buildSeed({ judges: 0 }, new Date()));
writeFileSync("/tmp/gottawatch-local-links.txt", links.map((l) => `${l.userId}\t${l.token}`).join("\n") + "\n", { mode: 0o600 });

const app = makeAppHandler(() => deps), pair = makePairHandler(() => deps), tonight = makeTonightHandler(() => deps), ask = makeAskHandler(() => deps);
const authz = makeAuthorizer(() => store);
const PUBLIC = new Set(["POST /pair/start", "GET /pair/status", "GET /auth/config", "POST /auth/email/start", "POST /auth/email/verify", "POST /invites/preview"]);
const PAIR = new Set([...PUBLIC, "POST /pair/complete"]);
const ROUTES = ["POST /pair/start", "GET /pair/status", "POST /pair/complete", "GET /auth/config", "POST /auth/email/start", "POST /auth/email/verify",
  "POST /invites/preview", "GET /invites", "POST /invites", "DELETE /invites/{id}", "POST /invites/accept", "DELETE /friends/{id}", "GET /me", "GET /feed",
  "GET /friends", "GET /titles/search", "GET /titles/{mediaType}/{id}", "POST /recommendations", "POST /recommendations/{id}/seen", "DELETE /recommendations/{id}/seen",
  "GET /me/feed", "GET /me/seen", "POST /me/seen/{id}", "DELETE /me/seen/{id}", "GET /me/sent", "GET /me/home", "DELETE /me/home/tvs/{id}", "GET /seen", "GET /tonight",
  "POST /me/email", "POST /me/email/verify", "POST /ask"];
function match(method: string, path: string) {
  for (const rk of ROUTES) {
    const [m, tpl] = rk.split(" ") as [string, string];
    if (m !== method) continue;
    const a = tpl.split("/"), b = path.split("/");
    if (a.length !== b.length) continue;
    const params: Record<string, string> = {};
    if (a.every((seg, i) => (seg.startsWith("{") ? ((params[seg.slice(1, -1)] = decodeURIComponent(b[i]!)), true) : seg === b[i]))) return { rk, params };
  }
}
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "OPTIONS") return void res.writeHead(204, CORS).end();
  const m = match(req.method ?? "GET", url.pathname);
  if (!m) return void res.writeHead(404, { ...CORS, "content-type": "application/json" }).end('{"error":{"code":"not_found","message":"Not found"}}');
  let raw = "";
  for await (const c of req) raw += c;
  let lambda: unknown;
  if (!PUBLIC.has(m.rk) || req.headers.authorization) {
    const r = await authz({ headers: { authorization: req.headers.authorization } } as never);
    if (!r.isAuthorized && !PUBLIC.has(m.rk)) return void res.writeHead(403, { ...CORS, "content-type": "application/json" }).end('{"message":"Forbidden"}');
    lambda = r.isAuthorized ? r.context : undefined;
  }
  const event = { routeKey: m.rk, body: raw || undefined, isBase64Encoded: false, queryStringParameters: Object.fromEntries(url.searchParams), pathParameters: m.params, requestContext: { authorizer: lambda ? { lambda } : undefined }, headers: req.headers };
  const h = m.rk === "GET /tonight" ? tonight : m.rk === "POST /ask" ? ask : PAIR.has(m.rk) ? pair : app;
  const out = (await h(event as never)) as { statusCode: number; body?: string; headers?: Record<string, string> };
  res.writeHead(out.statusCode, { ...CORS, "content-type": "application/json", ...(out.headers ?? {}) }).end(out.body ?? "");
}).listen(PORT, () => console.log(`local demo API (CATALOG_MODE=demo, in-memory, picker=${deps.picker.source}, ask=${deps.chat ? "nebius" : "off"}) on http://localhost:${PORT}`));
