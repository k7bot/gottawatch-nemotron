import { beforeEach, describe, expect, it } from "vitest";
import { TonightResponse } from "@gottawatch/contract";
import { firstJsonObject, MODELS, tokenFactoryChat, type ChatFn, type ChatRequest } from "../src/lib/tokenFactory.js";
import { makeNebiusPicker } from "../src/domain/nebiusPicker.js";
import { SYSTEM_PROMPT } from "../src/domain/bedrockPicker.js";
import { getTonight } from "../src/domain/tonight.js";
import { askFromEnv, pickerFromEnv } from "../src/lib/deps.js";
import { DAY_MS } from "../src/lib/time.js";
import { rec, world } from "./helpers.js";

const HH = "hh-kiran";

describe("Token Factory client", () => {
  it("sends an OpenAI-style request with reasoning off, JSON mode and the bearer key", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 5 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const chat = tokenFactoryChat({ apiKey: "test-key", fetchFn });
    const out = await chat({ model: MODELS.fast, messages: [{ role: "user", content: "hi" }], json: true, timeoutMs: 1000 });
    expect(out.content).toBe('{"a":1}');
    expect(out.toolCalls).toEqual([]);
    expect(seen!.url).toBe("https://api.tokenfactory.nebius.com/v1/chat/completions");
    expect((seen!.init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(seen!.init.body));
    expect(body).toMatchObject({ model: MODELS.fast, response_format: { type: "json_object" }, chat_template_kwargs: { enable_thinking: false } });
    expect(body.tools).toBeUndefined();
  });

  it("maps HTTP errors and network failures to TokenFactoryError without leaking the key", async () => {
    const bad = tokenFactoryChat({ apiKey: "secret-key-123", fetchFn: (async () => new Response("no", { status: 429 })) as unknown as typeof fetch });
    await expect(bad({ model: "m", messages: [], timeoutMs: 100 })).rejects.toThrow("Token Factory HTTP 429");
    const down = tokenFactoryChat({ apiKey: "secret-key-123", fetchFn: (async () => { throw new Error("secret-key-123 ECONNREFUSED"); }) as unknown as typeof fetch });
    const err = await down({ model: "m", messages: [], timeoutMs: 100 }).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain("secret-key-123");
  });

  it("firstJsonObject tolerates prose around the object and rejects junk", () => {
    expect(firstJsonObject('Sure! {"recId":"r1"} done')).toEqual({ recId: "r1" });
    expect(firstJsonObject("no json")).toBeUndefined();
    expect(firstJsonObject("[1,2]")).toBeUndefined();
  });
});

describe("tonight's pick: nebius mode (fake transport)", () => {
  let w: ReturnType<typeof world>;
  let calls: ChatRequest[];
  const reply = (content: string): ChatFn => async (req) => {
    calls.push(req);
    return { content, toolCalls: [], ms: 1 };
  };
  beforeEach(() => {
    calls = [];
  });
  function seed() {
    const t = w.clock.t.getTime();
    const k = rec(w.store, new Date(t - DAY_MS), { title: "Kestrel Bay", fromName: "Priya", runtime: 40, note: "40-min episodes" });
    const q = rec(w.store, new Date(t - 2 * 3600_000), { title: "The Quiet Orchard", fromName: "Maya", mediaType: "movie" });
    return { k, q };
  }

  it("valid model JSON → nebius pick, Nano by default, grounded prompt", async () => {
    w = world();
    const { q } = seed();
    w.deps.picker = makeNebiusPicker(reply(JSON.stringify({ recId: q.recId, reason: "Maya sent it today." })));
    const res = TonightResponse.parse(await getTonight(w.deps, HH));
    expect(res).toMatchObject({ recId: q.recId, source: "nebius", reason: "Maya sent it today." });
    expect(calls[0]!.model).toBe(MODELS.fast);
    expect(calls[0]!.json).toBe(true);
    expect(calls[0]!.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(await w.store.getPick(HH, "2026-10-11")).toMatchObject({ source: "nebius" });
  });

  it("invented recId → fallback; the attempt guard stops a second model call", async () => {
    w = world();
    seed();
    w.deps.picker = makeNebiusPicker(reply('{"recId":"made-up","reason":"x"}'));
    expect((await getTonight(w.deps, HH))?.source).toBe("fallback");
    expect((await getTonight(w.deps, HH))?.source).toBe("fallback");
    expect(calls).toHaveLength(1);
  });

  it("transport error → fallback", async () => {
    w = world();
    seed();
    w.deps.picker = makeNebiusPicker(async () => { throw new Error("timeout"); });
    expect((await getTonight(w.deps, HH))?.source).toBe("fallback");
  });
});

describe("env wiring", () => {
  it("PICK_MODE=nebius needs a key; ASK_MODE defaults on only with a key", () => {
    expect(() => pickerFromEnv({ PICK_MODE: "nebius" })).toThrow("NEBIUS_API_KEY");
    expect(pickerFromEnv({ PICK_MODE: "nebius", NEBIUS_API_KEY: "k" }).source).toBe("nebius");
    expect(askFromEnv({})).toEqual({});
    expect(askFromEnv({ NEBIUS_API_KEY: "k" })).toMatchObject({ agentModel: MODELS.agent, fastModel: MODELS.fast });
    expect(askFromEnv({ NEBIUS_API_KEY: "k", ASK_MODE: "off" })).toEqual({});
  });
});
