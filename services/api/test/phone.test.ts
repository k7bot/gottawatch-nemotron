import { beforeEach, describe, expect, it } from "vitest";
import { FeedResponse, HomeResponse, SeenHistoryResponse, SentResponse } from "@gottawatch/contract";
import { makeAppHandler } from "../src/handlers/routes.js";
import { body, deviceAuth, event, profileAuth, rec, world } from "./helpers.js";
import { buildSeed, applySeed } from "../src/seed/seed.js";
import { MemoryStore } from "../src/lib/store.js";

describe("phone-only routes (ADR-0013)", () => {
  let w: ReturnType<typeof world>;
  let app: ReturnType<typeof makeAppHandler>;
  beforeEach(() => {
    w = world();
    app = makeAppHandler(() => w.deps);
  });

  it("/me/feed shows the caller's home inbox and rejects device tokens (PT-1)", async () => {
    const r1 = rec(w.store, w.clock.now(), { title: "Kestrel Bay", fromName: "Priya" });
    rec(w.store, w.clock.now(), { title: "Elsewhere", fromName: "Kiran", householdId: "hh-priya" });
    const r = await app(event("GET /me/feed", { auth: profileAuth() }));
    expect(FeedResponse.parse(body(r)).items.map((i) => i.id)).toEqual([r1.recId]);
    expect((await app(event("GET /me/feed", { auth: deviceAuth() }))).statusCode).toBe(403);
    expect((await app(event("GET /feed", { auth: profileAuth() }))).statusCode).toBe(403);
  });

  it("home comes from the user record, not the token context (PT-2)", async () => {
    rec(w.store, w.clock.now(), { title: "Priya's", fromName: "Kiran", householdId: "hh-priya" });
    const r = await app(event("GET /me/feed", { auth: profileAuth("u-kiran", "hh-priya") }));
    expect(body(r).items).toHaveLength(0);
    expect((await app(event("GET /me/feed", { auth: profileAuth("u-gone", "hh-kiran") }))).statusCode).toBe(401);
  });

  it("seen + undo from the phone, scoped to the home", async () => {
    const r1 = rec(w.store, w.clock.now(), { title: "Kestrel Bay", fromName: "Priya" });
    const other = rec(w.store, w.clock.now(), { title: "X", fromName: "Kiran", householdId: "hh-priya" });
    expect((await app(event("POST /me/seen/{id}", { auth: profileAuth(), path: { id: r1.recId } }))).statusCode).toBe(200);
    const seen = SeenHistoryResponse.parse(body(await app(event("GET /me/seen", { auth: profileAuth() }))));
    expect(seen.items.map((i) => i.id)).toEqual([r1.recId]);
    expect((await app(event("DELETE /me/seen/{id}", { auth: profileAuth(), path: { id: r1.recId } }))).statusCode).toBe(200);
    expect(body(await app(event("GET /me/feed", { auth: profileAuth() }))).items).toHaveLength(1);
    expect((await app(event("POST /me/seen/{id}", { auth: profileAuth(), path: { id: other.recId } }))).statusCode).toBe(404);
  });

  it("a send shows up in /me/sent with names", async () => {
    const r = await app(event("POST /recommendations", {
      auth: profileAuth(),
      body: { titleRef: { source: "demo", id: "kestrel-bay" }, note: "start at ep 2", service: "app_a", recipientHouseholdIds: ["hh-priya", "hh-sam"] },
    }));
    expect(r.statusCode).toBe(200);
    const sent = SentResponse.parse(body(await app(event("GET /me/sent", { auth: profileAuth() }))));
    expect(sent.items).toHaveLength(1);
    expect(sent.items[0]).toMatchObject({ title: "Kestrel Bay", to: ["Priya", "Sam"], service: "app_a", note: "start at ep 2" });
    expect(body(await app(event("GET /me/sent", { auth: profileAuth("u-priya", "hh-priya") }))).items).toHaveLength(0);
  });

  it("/me/home lists members and live TVs with opaque ids (PT-3)", async () => {
    await w.store.putDevice({ id: "devA_aaaaaaaaaaaaaaaaaaaa", householdId: "hh-kiran", tokenHash: "h", createdAt: w.clock.now().toISOString() });
    await w.store.putHomeDevice({ householdId: "hh-kiran", deviceId: "devA_aaaaaaaaaaaaaaaaaaaa", pairedAt: w.clock.now().toISOString() });
    await w.store.putHomeDevice({ householdId: "hh-kiran", deviceId: "moved_bbbbbbbbbbbbbbbbbbb", pairedAt: w.clock.now().toISOString() });
    await w.store.putDevice({ id: "moved_bbbbbbbbbbbbbbbbbbb", householdId: "hh-priya", tokenHash: "h2", createdAt: w.clock.now().toISOString() });
    const r = await app(event("GET /me/home", { auth: profileAuth() }));
    const h = HomeResponse.parse(body(r));
    expect(h.members.map((m) => m.displayName)).toEqual(["Kiran"]);
    expect(h.tvs).toEqual([{ id: "devA_aaaaaaaaaaaaaaaaaaaa", label: "TV", pairedAt: w.clock.now().toISOString() }]);
  });

  it("DELETE /me/home/tvs/{id} forgets a TV: unlinks, revokes token, keeps DEVICE# (soft)", async () => {
    const id = "devA_aaaaaaaaaaaaaaaaaaaa";
    await w.store.putToken({ hash: "tok-h", kind: "device", subjectId: id, householdId: "hh-kiran" });
    await w.store.putDevice({ id, householdId: "hh-kiran", tokenHash: "tok-h", createdAt: w.clock.now().toISOString() });
    await w.store.putHomeDevice({ householdId: "hh-kiran", deviceId: id, pairedAt: w.clock.now().toISOString() });
    const r = await app(event("DELETE /me/home/tvs/{id}", { auth: profileAuth(), path: { id } }));
    expect(r.statusCode).toBe(200);
    expect(body(r)).toEqual({ ok: true });
    expect(await w.store.listHomeDevices("hh-kiran")).toEqual([]);
    expect(await w.store.getToken("tok-h")).toBeUndefined();
    const dev = await w.store.getDevice(id);
    expect(dev).toBeTruthy();
    expect(dev!.householdId).toBe("");
    expect((await app(event("DELETE /me/home/tvs/{id}", { auth: profileAuth(), path: { id } }))).statusCode).toBe(404);
  });
});

describe("seed keeps member/device rows and writes demo Sent (PT-4)", () => {
  it("re-seed doesn't drop the home's TV index; Priya has Sent", async () => {
    const store = new MemoryStore();
    const plan = buildSeed({}, new Date());
    await applySeed(store, plan);
    await store.putHomeDevice({ householdId: "hh-kiran", deviceId: "d1", pairedAt: new Date().toISOString() });
    await applySeed(store, buildSeed({}, new Date()));
    expect(await store.listHomeDevices("hh-kiran")).toHaveLength(1);
    const sent = await store.listSent("u-priya", 10);
    expect(sent).toHaveLength(5);
    expect(sent.every((s) => s.toNames.join() === "Kiran,Judge 1")).toBe(true);
    expect(await store.listSent("u-sam", 10)).toHaveLength(5);
  });
});
