# ADR-0003: Tonight's pick via Amazon Bedrock, cached nightly, with fallback

- **Status:** Accepted (Kiran chose "Option A", plan v2 Appendix B; spec in plan §5 "Tonight's pick")

## Context
The rules list "basic streaming UI" as an *obvious* Fire TV idea and "AI-enhanced viewing that adapts to household patterns" as *creative*; Quality of the Idea is 1/4 of the score. The rules also call "a single Bedrock call for text generation" *obvious* for AWS Builder (plan changelog #6, #7).

## Decision
One card at the top of the TV feed. `GET /tonight` → return cached `PICK#<date in household TZ>` if present; else gather unseen recs from the last 14 days; if < 2 → fallback; else one Bedrock Converse call with a grounded prompt (choose only from candidates; reason only from senders' notes/runtime/genre; JSON `{recId, reason}`), validate `recId` ∈ candidates and reason ≤ 220 chars, 4 s timeout, no retries. Any failure → **"Most recommended this week"** (most distinct senders in 7 days; tie → most recent). Cache successes ~24 h. If the cached pick gets marked Seen → fallback for the rest of the evening. Dev uses `PICK_MODE=stub|bedrock`. Model: small, fast text model, chosen Oct 14.

## Alternatives
- Option B (no AI in core; Alexa voice as stretch): rejected by Kiran.
- Chat-style AI / whole-feed ranking: explicitly OUT (plan §4).

## Consequences
- The TV card must render both `bedrock` and `fallback` sources and never block the feed.
- Pitch the pipeline (candidates, grounding, validation, cache, fallback), not just the model call.
- Cost: one call per household per evening.
