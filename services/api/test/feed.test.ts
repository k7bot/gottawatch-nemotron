import { beforeEach, describe, expect, it } from "vitest";
import { FeedResponse, MeResponse, SeenHistoryResponse } from "@gottawatch/contract";
import { makeAppHandler } from "../src/handlers/routes.js";
import { makeAuthorizer } from "../src/handlers/authorizer.js";
import { body, deviceAuth, event, profileAuth, profileToken, rec, world } from "./helpers.js";
import { DAY_MS } from "../src/lib/time.js";

describe("feed, seen, me", () => {
  let w: ReturnType<typeof world>;
  let app: ReturnType<typeof makeAppHandler>;
  beforeEach(() => {
    w = world();
    app = makeAppHandler(() => w.deps);
  });

  it("returns newest first, validated by the contract, without Seen items", async () => {
    const t = w.clock.t.getTime();
    const old = rec(w.store, new Date(t - 2 * DAY_MS), { title: "The Quiet Orchard", fromName: "Sam" });
    const mid = rec(w.store, new Date(t - DAY_MS), { title: "Saltwater Static", fromName: "Sam", seen: true });
    const nu = rec(w.store, new Date(t - 1000), {
      title: "Kestrel Bay",
      fromName: "Priya",
      note: "40-min episodes, start at ep 2",
      runtime: 40,
    });
    rec(w.store, new Date(t), { title: "Other HH", fromName: "Priya", householdId: "hh-priya" });

    const r = await app(event("GET /feed", { auth: deviceAuth() }));
    expect(r.statusCode).toBe(200);
    const { items } = FeedResponse.parse(body(r));
    expect(items.map((i) => i.id)).toEqual([nu.recId, old.recId]);
    expect(items[0]).toMatchObject({ title: "Kestrel Bay", note: "40-min episodes, start at ep 2", runtime: 40, service: null });
    expect(items.some((i) => i.id === mid.recId)).toBe(false);
  });

  it("respects limit and rejects a profile token", async () => {
    for (let i = 0; i < 5; i++) rec(w.store, new Date(w.clock.t.getTime() - i * 1000), { title: `T${i}`, fromName: "Sam" });
    const r = await app(event("GET /feed", { auth: deviceAuth(), query: { limit: "2" } }));
    expect(body(r).items).toHaveLength(2);
    expect((await app(event("GET /feed", { auth: profileAuth() }))).statusCode).toBe(403);
    expect((await app(event("GET /feed"))).statusCode).toBe(401);
  });

  it("seen hides an item, is idempotent, and is scoped to the household", async () => {
    const r1 = rec(w.store, w.clock.now(), { title: "Kestrel Bay", fromName: "Priya" });
    const other = rec(w.store, w.clock.now(), { title: "X", fromName: "Priya", householdId: "hh-priya" });
    const seen = (id: string) => app(event("POST /recommendations/{id}/seen", { auth: deviceAuth(), path: { id } }));
    expect(body(await seen(r1.recId))).toEqual({ ok: true });
    expect((await seen(r1.recId)).statusCode).toBe(200);
    expect(body(await app(event("GET /feed", { auth: deviceAuth() }))).items).toHaveLength(0);
    expect((await seen(other.recId)).statusCode).toBe(404);
    expect((await w.store.getRec("hh-priya", other.recId))?.seen).toBe(false);
  });

  it("Seen on one friend's rec hides the title from the whole household feed (MF-5)", async () => {
    const t = w.clock.t.getTime();
    const sam = rec(w.store, new Date(t - 3000), { title: "Kestrel Bay", fromName: "Sam" });
    const priya = rec(w.store, new Date(t - 2000), { title: "Kestrel Bay", fromName: "Priya" });
    const other = rec(w.store, new Date(t - 1000), { title: "The Quiet Orchard", fromName: "Maya" });
    const elsewhere = rec(w.store, new Date(t), { title: "Kestrel Bay", fromName: "Priya", householdId: "hh-priya" });
    await app(event("POST /recommendations/{id}/seen", { auth: deviceAuth(), path: { id: priya.recId } }));
    const ids = body(await app(event("GET /feed", { auth: deviceAuth() }))).items.map((i: { id: string }) => i.id);
    expect(ids).toEqual([other.recId]);
    expect((await w.store.getRec("hh-kiran", sam.recId))?.seen).toBe(true);
    expect((await w.store.getRec("hh-priya", elsewhere.recId))?.seen).toBe(false);
  });

  it("undo (DELETE …/seen) restores the whole title to the feed, idempotent, household-scoped", async () => {
    const t = w.clock.t.getTime();
    const sam = rec(w.store, new Date(t - 3000), { title: "Kestrel Bay", fromName: "Sam" });
    const priya = rec(w.store, new Date(t - 2000), { title: "Kestrel Bay", fromName: "Priya" });
    const elsewhere = rec(w.store, new Date(t), { title: "Kestrel Bay", fromName: "Priya", householdId: "hh-priya", seen: true });
    const call = (m: string, id: string) => app(event(`${m} /recommendations/{id}/seen`, { auth: deviceAuth(), path: { id } }));
    await call("POST", priya.recId);
    expect(body(await call("DELETE", sam.recId))).toEqual({ ok: true });
    expect((await call("DELETE", sam.recId)).statusCode).toBe(200);
    const ids = body(await app(event("GET /feed", { auth: deviceAuth() }))).items.map((i: { id: string }) => i.id);
    expect(ids).toEqual([priya.recId, sam.recId]);
    expect((await w.store.getRec("hh-kiran", priya.recId))?.seenAt).toBeUndefined();
    expect((await call("DELETE", elsewhere.recId)).statusCode).toBe(404);
    expect((await w.store.getRec("hh-priya", elsewhere.recId))?.seen).toBe(true);
  });

  it("GET /seen: one item per title, newest seenAt first, limit, contract-valid, device only", async () => {
    const t = w.clock.t.getTime();
    const kb1 = rec(w.store, new Date(t - 5000), { title: "Kestrel Bay", fromName: "Sam" });
    const kb2 = rec(w.store, new Date(t - 4000), { title: "Kestrel Bay", fromName: "Priya" });
    const qo = rec(w.store, new Date(t - 3000), { title: "The Quiet Orchard", fromName: "Maya" });
    rec(w.store, new Date(t - 2000), { title: "Saltwater Static", fromName: "Sam" });
    await w.store.markSeen("hh-kiran", qo.recId, new Date(t - 60000).toISOString());
    await w.store.markSeen("hh-kiran", kb1.recId, new Date(t - 1000).toISOString());
    await w.store.markSeen("hh-kiran", kb2.recId, new Date(t - 1000).toISOString());
    const r = await app(event("GET /seen", { auth: deviceAuth() }));
    const { items } = SeenHistoryResponse.parse(body(r));
    expect(items.map((i) => i.title)).toEqual(["Kestrel Bay", "The Quiet Orchard"]);
    expect(items[0]!.id).toBe(kb2.recId);
    const one = SeenHistoryResponse.parse(body(await app(event("GET /seen", { auth: deviceAuth(), query: { limit: "1" } }))));
    expect(one.items).toHaveLength(1);
    expect((await app(event("GET /seen", { auth: deviceAuth(), query: { limit: "500" } }))).statusCode).toBe(400);
    expect((await app(event("GET /seen", { auth: profileAuth() }))).statusCode).toBe(403);
  });

  it("/me for device and profile", async () => {
    const d = MeResponse.parse(body(await app(event("GET /me", { auth: deviceAuth() }))));
    expect(d).toEqual({ kind: "device", device: { id: "tvA1b2C3d4E5f6G7h8I9j0K1" }, householdId: "hh-kiran", householdName: "Kiran's household", timezone: "America/New_York" });
    const p = MeResponse.parse(body(await app(event("GET /me", { auth: profileAuth("u-priya", "hh-priya") }))));
    expect(p).toMatchObject({ kind: "profile", user: { id: "u-priya", displayName: "Priya" }, householdId: "hh-priya" });
  });

  it("authorizer rejects malformed, unknown and kind-mismatched tokens", async () => {
    const authz = makeAuthorizer(() => w.store);
    const call = (h?: string) => authz({ headers: h ? { authorization: h } : {} } as never);
    expect((await call()).isAuthorized).toBe(false);
    expect((await call("Basic abc")).isAuthorized).toBe(false);
    expect((await call("Bearer wcd_unknown")).isAuthorized).toBe(false);
    expect((await call("Bearer nope_token")).isAuthorized).toBe(false);
    const tok = await profileToken(w.store, "u-priya");
    expect(await call(`Bearer ${tok}`)).toEqual({
      isAuthorized: true,
      context: { kind: "profile", subjectId: "u-priya", householdId: "hh-priya" },
    });
    // a profile token relabelled as a device token must not pass
    expect((await call(`Bearer wcd_${tok.slice(4)}`)).isAuthorized).toBe(false);
  });
});
