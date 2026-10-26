import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySeed, buildSeed } from "../src/seed/seed.js";
import { MemoryStore } from "../src/lib/store.js";
import { backendFromEnv, fileBackend, openPersistedStore, restoreStore, s3Backend, serializeStore, type ObjectClient } from "../src/persist/snapshot.js";
import { askGottawatch } from "../src/domain/ask.js";

const dirs: string[] = [];
const tmp = async () => {
  const d = await mkdtemp(join(tmpdir(), "gw-snap-"));
  dirs.push(d);
  return d;
};
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

const fakeS3 = () => {
  const objects = new Map<string, string>();
  const client: ObjectClient = {
    get: async (b, k) => objects.get(`${b}/${k}`),
    put: async (b, k, body) => void objects.set(`${b}/${k}`, body),
  };
  return { objects, client };
};

describe("snapshot persistence (Nebius Object Storage / local file)", () => {
  it("round-trips every MemoryStore map, including Sets and Dates", async () => {
    const a = new MemoryStore();
    await applySeed(a, buildSeed({ judges: 1 }, new Date()));
    a.attempts.set("hh-kiran|2026-10-26", new Date("2026-10-26T23:00:00Z"));
    const b = new MemoryStore();
    const r = restoreStore(b, serializeStore(a));
    expect(r.rows).toBeGreaterThan(40);
    expect([...b.recs.values()]).toEqual([...a.recs.values()]);
    expect(b.friends.get("u-kiran")).toBeInstanceOf(Set);
    expect([...b.friends.get("u-kiran")!].sort()).toEqual(["u-maya", "u-priya", "u-sam"]);
    expect(b.attempts.get("hh-kiran|2026-10-26")).toEqual(new Date("2026-10-26T23:00:00Z"));
    expect(serializeStore(b, new Date(0))).toBe(serializeStore(a, new Date(0)));
  });

  it("rejects an unknown snapshot version", () => {
    expect(() => restoreStore(new MemoryStore(), JSON.stringify({ v: 99, maps: {} }))).toThrow(/version/);
  });

  it("file backend: debounced save after writes, nothing written for reads, restored on next boot", async () => {
    const file = join(await tmp(), "nested", "store.json");
    const p = await openPersistedStore(fileBackend(file), { debounceMs: 20 });
    expect(p.restored).toBe(false);
    await p.store.getUser("u-kiran"); // read: not dirty
    expect(p.dirty).toBe(false);
    await applySeed(p.store, buildSeed({ judges: 0 }, new Date()));
    expect(p.dirty).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(p.saves).toBe(1);
    expect(p.dirty).toBe(false);

    const again = await openPersistedStore(fileBackend(file));
    expect(again.restored).toBe(true);
    expect((await again.store.getUser("u-kiran"))?.displayName).toBe("Kiran");
    expect((await again.store.listRecs("hh-kiran", { limit: 100 })).length).toBeGreaterThan(10);
    expect(JSON.parse(await readFile(file, "utf8")).v).toBe(1);
    again.close();
  });

  it("flush saves immediately (SIGTERM path) and is a no-op when clean", async () => {
    const { objects, client } = fakeS3();
    const p = await openPersistedStore(s3Backend(client, "gw-demo", "gottawatch/store.json"), { debounceMs: 60_000 });
    await p.store.putHousehold({ id: "hh-x", name: "X", timezone: "America/New_York" });
    await p.flush();
    expect(p.saves).toBe(1);
    expect(objects.has("gw-demo/gottawatch/store.json")).toBe(true);
    await p.flush();
    expect(p.saves).toBe(1);
    const back = await openPersistedStore(s3Backend(client, "gw-demo", "gottawatch/store.json"));
    expect((await back.store.getHousehold("hh-x"))?.name).toBe("X");
  });

  it("a failed save keeps the data dirty and retries on the next flush", async () => {
    let fail = true;
    const saved: string[] = [];
    const logs: string[] = [];
    const p = await openPersistedStore(
      { label: "flaky", load: async () => undefined, save: async (b) => { if (fail) throw new Error("503 SlowDown"); saved.push(b); } },
      { debounceMs: 60_000, log: (m) => logs.push(m) },
    );
    await p.store.putHousehold({ id: "hh-y", name: "Y", timezone: "UTC" });
    await p.flush();
    expect(p.dirty).toBe(true);
    expect(logs.some((l) => l.includes("failed") && l.includes("503"))).toBe(true);
    fail = false;
    await p.flush();
    expect(saved).toHaveLength(1);
    expect(p.dirty).toBe(false);
  });

  it("the wrapped store works with the domain code (Ask fallback over a persisted seed)", async () => {
    const p = await openPersistedStore(undefined);
    await applySeed(p.store, buildSeed({ judges: 0 }, new Date()));
    const r = await askGottawatch({ store: p.store, clock: () => new Date() }, "hh-kiran", { query: "", chips: ["short"] });
    expect(r.source).toBe("fallback");
    expect(r.picks.length).toBeGreaterThan(0);
  });

  it("backendFromEnv: memory by default, file and s3 modes, s3 needs a bucket", async () => {
    expect(await backendFromEnv({})).toBeUndefined();
    expect((await backendFromEnv({ STORE_MODE: "file", SNAPSHOT_FILE: "/data/x.json" }))!.label).toBe("file:/data/x.json");
    const { client } = fakeS3();
    expect((await backendFromEnv({ STORE_MODE: "s3", SNAPSHOT_BUCKET: "b" }, client))!.label).toBe("s3://b/gottawatch/store.json");
    await expect(backendFromEnv({ STORE_MODE: "s3" }, client)).rejects.toThrow(/SNAPSHOT_BUCKET/);
    await expect(backendFromEnv({ STORE_MODE: "dynamo" })).rejects.toThrow(/unknown STORE_MODE/);
    // The real S3 client builds without network access.
    expect((await backendFromEnv({ STORE_MODE: "s3", SNAPSHOT_BUCKET: "b", S3_ENDPOINT: "https://storage.us-north1.nebius.cloud" }))!.label).toBe("s3://b/gottawatch/store.json");
  });
});
