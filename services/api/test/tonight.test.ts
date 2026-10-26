import { beforeEach, describe, expect, it, vi } from "vitest";
import { TonightResponse } from "@gottawatch/contract";
import { makeAppHandler, makeTonightHandler } from "../src/handlers/routes.js";
import { getTonight, type Picker } from "../src/domain/tonight.js";
import { makeBedrockPicker, parseModelJson, SYSTEM_PROMPT, type ConverseFn } from "../src/domain/bedrockPicker.js";
import { DAY_MS } from "../src/lib/time.js";
import { body, deviceAuth, event, rec, world } from "./helpers.js";

const HH = "hh-kiran";

function seedTwoTitles(w: ReturnType<typeof world>) {
  const t = w.clock.t.getTime();
  const k1 = rec(w.store, new Date(t - 3 * DAY_MS), { title: "Kestrel Bay", fromName: "Sam", runtime: 40, note: "great finale" });
  const k2 = rec(w.store, new Date(t - DAY_MS), { title: "Kestrel Bay", fromName: "Priya", runtime: 40, note: "40-min episodes, start at ep 2" });
  const q = rec(w.store, new Date(t - 2 * 3600_000), { title: "The Quiet Orchard", fromName: "Maya", mediaType: "movie" });
  return { k1, k2, q };
}

describe("tonight's pick: stub mode", () => {
  let w: ReturnType<typeof world>;
  beforeEach(() => (w = world()));

  it("picks the title with most senders, cites only senders + runtime, caches it", async () => {
    const { k2 } = seedTwoTitles(w);
    const res = TonightResponse.parse(await getTonight(w.deps, HH));
    expect(res).toEqual({
      recId: k2.recId,
      title: "Kestrel Bay",
      reason: "Priya and Sam both recommended it. It runs about 40 minutes.",
      source: "stub",
    });
    expect(await w.store.getPick(HH, "2026-10-11")).toMatchObject({ recId: k2.recId, source: "stub" });
    // cached: a new, more popular title doesn't change tonight's pick
    for (const n of ["Sam", "Priya", "Maya"]) rec(w.store, w.clock.now(), { title: "Saltwater Static", fromName: n });
    expect((await getTonight(w.deps, HH))?.recId).toBe(k2.recId);
  });

  it("falls back when fewer than 2 candidate titles", async () => {
    rec(w.store, w.clock.now(), { title: "Kestrel Bay", fromName: "Priya" });
    rec(w.store, w.clock.now(), { title: "Kestrel Bay", fromName: "Sam" });
    const res = await getTonight(w.deps, HH);
    expect(res).toMatchObject({ title: "Kestrel Bay", source: "fallback", reason: "Recommended by 2 friends this week." });
    expect(await w.store.getPick(HH, "2026-10-11")).toBeUndefined();
  });

  it("cached pick rec Seen (store-level, single rec) → fallback, no new pick", async () => {
    const { k1, k2, q } = seedTwoTitles(w);
    await getTonight(w.deps, HH);
    await w.store.markSeen(HH, k2.recId, w.clock.now().toISOString());
    const spy = vi.spyOn(w.deps.picker, "pick");
    const res = await getTonight(w.deps, HH);
    expect(spy).not.toHaveBeenCalled();
    // Remaining: Sam's older Kestrel Bay rec (1 sender) and Maya's Quiet Orchard (1 sender) → tie → most recent
    expect(res).toMatchObject({ source: "fallback", recId: q.recId, reason: "Recommended by Maya this week." });
    await w.store.markSeen(HH, q.recId, w.clock.now().toISOString());
    expect(await getTonight(w.deps, HH)).toMatchObject({ source: "fallback", recId: k1.recId, reason: "Recommended by Sam this week." });
  });

  it("after Seen on the pick (title sent by 2 friends), the title doesn't come back as fallback (MF-5)", async () => {
    const { k2, q } = seedTwoTitles(w);
    const app = makeAppHandler(() => w.deps);
    expect((await getTonight(w.deps, HH))?.recId).toBe(k2.recId);
    await app(event("POST /recommendations/{id}/seen", { auth: deviceAuth(), path: { id: k2.recId } }));
    expect(await getTonight(w.deps, HH)).toMatchObject({ source: "fallback", recId: q.recId, title: "The Quiet Orchard" });
  });

  it("fallback tie-break is most recent; ignores recs older than 7 days", async () => {
    const t = w.clock.t.getTime();
    rec(w.store, new Date(t - 8 * DAY_MS), { title: "Old", fromName: "Sam" });
    rec(w.store, new Date(t - 8 * DAY_MS), { title: "Old", fromName: "Priya" });
    const newer = rec(w.store, new Date(t - DAY_MS), { title: "Newer", fromName: "Maya" });
    // 2 candidates in 14 days → picker runs; force failure to reach fallback
    const failing: Picker = { source: "stub", pick: async () => undefined };
    const res = await getTonight({ ...w.deps, picker: failing }, HH);
    expect(res).toMatchObject({ source: "fallback", recId: newer.recId });
  });

  it("204 when nothing to show; uses household-local date for the cache key", async () => {
    const h = makeTonightHandler(() => w.deps);
    expect((await h(event("GET /tonight", { auth: deviceAuth() }))).statusCode).toBe(204);
    seedTwoTitles(w);
    w.clock.t = new Date("2026-10-12T02:30:00Z"); // still Sunday evening in New York
    const r = await h(event("GET /tonight", { auth: deviceAuth() }));
    expect(r.statusCode).toBe(200);
    expect(TonightResponse.parse(body(r)).source).toBe("stub");
    expect(await w.store.getPick(HH, "2026-10-11")).toBeDefined();
  });

  it("ignores recs older than 14 days as candidates", async () => {
    const t = w.clock.t.getTime();
    rec(w.store, new Date(t - 15 * DAY_MS), { title: "Ancient", fromName: "Sam" });
    rec(w.store, new Date(t - DAY_MS), { title: "Fresh", fromName: "Priya" });
    expect(await getTonight(w.deps, HH)).toMatchObject({ title: "Fresh", source: "fallback" });
  });
});

