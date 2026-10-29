# Ask Gottawatch: Nemotron vs other open models on Nebius Token Factory

**Date:** Oct 28, 2026, about 9:00 PM EDT. **Sample:** 6 asks x 3 runs = 18 asks per model (108 in total).
**Spend:** about $0.06 at Token Factory list prices.

## Method

- **The real agent loop.** `tools/model-eval/agent-compare.mts` imports `askGottawatch` from
  `services/api/src/domain/ask.ts` unchanged. It uses the same system prompt and 4 tools, the same
  4-round, 12-second budget and 8-second call timeout, JSON mode after the first round, temperature 0.2, and
  `enable_thinking: false`. The same server-side validator (grounding, status and length rules) checks every answer.
  Only the model ID changes. It is set as both the agent model and the one-shot fallback model.
- **Demo data, in memory.** The production seed (13 unwatched friend picks from Priya, Sam and Maya, plus watch
  history) is loaded into a memory store for a judge household. The script calls Token Factory directly; the live
  app and its data were not used.
- **Questions** (expected status in brackets):
  - "something short and funny for a weeknight" [ok, every pick 45 min or less]
  - "something cozy to wind down" [ok]
  - "what did Maya send me?" [ok, only Maya's picks]
  - "a Korean horror movie from the 1980s" [no_match]
  - "What's the capital of France?" [off_topic]
  - the "Together" chip [ok]
- **Success** means the agent's own answer (not the fallback):
  - has the expected status;
  - for ok, has at least one pick that survives the validator (picks are real recIds; quotes appear word for word in
    the friend's note);
  - for the Maya question, has only Maya's titles;
  - for the "short" question, ends with only picks of 45 minutes or less.
- **Latency** is the wall time of the whole ask, measured from the box (us-east). Each model ran in its own
  process, and the six ran at the same time.
- **Cost** uses Token Factory list prices from `GET /v1/models?verbose=true` and the token usage the API reported.

Model IDs: `nvidia/nemotron-3-super-120b-a12b`, `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`,
`Qwen/Qwen3-235B-A22B-Instruct-2507`, `Qwen/Qwen3-30B-A3B-Instruct-2507`, `openai/gpt-oss-120b`,
`deepseek-ai/DeepSeek-V4-Flash-0731`.

## Results

| Model | Success | Called get_friend_picks itself | Invalid tool calls | Valid JSON, first answer | Answers the validator corrected | Model kept "short" short | p50 / p90 latency | Tokens in / out (18 asks) | Cost (18 asks) |
|---|---|---|---|---|---|---|---|---|---|
| **Nemotron 3 Super 120B-A12B** | **17/18** | 15/15 | 0/21 | 18/18 | 1 (a pick with no recId) | 3/3 | 2.5 s / 5.2 s | 51.7k / 4.2k | $0.019 |
| **Nemotron 3 Nano 30B-A3B** | **16/18** | 12/15 (3 added by the server) | 0/15 | 18/18 | 1 (quote not in notes) | 2/3 | 3.4 s / 4.4 s | 42.2k / 3.0k | $0.003 |
| Qwen3 235B-A22B Instruct 2507 | 18/18 | 15/15 | 0/21 | 18/18 | 0 | 0/3 (server dropped the long picks) | 1.8 s / 2.9 s | 42.1k / 2.8k | $0.010 |
| Qwen3 30B-A3B Instruct 2507 | 15/18 | 15/15 | 0/15 | 18/18 | 4 (answer named a title it didn't return) | 0/3 (a 103-min movie for "short") | 1.4 s / 2.1 s | 39.3k / 3.0k | $0.005 |
| gpt-oss-120b | 15/18 | 15/15 | 0/15 | 18/18 | 5 (1 invented quote, 3 non-JSON after a nudge, 1 pick with no recId) | 3/3 | 2.2 s / 4.4 s | 38.7k / 12.2k | $0.013 |
| DeepSeek V4 Flash 0731 | 17/18 | 15/15 | 0/30 | 18/18 | 3 (1 garbled recId, 2 answers naming a title they didn't return) | 3/3 | 4.0 s / 5.2 s | 47.9k / 4.2k | $0.008 |

In the table:
- **Called get_friend_picks itself** counts the 15 watch questions (the off-topic one needs no tools).
- **Invalid tool calls** means bad JSON arguments or an unknown tool, out of all tool calls the model made.
- **Answers the validator corrected** counts the drops the validator logged (invented or mismatched quotes, titles
  or IDs). The user never sees those.

Where each model missed:
- **Super:** one "cozy" run answered no_match, an honest but wrong "nothing fits".
- **Nano:**
  - On the Maya question, one run answered no_match and one picked Priya's and Sam's titles.
  - Its first tool round skipped get_friend_picks 3 times, and the server added the call.
- **Qwen3 235B:** no misses. On the "short" question it offered a long title next to short ones every time, and the
  length rule removed it.
- **Qwen3 30B:** answered "short and funny" with The Marigold Line (103 min) in all 3 runs.
- **gpt-oss-120b:** called "what did Maya send me?" off topic in all 3 runs. In 1 of them, the nudge and the
  fallback still produced a valid answer, but not by the agent's own answer.
- **DeepSeek V4 Flash:** in one Maya run it named a title it didn't return, and the validator removed its answer.

## Takeaways

- **Accuracy.** In this sample, Qwen3 235B had the best accuracy (18/18), the lowest latency of the large models
  and no answers the validator had to correct. Nemotron 3 Super (17/18) and DeepSeek V4 Flash (17/18) came next.
  With 18 asks per model, a one-ask difference is within noise.
- **Following the "short" constraint.** Super followed it on its own, 3/3. Qwen3 235B relied on the server rule
  every time, and Qwen3 30B gave a 103-minute movie.
- **Cost.** Nano was the cheapest by far, about $0.0002 per ask against $0.0006 for Qwen3 235B and $0.0011 for
  Super. That's why Nano runs Tonight's pick and the fallback.
- **Validator.** Every model sometimes produced something the validator had to remove. No ungrounded pick or
  invented quote reached the output for any model.

## Caveats

- Small sample: 3 runs of 6 questions, on one day, with a single 13-title demo catalog. These are not general
  benchmark claims.
- The agent prompt and its rules were tuned on Nemotron Super during the build, which may favor it. Other models
  might improve with prompt changes. None were made, by design.
- The six models ran in parallel from one box, so latency includes network and shared-endpoint load at that time.
- `enable_thinking: false` is a Nemotron and Qwen chat-template switch. gpt-oss still produced reasoning tokens,
  hence its higher output count. No model rejected the tools, JSON mode or this parameter.
- Production still runs Super as the agent and Nano for Tonight's pick and the fallback. This eval did not change
  production.

Raw per-ask results: `model-comparison-raw.jsonl`. Summary script: `tools/model-eval/analyze-agent-compare.py`.
