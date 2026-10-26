// Small Token Factory model check: JSON reliability, tool calling and latency on Gottawatch-shaped tasks.
// NEBIUS_API_KEY=... node tools/model-eval/eval.mjs [runs]   (never prints the key)
const KEY = process.env.NEBIUS_API_KEY; if (!KEY) throw new Error("NEBIUS_API_KEY is not set");
const BASE = process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1";
const RUNS = Number(process.argv[2] ?? 3);
const RF = process.env.RF === "1" ? { response_format: { type: "json_object" } } : {};
const MODES = (process.env.MODES ?? "off,on").split(",").map((m) => m === "on");
const MODELS = (process.env.MODELS ?? "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B,nvidia/Nemotron-3_5-Lightning,nvidia/nemotron-3-super-120b-a12b,nvidia/Nemotron-3.5-Super-VL").split(",");
const CANDS = [
  { recId: "r1", title: "Lantern Bay", mediaType: "tv", runtimeMin: 28, genres: ["Comedy"], senders: [{ name: "Priya", note: "the diner episode made me cry laughing" }] },
  { recId: "r2", title: "The Quiet Orbit", mediaType: "movie", runtimeMin: 132, genres: ["Drama", "Sci-Fi"], senders: [{ name: "Sam", note: "slow but the ending is huge" }] },
  { recId: "r3", title: "Paper Kites", mediaType: "movie", runtimeMin: 94, genres: ["Comedy", "Romance"], senders: [{ name: "Maya", note: "perfect date night pick" }, { name: "Sam", note: "so charming" }] },
];
const notes = CANDS.flatMap((c) => c.senders.map((s) => s.note));
async function chat(model, body, thinking) {
  const t = Date.now();
  const r = await fetch(BASE + "/chat/completions", { method: "POST", headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: thinking ? 900 : 400, ...(thinking ? {} : { chat_template_kwargs: { enable_thinking: false } }), ...body }) });
  const j = await r.json().catch(() => ({}));
  return { ms: Date.now() - t, status: r.status, msg: j.choices?.[0]?.message, finish: j.choices?.[0]?.finish_reason, usage: j.usage, err: j.error ?? j.detail };
}
const firstJson = (s) => { const m = /\{[\s\S]*\}/.exec(s ?? ""); try { return m ? JSON.parse(m[0]) : undefined; } catch { return undefined; } };
async function pickTask(model, thinking) {
  const r = await chat(model, { messages: [
    { role: "system", content: 'You help a household choose ONE title to watch tonight. Choose only from the candidates. Explain why in 1-2 sentences using only the senders\' notes, runtime and genre given. Do not invent facts. Reply as JSON: {"recId": "...", "reason": "..."}' },
    { role: "user", content: JSON.stringify({ weekday: "Monday", candidates: CANDS }) }], ...RF }, thinking);
  const j = firstJson(r.msg?.content);
  const ok = !!j && CANDS.some((c) => c.recId === j.recId) && typeof j.reason === "string" && j.reason.length > 0 && j.reason.length <= 240;
  return { ok, ms: r.ms, out: r.usage?.completion_tokens, why: ok ? "" : (r.err ? JSON.stringify(r.err).slice(0, 80) : (r.msg?.content ?? "").slice(0, 80)) };
}
const TOOLS = [{ type: "function", function: { name: "get_friend_picks", description: "Unwatched titles friends recommended to this household, with each sender's note.",
  parameters: { type: "object", properties: { maxRuntimeMin: { type: "integer" }, genres: { type: "array", items: { type: "string" } } }, additionalProperties: false } } }];
async function toolTask(model, thinking) {
  const sys = { role: "system", content: 'You are Ask Gottawatch. Use tools to see what friends recommended. Pick 1-2 titles only from tool results. Final answer as JSON: {"answer": "...", "picks": [{"recId": "...", "reason": "...", "quotes": ["exact words from a sender note"]}]}' };
  const user = { role: "user", content: "Something light and under an hour for tonight?" };
  const a = await chat(model, { messages: [sys, user], tools: TOOLS, tool_choice: "auto" }, thinking);
  const call = a.msg?.tool_calls?.[0];
  let args; try { args = call ? JSON.parse(call.function.arguments || "{}") : undefined; } catch { args = undefined; }
  if (!call || call.function.name !== "get_friend_picks" || !args) return { ok: false, ms: a.ms, out: a.usage?.completion_tokens, why: "no valid tool call: " + (a.err ? JSON.stringify(a.err).slice(0, 80) : (a.msg?.content ?? "").slice(0, 60)) };
  const res = CANDS.filter((c) => !args.maxRuntimeMin || c.runtimeMin <= args.maxRuntimeMin);
  const b = await chat(model, { messages: [sys, user, { role: "assistant", content: a.msg.content ?? "", tool_calls: [call] }, { role: "tool", tool_call_id: call.id, content: JSON.stringify(res.length ? res : CANDS) }], tools: TOOLS, ...RF }, thinking);
  const j = firstJson(b.msg?.content);
  const picks = Array.isArray(j?.picks) ? j.picks : [];
  const validIds = picks.length > 0 && picks.every((p) => CANDS.some((c) => c.recId === p.recId));
  const grounded = picks.every((p) => (p.quotes ?? []).every((q) => notes.some((n) => n.toLowerCase().includes(String(q).toLowerCase()))));
  return { ok: validIds && grounded, ms: a.ms + b.ms, out: (a.usage?.completion_tokens ?? 0) + (b.usage?.completion_tokens ?? 0), why: !j ? "final not JSON: " + (b.err ? JSON.stringify(b.err).slice(0, 80) : String(b.msg?.content ?? "").slice(0, 80)) : !validIds ? "bad recIds" : !grounded ? "ungrounded quote" : "", args: JSON.stringify(args) };
}
const rows = [];
for (const model of MODELS) for (const thinking of MODES) {
  const res = { pick: [], tool: [] };
  await Promise.all(Array.from({ length: RUNS }, async () => { res.pick.push(await pickTask(model, thinking)); res.tool.push(await toolTask(model, thinking)); }));
  const s = (xs) => ({ ok: xs.filter((x) => x.ok).length + "/" + xs.length, p50ms: xs.map((x) => x.ms).sort((a, b) => a - b)[Math.floor(xs.length / 2)], avgOutTok: Math.round(xs.reduce((a, x) => a + (x.out ?? 0), 0) / xs.length), fails: [...new Set(xs.filter((x) => !x.ok).map((x) => x.why))].join(" | ") });
  const row = { model: model.replace("nvidia/", ""), thinking, pick: s(res.pick), tool: s(res.tool) };
  rows.push(row); console.log(JSON.stringify(row));
}
