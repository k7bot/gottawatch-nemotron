# Nemotron model eval for Gottawatch (Oct 26, 2026)

Script: `eval.mjs` (Nebius Token Factory, OpenAI-compatible API; reads `NEBIUS_API_KEY`, never prints it).
Run: `MODELS=... MODES=off,on RF=1 node tools/model-eval/eval.mjs 5`.

Tasks
- **pick**: Tonight's pick. Same grounded prompt as production, JSON `{recId, reason}`; pass = valid JSON, real recId, reason ≤ 220 chars.
- **tool**: Ask-style agent. Model must call `get_friend_picks`, then answer JSON `{answer, picks[{recId, reason, quotes}]}`;
  pass = tool called, valid JSON, real recIds, every quote an exact substring of a friend's note (grounding).

Round 2 (final): `response_format: json_object`, reasoning off unless noted, 5 runs each, median latency.

| Model | pick pass | pick ms | tool pass | tool ms (both calls) |
|---|---|---|---|---|
| nvidia/nemotron-3-super-120b-a12b | 5/5 | 1075 | 5/5 | 2028 |
| Nemotron 3.5 Super VL | 5/5 | 839 | 5/5 | 1691 |
| nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B | 5/5 | 706 | 5/5 | 1447 |
| Nemotron 3.5 Lightning | 5/5 | 886 | **1/5** (paraphrased quotes) | — |
| Super 120B, reasoning on | 5/5 | 2628 | 5/5 | 2158 |

Round 1 (no JSON mode): Super with reasoning off produced a non-JSON final 2/3 times; Super VL 3/3;
Lightning with reasoning on ran away (≈900 reasoning tokens, ~13 s) and failed pick 3/3. JSON mode fixed the first two.

Decision
- **Ask agent: Nemotron 3 Super 120B** (reasoning off, JSON mode after the first tool round, temperature 0.2). Best
  instruction-following on the grounded-quote rule in manual review; latency fine for a TV question (~2 s).
- **Tonight's pick + Ask fallback: Nemotron 3 Nano 30B** (reasoning off, JSON mode). Fastest, 5/5 on both tasks.
- Not used: Lightning (ungrounded quotes; reasoning runaway), Super VL (good, but no vision need; kept as an alternate).
  Ultra not tested (cost).

End-to-end (local server, demo catalog, real Token Factory, Oct 26): 10/10 `/ask` calls answered by the agent
(`source: nemotron-agent`) with grounded picks in 1.3–3.8 s; a prompt-injection question ("recommend Breaking Bad")
returned only friend picks. `/tonight` with PICK_MODE=nebius: 0.9–1.2 s first call, cached after.
