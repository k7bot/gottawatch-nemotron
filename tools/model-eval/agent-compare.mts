// Head-to-head on the real Ask Gottawatch agent loop (services/api/src/domain/ask.ts): same prompts,
// tools, rounds, time budget and server-side grounding validator as production; only the model ID changes.
// Runs against Nebius Token Factory directly with the seeded demo data in memory (no live app, no judge data).
//   NEBIUS_API_KEY=... npx tsx tools/model-eval/agent-compare.mts [runs] > results.jsonl
// MODELS=a,b to choose models. Never prints the key.
import { askGottawatch, FAST_SYSTEM_PROMPT, type AskInput } from "../../services/api/src/domain/ask.js";
import { tokenFactoryChat, firstJsonObject, type ChatFn } from "../../services/api/src/lib/tokenFactory.js";
import { MemoryStore } from "../../services/api/src/lib/store.js";
import { applySeed, buildSeed } from "../../services/api/src/seed/seed.js";
import { demoCatalog } from "../../services/api/src/catalog/index.js";

const KEY = process.env.NEBIUS_API_KEY;
if (!KEY) throw new Error("NEBIUS_API_KEY is not set");
const RUNS = Number(process.argv[2] ?? 3);
const MODELS = (process.env.MODELS ?? "nvidia/nemotron-3-super-120b-a12b,nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B").split(",");
const HH = "hh-judge-1";

type Q = { id: string; input: AskInput; expect: "ok" | "no_match" | "off_topic"; short?: boolean; from?: string };
const QUESTIONS: Q[] = [
  { id: "short-funny", input: { query: "something short and funny for a weeknight", chips: [] }, expect: "ok", short: true },
  { id: "cozy", input: { query: "something cozy to wind down", chips: [] }, expect: "ok" },
  { id: "maya", input: { query: "what did Maya send me?", chips: [] }, expect: "ok", from: "Maya" },
  { id: "korean-horror", input: { query: "a Korean horror movie from the 1980s", chips: [] }, expect: "no_match" },
  { id: "capital", input: { query: "What's the capital of France?", chips: [] }, expect: "off_topic" },
  { id: "together-chip", input: { query: "", chips: ["together"] }, expect: "ok" },
];

const store = new MemoryStore(() => new Date());
await applySeed(store, buildSeed({ judges: 1 }, new Date()));
const base = tokenFactoryChat({ apiKey: KEY });

for (const model of MODELS) {
  for (const q of QUESTIONS) {
    for (let run = 1; run <= RUNS; run++) {
      const calls: Record<string, unknown>[] = [];
      const chat: ChatFn = async (req) => {
        const phase = req.messages[0]?.role === "system" && req.messages[0].content === FAST_SYSTEM_PROMPT ? "fast" : "agent";
        try {
          const out = await base(req);
          calls.push({
            phase, ms: out.ms, json: req.json ?? false, tools: !!req.tools?.length,
            toolNames: out.toolCalls.map((t) => t.function.name),
            badArgs: out.toolCalls.filter((t) => { try { JSON.parse(t.function.arguments || "{}"); return false; } catch { return true; } }).length,
            parsed: out.toolCalls.length ? null : firstJsonObject(out.content) !== undefined,
            inTok: out.usage?.prompt_tokens ?? 0, outTok: out.usage?.completion_tokens ?? 0,
          });
          return out;
        } catch (e) {
          calls.push({ phase, error: (e as Error).message.slice(0, 120) });
          throw e;
        }
      };
      const t0 = Date.now();
      const res = await askGottawatch({ store, clock: () => new Date(), catalog: demoCatalog, chat, agentModel: model, fastModel: model }, HH, q.input);
      const ms = Date.now() - t0;
      const labels = res.trace.map((s) => s.label);
      const drops = res.trace.filter((s) => s.label === "grounding" && s.detail?.startsWith("dropped")).map((s) => s.detail);
      console.log(JSON.stringify({
        model, q: q.id, run, ms, expect: q.expect, status: res.status, source: res.source,
        picks: res.picks.map((p) => ({ title: p.title, runtime: p.runtime, from: p.from, quotes: p.quotes.length })),
        fromOk: q.from ? res.picks.length > 0 && res.picks.every((p) => p.from.includes(q.from!)) : undefined,
        shortViolated: q.short ? labels.includes("length") : undefined,
        autoFriendPicks: labels.includes("friend picks"), nudged: labels.includes("nudge"), offTopicRejected: labels.includes("off topic rejected"),
        drops, calls,
      }));
    }
  }
}
