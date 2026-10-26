import { beforeEach, describe, expect, it } from "vitest";
import { AskResponse } from "@gottawatch/contract";
import { askGottawatch, groundAnswer, heuristicFilter, AGENT_TOOLS, type AskDeps } from "../src/domain/ask.js";
import { groupCandidates } from "../src/domain/tonight.js";
import { makeAskHandler, ASK_LIMIT } from "../src/handlers/routes.js";
import { demoCatalog } from "../src/catalog/index.js";
import type { ChatFn, ChatRequest, ChatResult } from "../src/lib/tokenFactory.js";
import { DAY_MS } from "../src/lib/time.js";
import { body, deviceAuth, event, profileAuth, rec, world } from "./helpers.js";

const HH = "hh-kiran";

/** Scripted transport: each call returns the next scripted result (or throws). */
function scripted(steps: (Partial<ChatResult> | Error | ((req: ChatRequest) => Partial<ChatResult>))[]) {
  const calls: ChatRequest[] = [];
  const chat: ChatFn = async (req) => {
    calls.push(structuredClone(req));
    const s = steps.shift();
    if (!s) throw new Error("no more scripted steps");
    if (s instanceof Error) throw s;
    const r = typeof s === "function" ? s(req) : s;
    return { content: null, toolCalls: [], ms: 3, ...r };
  };
  return { chat, calls };
}
const toolCall = (name: string, args: unknown = {}, id = `c-${name}`) => ({ id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } });

