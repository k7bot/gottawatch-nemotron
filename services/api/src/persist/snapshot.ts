// Snapshot persistence for the single-container Nebius deployment.
// The whole MemoryStore (a few hundred KB at demo scale) is kept in RAM and saved as one JSON object:
//   - Nebius Object Storage (S3-compatible API) in the cloud, configured from env;
//   - a local file for tests and `docker run` on a laptop.
// Writes are debounced (default 2 s after the last change) and flushed on SIGTERM/SIGINT, so a
// container restart loses at most the last couple of seconds. One writer only: run one replica.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MemoryStore, type Store } from "../lib/store.js";

export const SNAPSHOT_VERSION = 1;

export interface SnapshotBackend {
  /** Short label for logs, e.g. "file:/data/gw.json" or "s3://bucket/key". Never includes secrets. */
  readonly label: string;
  /** Returns undefined when nothing has been saved yet. */
  load(): Promise<string | undefined>;
  save(body: string): Promise<void>;
  /** Writes a small private object/file next to the snapshot (e.g. seed-links.txt). */
  saveSibling?(name: string, body: string): Promise<void>;
}

// --- serialization ------------------------------------------------------------------------------
// Every Map field of MemoryStore is saved; Set and Date values are tagged so they round-trip.
type Tagged = { $set: unknown[] } | { $date: string };
const replacer = (_k: string, v: unknown): unknown => {
  if (v instanceof Set) return { $set: [...v] } satisfies Tagged;
  if (v instanceof Date) return { $date: v.toISOString() } satisfies Tagged;
  return v;
};
const revive = (v: unknown): unknown => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.$set) && Object.keys(o).length === 1) return new Set(o.$set.map(revive));
    if (typeof o.$date === "string" && Object.keys(o).length === 1) return new Date(o.$date);
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, revive(x)]));
  }
  return Array.isArray(v) ? v.map(revive) : v;
};

function mapFields(store: MemoryStore): [string, Map<unknown, unknown>][] {
  return Object.entries(store).filter((e): e is [string, Map<unknown, unknown>] => e[1] instanceof Map);
}

export function serializeStore(store: MemoryStore, savedAt = new Date()): string {
  const maps: Record<string, [unknown, unknown][]> = {};
  for (const [name, m] of mapFields(store)) maps[name] = [...m.entries()];
  // JSON.stringify calls Date#toJSON before the replacer sees it, so check the raw holder value.
  return JSON.stringify({ v: SNAPSHOT_VERSION, savedAt: savedAt.toISOString(), maps }, function (k, v) {
    const raw = (this as Record<string, unknown>)[k];
    return replacer(k, raw instanceof Date ? raw : v);
  });
}

/** Replaces the contents of every known Map; unknown names in the snapshot are ignored. */
export function restoreStore(store: MemoryStore, body: string): { maps: number; rows: number; savedAt?: string } {
  const parsed = JSON.parse(body) as { v?: number; savedAt?: string; maps?: Record<string, [unknown, unknown][]> };
  if (parsed.v !== SNAPSHOT_VERSION || !parsed.maps) throw new Error(`unsupported snapshot version ${String(parsed.v)}`);
  let maps = 0, rows = 0;
  for (const [name, m] of mapFields(store)) {
    const entries = parsed.maps[name];
    if (!Array.isArray(entries)) continue;
    m.clear();
    for (const [k, v] of entries) m.set(revive(k), revive(v));
    maps++;
    rows += entries.length;
  }
  return { maps, rows, ...(parsed.savedAt ? { savedAt: parsed.savedAt } : {}) };
}

// --- backends -----------------------------------------------------------------------------------
export function fileBackend(path: string): SnapshotBackend {
  return {
    label: `file:${path}`,
    async load() {
      try {
        return await readFile(path, "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw e;
      }
    },
    async save(body) {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.tmp-${process.pid}`;
      await writeFile(tmp, body, { mode: 0o600 });
      await rename(tmp, path); // atomic on one filesystem
    },
    async saveSibling(name, body) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(join(dirname(path), name), body, { mode: 0o600 });
    },
  };
}

/** Minimal S3 surface so tests can inject a fake; the real one wraps @aws-sdk/client-s3. */
export interface ObjectClient {
  get(bucket: string, key: string): Promise<string | undefined>;
  put(bucket: string, key: string, body: string): Promise<void>;
}

export function s3Backend(client: ObjectClient, bucket: string, key: string): SnapshotBackend {
  return {
    label: `s3://${bucket}/${key}`,
    load: () => client.get(bucket, key),
    save: (body) => client.put(bucket, key, body),
    saveSibling: (name, body) => client.put(bucket, key.includes("/") ? key.replace(/[^/]+$/, name) : name, body),
  };
}

export interface S3Config {
  endpoint?: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

export async function awsObjectClient(cfg: S3Config): Promise<ObjectClient> {
  const { S3Client, GetObjectCommand, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: cfg.region,
    ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
    forcePathStyle: cfg.forcePathStyle ?? true,
    ...(cfg.accessKeyId && cfg.secretAccessKey ? { credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } } : {}),
  });
  return {
    async get(Bucket, Key) {
      try {
        const r = await s3.send(new GetObjectCommand({ Bucket, Key }));
        return await r.Body?.transformToString("utf-8");
      } catch (e) {
        const name = (e as { name?: string }).name;
        const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (name === "NoSuchKey" || name === "NotFound" || status === 404) return undefined;
        throw e;
      }
    },
    async put(Bucket, Key, Body) {
      await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType: "application/json" }));
    },
  };
}