describe("tonight's pick: bedrock mode (fake Converse)", () => {
  const MODEL = "test-model";
  let w: ReturnType<typeof world>;
  beforeEach(() => (w = world()));

  const withConverse = (fn: ConverseFn) => ({ ...w.deps, picker: makeBedrockPicker(fn, MODEL, 50) });

  it("valid model JSON → bedrock pick with grounded payload and system prompt", async () => {
    const { q } = seedTwoTitles(w);
    const converse = vi.fn<ConverseFn>(async () => `Sure! {"recId":"${q.recId}","reason":"Maya sent it today."}`);
    const res = await getTonight(withConverse(converse), HH);
    expect(res).toMatchObject({ recId: q.recId, reason: "Maya sent it today.", source: "bedrock" });
    const req = converse.mock.calls[0]![0];
    expect(req.modelId).toBe(MODEL);
    expect(req.system[0]!.text).toBe(SYSTEM_PROMPT);
    const payload = JSON.parse(req.messages[0]!.content[0]!.text);
    expect(payload.weekday).toBe("Sunday");
    expect(payload.candidates).toHaveLength(2);
    const kestrel = payload.candidates.find((c: { title: string }) => c.title === "Kestrel Bay");
    expect(kestrel.runtimeMinutes).toBe(40);
    expect(kestrel.senders).toEqual([
      { name: "Priya", note: "40-min episodes, start at ep 2" },
      { name: "Sam", note: "great finale" },
    ]);
  });

  it.each([
    ["unknown recId", `{"recId":"nope","reason":"x"}`],
    ["reason too long", null],
    ["not JSON", "I think Kestrel Bay"],
    ["empty reason", null],
  ])("invalid output (%s) → fallback", async (label, text) => {
    const { q } = seedTwoTitles(w);
    const out =
      text ??
      (label === "reason too long"
        ? JSON.stringify({ recId: q.recId, reason: "x".repeat(221) })
        : JSON.stringify({ recId: q.recId, reason: "   " }));
    const res = await getTonight(withConverse(async () => out), HH);
    expect(res?.source).toBe("fallback");
    expect(await w.store.getPick(HH, "2026-10-11")).toBeUndefined();
  });

  it("timeout or error → fallback, and only one model attempt per 15 minutes", async () => {
    seedTwoTitles(w);
    const converse = vi.fn<ConverseFn>(
      ({ signal }) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const deps = withConverse(converse);
    expect((await getTonight(deps, HH))?.source).toBe("fallback");
    expect((await getTonight(deps, HH))?.source).toBe("fallback");
    expect(converse).toHaveBeenCalledTimes(1);
    w.clock.advance(15 * 60 * 1000 + 1);
    await getTonight(deps, HH);
    expect(converse).toHaveBeenCalledTimes(2);
  });

  it("parseModelJson", () => {
    expect(parseModelJson('```json\n{"recId":"a","reason":"b"}\n```')).toEqual({ recId: "a", reason: "b" });
    expect(parseModelJson('{"recId":1,"reason":"b"}')).toBeUndefined();
    expect(parseModelJson(undefined)).toBeUndefined();
  });
});