describe("Ask Gottawatch agent", () => {
  let w: ReturnType<typeof world>;
  let ids: { kestrel: string; orchard: string; static: string };
  beforeEach(() => {
    w = world();
    const t = w.clock.t.getTime();
    rec(w.store, new Date(t - 3 * DAY_MS), { title: "Kestrel Bay", fromName: "Sam", runtime: 40, genres: ["Drama"], note: "great finale" });
    const k = rec(w.store, new Date(t - DAY_MS), { title: "Kestrel Bay", fromName: "Priya", runtime: 40, genres: ["Drama"], note: "40-min episodes, start at ep 2" });
    const o = rec(w.store, new Date(t - 2 * 3600_000), { title: "The Quiet Orchard", fromName: "Maya", mediaType: "movie", runtime: 112, genres: ["Romance"], note: "made me cry in a good way" });
    const s = rec(w.store, new Date(t - 5 * 3600_000), { title: "Saltwater Static", fromName: "Sam", runtime: 25, genres: ["Comedy"], note: "dumb and delightful" });
    rec(w.store, new Date(t - 9 * DAY_MS), { title: "Old Watched Thing", fromName: "Priya", seen: true, seenAt: new Date(t - 8 * DAY_MS).toISOString() });
    ids = { kestrel: k.recId, orchard: o.recId, static: s.recId };
  });
  const deps = (chat?: ChatFn): AskDeps => ({ store: w.store, clock: w.clock.now, catalog: demoCatalog, ...(chat ? { chat } : {}) });

  it("tool round trip: calls get_friend_picks, returns grounded picks from the agent model", async () => {
    const { chat, calls } = scripted([
      { toolCalls: [toolCall("get_friend_picks", { maxRuntime: 45 })] },
      (req) => {
        const toolMsg = req.messages.at(-1) as { role: string; content: string };
        expect(toolMsg.role).toBe("tool");
        const titles = JSON.parse(toolMsg.content).titles.map((t: { title: string }) => t.title);
        expect(titles).toEqual(["Kestrel Bay", "Saltwater Static"]); // runtime filter applied, seen title absent
        return { content: JSON.stringify({ answer: "Two short ones.", picks: [
          { recId: ids.static, reason: "Sam called it dumb and delightful, and it's 25 minutes.", quotes: ["dumb and delightful"] },
          { recId: ids.kestrel, reason: "Two friends sent it.", quotes: ["start at ep 2"] },
        ] }) };
      },
    ]);
    const res = AskResponse.parse(await askGottawatch(deps(chat), HH, { query: "something short tonight", chips: [] }));
    expect(res.source).toBe("nemotron-agent");
    expect(res.picks.map((p) => p.title)).toEqual(["Saltwater Static", "Kestrel Bay"]);
    expect(res.picks[1]).toMatchObject({ quotes: ["start at ep 2"], from: ["Priya", "Sam"], runtime: 40 });
    expect(calls[0]!.tools).toEqual(AGENT_TOOLS);
    expect(calls[0]!.json).toBe(false);
    expect(calls[1]!.json).toBe(true);
    expect(res.trace.map((s) => s.kind)).toEqual(["model", "tool", "model", "check"]);
  });

  it("other tools: title details (overview from catalog), watch history, catalog search, bad recId", async () => {
    let results: unknown[] = [];
    const { chat } = scripted([
      { toolCalls: [toolCall("get_title_details", { recId: ids.orchard }, "a"), toolCall("get_watch_history", {}, "b"), toolCall("search_catalog", { query: "Kestrel" }, "c"), toolCall("get_title_details", { recId: "nope" }, "d")] },
      (req) => {
        results = req.messages.filter((m) => m.role === "tool").map((m) => JSON.parse((m as { content: string }).content));
        return { content: JSON.stringify({ answer: "The Quiet Orchard.", picks: [{ recId: ids.orchard, reason: "Maya loved it.", quotes: [] }] }) };
      },
    ]);
    const res = await askGottawatch(deps(chat), HH, { query: "a movie", chips: [] });
    expect(res.source).toBe("nemotron-agent");
    expect(results[0]).toMatchObject({ title: "The Quiet Orchard", friends: [{ name: "Maya", note: "made me cry in a good way" }] });
    expect(results[1]).toEqual({ watched: [{ title: "Old Watched Thing" }] });
    expect((results[2] as { note: string }).note).toMatch(/not friend picks/);
    expect(results[3]).toMatchObject({ error: expect.stringMatching(/unknown recId/) });
  });

  it("grounding: drops invented titles, paraphrased quotes, and reasons that fake a quote", () => {
    const cands = groupCandidates([...w.store.recs.values()].filter((r) => !r.seen).sort((a, b) => (a.recId < b.recId ? 1 : -1)));
    const g = groundAnswer({ answer: "Here you go.", picks: [
      { recId: "invented", reason: "A great show.", quotes: [] },
      { recId: ids.static, reason: "Sam said it was \"hilarious and smart\".", quotes: [] },
      { recId: ids.orchard, reason: "Maya was moved by it.", quotes: ["made me cry", "a real tearjerker"] },
      { recId: ids.kestrel, reason: "x".repeat(300), quotes: ["  Great FINALE "] },
    ] }, cands);
    expect(g.picks.map((p) => p.recId)).toEqual([ids.orchard, ids.kestrel]);
    expect(g.picks[0]!.quotes).toEqual(["made me cry"]);
    expect(g.picks[1]!.quotes).toEqual(["Great FINALE"]);
    expect(g.picks[1]!.reason.length).toBeLessThanOrEqual(220);
    expect(g.dropped.join("|")).toMatch(/unknown recId.*reason quotes text.*quote not in notes/);
  });

  it("hallucinated agent answer → Nano one-shot rerank (grounded) → nemotron-fast", async () => {
    const { chat, calls } = scripted([
      { toolCalls: [toolCall("get_friend_picks")] },
      { content: JSON.stringify({ answer: "Watch Breaking Bad!", picks: [{ recId: "bb", reason: "Classic.", quotes: [] }] }) },
      { content: JSON.stringify({ answer: "Try Saltwater Static.", picks: [{ recId: ids.static, reason: "Short and funny.", quotes: ["dumb and delightful"] }] }) },
    ]);
    const res = AskResponse.parse(await askGottawatch(deps(chat), HH, { query: "", chips: ["funny"] }));
    expect(res).toMatchObject({ source: "nemotron-fast", picks: [{ title: "Saltwater Static" }] });
    expect(calls[2]!.model).toBe("nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B");
    expect(calls[2]!.tools).toBeUndefined();
    expect(res.trace.some((s) => s.detail?.includes("unknown recId"))).toBe(true);
  });

  it("timeouts on both models → deterministic fallback using the chips", async () => {
    const { chat } = scripted([new Error("Token Factory request failed: TimeoutError"), new Error("Token Factory request failed: TimeoutError")]);
    const res = AskResponse.parse(await askGottawatch(deps(chat), HH, { query: "", chips: ["funny"] }));
    expect(res.source).toBe("fallback");
    expect(res.picks[0]).toMatchObject({ title: "Saltwater Static", reason: "Sam recommended it. About 25 minutes.", quotes: [] });
    expect(res.trace.map((s) => s.label)).toEqual(["agent failed", "fast model failed", "fallback"]);
  });

  it("agent that never stops calling tools hits the round cap, then falls back", async () => {
    const loop = Array.from({ length: 4 }, () => ({ toolCalls: [toolCall("get_watch_history")] }));
    const { chat, calls } = scripted([...loop, { content: "not json" }]);
    const res = await askGottawatch(deps(chat), HH, { query: "anything", chips: [] });
    expect(calls.slice(0, 4).map((c) => Boolean(c.tools))).toEqual([true, true, true, false]);
    expect(res.source).toBe("fallback");
  });

  it("no model configured → fallback; empty household → friendly empty answer", async () => {
    expect((await askGottawatch(deps(), HH, { query: "a movie", chips: [] })).picks[0]!.title).toBe("The Quiet Orchard");
    const empty = await askGottawatch(deps(), "hh-priya", { query: "x", chips: [] });
    expect(empty).toMatchObject({ picks: [], source: "fallback" });
  });

  it("heuristic filter: 'under 30 minutes' keeps short titles; impossible filters keep everything", () => {
    const cands = groupCandidates([...w.store.recs.values()].filter((r) => !r.seen));
    expect(heuristicFilter(cands, { query: "under 30 minutes", chips: [] }).map((c) => c.title)).toEqual(["Saltwater Static"]);
    expect(heuristicFilter(cands, { query: "under 10 minutes", chips: [] })).toHaveLength(3);
  });

  it("POST /ask: device and profile tokens both resolve the household; validates body; rate-limits", async () => {
    w.deps.chat = undefined;
    const h = makeAskHandler(() => w.deps);
    const tv = await h(event("POST /ask", { body: { chips: ["movie"] }, auth: deviceAuth() }));
    expect(tv.statusCode).toBe(200);
    expect(AskResponse.parse(body(tv)).picks[0]!.title).toBe("The Quiet Orchard");
    const phone = await h(event("POST /ask", { body: { query: "something funny" }, auth: profileAuth() }));
    expect(AskResponse.parse(body(phone)).picks[0]!.title).toBe("Saltwater Static");
    expect((await h(event("POST /ask", { body: {}, auth: deviceAuth() }))).statusCode).toBe(400);
    expect((await h(event("POST /ask", { body: { query: "x".repeat(301) }, auth: deviceAuth() }))).statusCode).toBe(400);
    expect((await h(event("POST /ask", { body: { query: "x" } }))).statusCode).toBe(401);
    let last: number | undefined = 200;
    for (let i = 0; i <= ASK_LIMIT.max; i++) last = (await h(event("POST /ask", { body: { query: "x" }, auth: deviceAuth("tv2", "hh-sam") }))).statusCode;
    expect(last).toBe(429);
  });
});