/**
 * Picks the backend from env (docs: deploy/nebius/README.md):
 *   STORE_MODE=s3   SNAPSHOT_BUCKET, SNAPSHOT_KEY (default gottawatch/store.json), S3_ENDPOINT
 *                   (e.g. https://storage.us-north1.nebius.cloud), S3_REGION, AWS_ACCESS_KEY_ID,
 *                   AWS_SECRET_ACCESS_KEY (from MysteryBox secrets)
 *   STORE_MODE=file SNAPSHOT_FILE (default ./.data/gottawatch-store.json)
 *   STORE_MODE=memory (default) no persistence.
 */
export async function backendFromEnv(env: NodeJS.ProcessEnv, objectClient?: ObjectClient): Promise<SnapshotBackend | undefined> {
  const mode = (env.STORE_MODE ?? "memory").toLowerCase();
  if (mode === "memory") return undefined;
  if (mode === "file") return fileBackend(env.SNAPSHOT_FILE || ".data/gottawatch-store.json");
  if (mode === "s3") {
    const bucket = env.SNAPSHOT_BUCKET;
    if (!bucket) throw new Error("STORE_MODE=s3 needs SNAPSHOT_BUCKET");
    const client =
      objectClient ??
      (await awsObjectClient({
        region: env.S3_REGION || "us-north1",
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
        ...(env.AWS_ACCESS_KEY_ID ? { accessKeyId: env.AWS_ACCESS_KEY_ID } : {}),
        ...(env.AWS_SECRET_ACCESS_KEY ? { secretAccessKey: env.AWS_SECRET_ACCESS_KEY } : {}),
        forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
      }));
    return s3Backend(client, bucket, env.SNAPSHOT_KEY || "gottawatch/store.json");
  }
  throw new Error(`unknown STORE_MODE ${mode} (memory | file | s3)`);
}

// --- the store wrapper --------------------------------------------------------------------------
const isRead = (name: string) => name.startsWith("get") || name.startsWith("list");

export interface Persisted {
  /** Use this wherever a Store is needed. Writes schedule a debounced save. */
  store: Store;
  memory: MemoryStore;
  /** Saves now if anything changed since the last save. Safe to call repeatedly. */
  flush(): Promise<void>;
  /** Stops the timer (tests); does not save. */
  close(): void;
  readonly dirty: boolean;
  readonly saves: number;
}

export interface PersistOptions {
  debounceMs?: number;
  now?: () => Date;
  log?: (msg: string) => void;
}

/** Loads the snapshot (if any) into a fresh MemoryStore and returns a Store that saves itself. */
export async function openPersistedStore(backend: SnapshotBackend | undefined, opts: PersistOptions = {}): Promise<Persisted & { restored: boolean }> {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  const memory = new MemoryStore(now);
  let restored = false;
  if (backend) {
    const body = await backend.load();
    if (body) {
      const r = restoreStore(memory, body);
      restored = true;
      log(`snapshot restored from ${backend.label}: ${r.rows} rows${r.savedAt ? `, saved ${r.savedAt}` : ""}`);
    } else log(`no snapshot at ${backend.label} yet; starting empty`);
  }
  const debounceMs = opts.debounceMs ?? 2000;
  let dirty = false, saves = 0, timer: ReturnType<typeof setTimeout> | undefined, inflight: Promise<void> | undefined;

  const flush = async (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (inflight) await inflight; // serialize writes
    if (!backend || !dirty) return;
    dirty = false;
    const body = serializeStore(memory, now());
    inflight = backend.save(body).then(
      () => void saves++,
      (e: unknown) => {
        dirty = true; // retry on the next change or flush
        log(`snapshot save to ${backend.label} failed: ${e instanceof Error ? e.message : String(e)}`);
      },
    );
    await inflight;
    inflight = undefined;
  };
  const touch = () => {
    if (!backend) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
    timer.unref?.();
  };

  const store = new Proxy(memory, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== "function" || typeof prop !== "string" || isRead(prop)) return v;
      return async (...args: unknown[]) => {
        try {
          return await (v as (...a: unknown[]) => unknown).apply(target, args);
        } finally {
          touch();
        }
      };
    },
  }) as Store;

  return {
    store,
    memory,
    restored,
    flush,
    close: () => clearTimeout(timer),
    get dirty() {
      return dirty;
    },
    get saves() {
      return saves;
    },
  };
}
