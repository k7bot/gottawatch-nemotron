# Feedback on Nebius Token Factory and NVIDIA Nemotron

From building Ask Gottawatch over four days (Oct 26 to 30, 2026).

## What worked well

- **OpenAI-compatible API.** A plain `fetch` to `/v1/chat/completions` with `tools` and `response_format` was all we
  needed. No SDK, no adapter layer, and our test transport could fake it exactly.
- **Function calling on Nemotron 3 Super 120B** was reliable: in our eval it called the tool and returned grounded
  JSON 5 of 5 times, about 2 s for both calls. Over 10 questions against a local server it answered every one with
  grounded picks in 1.3 to 3.8 s; on the live Cloud Run app most answers take 2 to 4 s, fast enough for a TV.
- **Nemotron 3 Nano 30B** was the fastest model we tried (706 ms median on the pick task) and passed both tasks 5 of 5,
  which made it a good fast path and fallback.
- **Price.** About 3K input and 500 output tokens per Ask on Super is roughly a tenth of a cent, so the hackathon credits
  cover thousands of questions.

## Friction we hit

- **Credits were confusing.** There are two $25 Token Factory credits (the Devpost form promo code and the Builder
  Program), onboarding asks for a card and gives a $1 trial credit, and it was not obvious at first that the hackathon
  credits cover Token Factory only and not AI Cloud. One page that says "here is what is free for this hackathon, and
  where each credit applies" would have saved time.
- **Without JSON mode, Super often ended in prose.** In our first round, Super with reasoning off produced a non-JSON
  final answer 2 of 3 times. `response_format: json_object` fixed it, but we had to turn it on only after the first tool
  round. A note in the function-calling docs about combining tools with JSON mode would help.
- **The agent sometimes skipped the key tool.** Super occasionally read only watch history and answered with no picks.
  We added one nudge ("read the friend picks first"), which fixed it in live runs.
- **Relevance status needs a server-side check too.** After reading only the watch history, Super once called
  "something short and funny for a weeknight" off topic. We now add the friend-picks call to its first tool round and
  never accept off topic for a question with watch words in it.
- **Quote grounding needs a server-side check.** Nano sometimes wrote that a friend "says" something when that friend
  left no note. Nemotron 3.5 Lightning paraphrased quotes (1 of 5 on the grounded task) and, with reasoning on, ran to
  about 900 reasoning tokens and 13 s. We drop any pick whose quotes are not exact substrings of a friend's note.
- **Model IDs are inconsistent in case** (`nvidia/nemotron-3-super-120b-a12b` vs `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`),
  which is easy to get wrong in config.
- **No NVIDIA embedding model in the catalog.** We did not need one (the candidate list fits in context), but a Nemotron
  embedding option would make retrieval-style agents easier to build on one provider.
- **AI Cloud quota.** Our new tenant had 0 non-GPU vCPU quota in us-central1 (200 in us-north1), so a CPU endpoint there
  would have been refused. We hosted the container elsewhere; only the model calls run on Token Factory.

## Suggestions

1. A hackathon credits page that lists every credit, what it covers and when it lands.
2. A function-calling example that ends in strict JSON, with the tools + JSON mode pattern.
3. Per-model notes on reasoning mode defaults and typical token use, so runaway reasoning is easy to avoid.