describe("Ask Gottawatch agent: recovery and attribution", () => {
  it("agent that answers without reading friend picks is nudged once, then grounds", async () => {
    const w = world();
    const s = rec(w.store, w.clock.now(), { title: "Saltwater Static", fromName: "Sam", runtime: 25, note: "dumb and delightful" });
    rec(w.store, w.clock.now(), { title: "Kestrel Bay", fromName: "Priya" });
    const { chat, calls } = scripted([
      { toolCalls: [toolCall("get_watch_history")] },
      { content: '{"answer":"Nothing yet.","picks":[]}' },
      { toolCalls: [toolCall("get_friend_picks")] },
      { content: JSON.stringify({ answer: "Saltwater Static.", picks: [{ recId: s.recId, reason: "Sam loved it.", quotes: [] }] }) },
    ]);
    const res = await askGottawatch({ store: w.store, clock: w.clock.now, chat }, HH, { query: "anything", chips: [] });
    expect(res.source).toBe("nemotron-agent");
    expect(res.trace.some((t) => t.label === "nudge")).toBe(true);
    expect(calls[2]!.json).toBe(false);
    expect(calls[3]!.json).toBe(true);
  });

  it("drops a reason that puts words in the mouth of a friend who left no note", () => {
    const w = world();
    const k = rec(w.store, w.clock.now(), { title: "Kestrel Bay", fromName: "Priya" });
    const cands = groupCandidates([k]);
    expect(groundAnswer({ picks: [{ recId: k.recId, reason: "Priya says it's perfect for family night.", quotes: [] }] }, cands).picks).toEqual([]);
    expect(groundAnswer({ picks: [{ recId: k.recId, reason: "Priya recommended it.", quotes: [] }] }, cands).picks).toHaveLength(1);
  });
});
