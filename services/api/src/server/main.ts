// Entry point for the Nebius container: one process serves the API, the phone PWA (/) and the TV
// browser view (/tv/). Everything is configured from env (README.md, "Run it in Docker"; deploy/northflank/):
//   PORT (8080)  WEB_DIST (./web)  TV_DIST (<WEB_DIST>/tv)
//   STORE_MODE memory|file|s3 (+ SNAPSHOT_* / S3_* / AWS_* for Nebius Object Storage)
//   CATALOG_MODE demo (default here)  PICK_MODE stub|nebius (default here: nebius when NEBIUS_API_KEY is set)
//   ASK_MODE nebius|off  NEBIUS_API_KEY
//   SEED_ON_BOOT (1) seeds the demo personas into an empty store; SEED_JUDGES (1) judge households;
//   DEMO_REFRESH_HOURS (24) re-dates the demo recs and resets judge Watched marks, so they never age out
//   and one judge marking everything watched does not empty the feed for long (0 = off).
// Plaintext profile links exist only at seed time; they go to SEED_LINKS_FILE (mode 600) or, with
// STORE_MODE=s3, to a private object next to the snapshot. They are never logged.
import { createServer } from "node:http";
import { access, constants, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { askFromEnv, catalogFromEnv, mailerFromEnv, pickerFromEnv, type AppDeps } from "../lib/deps.js";
import { systemClock } from "../lib/time.js";
import { applySeed, buildSeed, DEFAULT_REFRESH_HOURS, refreshDue, type SeedLink } from "../seed/seed.js";
import { backendFromEnv, openPersistedStore, type SnapshotBackend } from "../persist/snapshot.js";
import { makeApiDispatcher } from "./router.js";
import { createRequestListener } from "./app.js";
import { staticSite } from "./static.js";
import { existsSync } from "node:fs";

const env = process.env;
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

// File mode on a mounted volume (Docker -v, Northflank volume): fail fast with a readable message
// when the directory isn't writable by this user, instead of an EACCES stack trace at first write.
if ((env.STORE_MODE ?? "memory") === "file") {
  const dir = dirname(resolve(env.SNAPSHOT_FILE ?? "./.data/gottawatch-store.json"));
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
  } catch {
    const uid = process.getuid?.() ?? "?";
    const gid = process.getgid?.() ?? "?";
    console.error(
      `${new Date().toISOString()} startup: ${dir} is not writable by uid ${uid} gid ${gid}. ` +
        `Mount the volume at ${dir} owned by (or group-writable for) that user, or set STORE_MODE=memory.`,
    );
    process.exit(78);
  }
}

const backend = await backendFromEnv(env);
const persisted = await openPersistedStore(backend, { log });
const store = persisted.store;
const deps: AppDeps = {
  store,
  clock: systemClock,
  // Tonight's pick from Nemotron Nano when a key is present (one call per household per day, cached;
  // any failure falls back to the deterministic pick).
  picker: pickerFromEnv({ ...env, PICK_MODE: env.PICK_MODE ?? (env.NEBIUS_API_KEY ? "nebius" : "stub") }),
  ...askFromEnv(env),
  catalog: catalogFromEnv(store, { ...env, CATALOG_MODE: env.CATALOG_MODE ?? "demo" }),
  mailer: mailerFromEnv(env),
  ...(env.WEB_ORIGIN ? { webOrigin: env.WEB_ORIGIN } : {}),
};

const judges = Number(env.SEED_JUDGES ?? 1);
async function writeLinks(links: SeedLink[], b: SnapshotBackend | undefined) {
  if (!links.length) return;
  const text = links.map((l) => `${l.displayName}\t${l.userId}\t/u/${l.token}`).join("\n") + "\n";
  if (env.SEED_LINKS_FILE || !b || b.label.startsWith("file:")) {
    const file = env.SEED_LINKS_FILE || (b ? resolve(dirname(b.label.slice(5)), "seed-links.txt") : "/tmp/gottawatch-seed-links.txt");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text, { mode: 0o600 });
    log(`seed: wrote ${links.length} profile links to ${file}`);
  } else if (b.saveSibling) {
    await b.saveSibling("seed-links.txt", text);
    log(`seed: wrote ${links.length} profile links next to ${b.label} (seed-links.txt)`);
  }
}

if (env.SEED_ON_BOOT !== "0" && persisted.memory.users.size === 0) {
  const { links } = await applySeed(store, buildSeed({ judges }, new Date()));
  await writeLinks(links, backend);
  await persisted.flush();
  log(`seed: demo personas + ${judges} judge household(s) created`);
}

// Scheduled refresh: re-date the demo recs (tokens and paired TVs stay valid) when the newest
// seeded rec for Kiran is older than DEMO_REFRESH_HOURS, so judges always see a fresh evening.
const refreshHours = Number(env.DEMO_REFRESH_HOURS ?? DEFAULT_REFRESH_HOURS);
async function maybeRefresh() {
  if (!refreshHours || env.SEED_ON_BOOT === "0") return;
  const recs = await store.listRecs("hh-kiran", { limit: 200 });
  const newest = recs.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), "");
  if (!refreshDue(newest, Date.now(), refreshHours)) return;
  const { links } = await applySeed(store, buildSeed({ judges }, new Date()), { preserveTokens: true });
  await writeLinks(links, backend);
  log(`seed: demo recs refreshed (older than ${refreshHours}h)`);
}
await maybeRefresh();
setInterval(() => void maybeRefresh().catch((e) => log(`seed refresh failed: ${String(e)}`)), 3600e3).unref();

const webRoot = resolve(env.WEB_DIST || "web");
const tvRoot = resolve(env.TV_DIST || resolve(webRoot, "tv"));
const listener = createRequestListener({
  api: makeApiDispatcher(() => deps, () => store),
  ...(existsSync(webRoot) ? { web: staticSite(webRoot, "/") } : {}),
  ...(existsSync(tvRoot) ? { tv: staticSite(tvRoot, "/tv/") } : {}),
  health: () => ({ store: backend?.label.split(":")[0] ?? "memory", picker: deps.picker.source, ask: deps.chat ? "nebius" : "off", unsaved: persisted.dirty }),
  log: env.LOG_REQUESTS === "0" ? undefined : log,
});

const port = Number(env.PORT ?? 8080);
const server = createServer((req, res) => void listener(req, res));
server.keepAliveTimeout = 65_000;
server.listen(port, () =>
  log(`gottawatch on :${port} web=${existsSync(webRoot) ? webRoot : "none"} tv=${existsSync(tvRoot) ? tvRoot : "none"} store=${backend?.label ?? "memory"} picker=${deps.picker.source} ask=${deps.chat ? "nebius" : "off"}`),
);

let stopping = false;
const stop = async (sig: string) => {
  if (stopping) return;
  stopping = true;
  log(`${sig}: flushing snapshot and closing`);
  server.close();
  const t = setTimeout(() => process.exit(1), 10_000);
  try {
    await persisted.flush();
  } finally {
    clearTimeout(t);
    process.exit(0);
  }
};
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
