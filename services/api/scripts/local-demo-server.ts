// Offline rehearsal server (API only, CORS *; the single-origin server is src/server/main.ts) for the demo video: the real route handlers over an in-memory store with
// CATALOG_MODE=demo and the demo seed (no AWS, no TMDB, nothing written anywhere but /tmp).
// Point a local web build (VITE_API_URL) and TV web export (EXPO_PUBLIC_API_URL) at it.
//   npx tsx services/api/scripts/local-demo-server.ts      → http://localhost:8787
// Profile links for the seeded personas go to /tmp/gottawatch-local-links.txt (throwaway tokens).
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { MemoryStore } from "../src/lib/store.js";
import { askFromEnv, catalogFromEnv, pickerFromEnv, type AppDeps } from "../src/lib/deps.js";
import { makeApiDispatcher } from "../src/server/router.js";
import { systemClock } from "../src/lib/time.js";
import { applySeed, buildSeed } from "../src/seed/seed.js";

const PORT = Number(process.env.PORT ?? 8787);
const store = new MemoryStore(systemClock);
// PICK_MODE=nebius / ASK_MODE=nebius use Nemotron on Nebius Token Factory (needs NEBIUS_API_KEY).
// Defaults: stub picks; Ask uses Nemotron when NEBIUS_API_KEY is set, else deterministic answers.
const deps: AppDeps = { store, clock: systemClock, picker: pickerFromEnv(), ...askFromEnv(), catalog: catalogFromEnv(store, { CATALOG_MODE: "demo" }) };
const { links } = await applySeed(store, buildSeed({ judges: 0 }, new Date()));
writeFileSync("/tmp/gottawatch-local-links.txt", links.map((l) => `${l.userId}\t${l.token}`).join("\n") + "\n", { mode: 0o600 });

const api = makeApiDispatcher(() => deps, () => store);
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "OPTIONS") return void res.writeHead(204, CORS).end();
  let raw = "";
  for await (const c of req) raw += c;
  const out = await api({ method: req.method ?? "GET", path: url.pathname, query: url.searchParams, headers: req.headers, body: raw });
  if (!out) return void res.writeHead(404, { ...CORS, "content-type": "application/json" }).end('{"error":{"code":"not_found","message":"Not found"}}');
  res.writeHead(out.status, { ...CORS, ...out.headers }).end(out.body);
}).listen(PORT, () => console.log(`local demo API (CATALOG_MODE=demo, in-memory, picker=${deps.picker.source}, ask=${deps.chat ? "nebius" : "off"}) on http://localhost:${PORT}`));
