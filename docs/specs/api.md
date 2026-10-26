# Build spec: backend API (`services/api`, `packages/contract`, `infra`)

Status: **Draft v1.1, 2026-10-11** (review must-fixes MF-1..MF-7 applied, see [reviews/api-spec-review.md](../decisions/reviews/api-spec-review.md)). Derived from [plan v2](../plan/MVP_PLAN_v2.md) §3 (flows A–E), §4, §5 and Appendix A, and from [ADR-0002](../decisions/ADR-0002-no-cognito-seeded-accounts-pairing-code.md), [ADR-0003](../decisions/ADR-0003-tonights-pick-bedrock-cache-fallback.md), [ADR-0005](../decisions/ADR-0005-best-effort-handoff-search-tip.md), [ADR-0007](../decisions/ADR-0007-tv-client-mock-api-mode.md) (guardrail 2: shared validated contract) and [ADR-0008](../decisions/ADR-0008-serverless-aws-backend.md). TV-side view: [specs/tv-app.md §4](tv-app.md#4-api-contract-used-by-the-tv). Tasks: [tasks/api-tasks.md](../tasks/api-tasks.md).
Markers: **(proposed)** = fills a gap the plan left open; **OPEN** = in [open-questions.md](../open-questions.md).

## 1. Scope
**In:** pairing (start / complete / status), device + profile bearer tokens and a Lambda authorizer, `/me`, `/friends`, `/feed`, `/recommendations` (create), Seen, `/tonight` (stub + Bedrock + cache + fallback), `/titles/search` (demo catalog first, TMDB proxy later), seed script, CDK stack.
**Out (plan §4 OUT):** Cognito, sign-up/invites, push notifications, feed ranking, watch history.
**Not in this stack (yet):** S3 + CloudFront for the PWA/demo art (separate task once the PWA exists), AWS Budgets (already created by CLI, see [ops/aws-account.md](../ops/aws-account.md)).

## 2. Repo layout (proposed)
```
package.json            npm workspaces: packages/*, services/*, infra   (apps/tv keeps its own Yarn workspace)
packages/contract/      @gottawatch/contract: zod schemas + inferred TS types for every request/response; no runtime deps but zod
services/api/           Lambda handlers (TypeScript, Node.js 22), domain logic, data store (DynamoDB + in-memory for tests), seed data
infra/                  AWS CDK v2 app (TypeScript): one stack `WatchCircleApi`
```
The TV app consumes `packages/contract` (TV-05) via a relative workspace/file dependency (**proposed**; exact wiring decided in TV-05, Yarn 4 supports `portal:`/`link:` protocols).

## 3. Architecture
API Gateway **HTTP API** → **Lambda authorizer** (simple responses, identity source `Authorization` header, result cache **60 s**, proposed) → one Lambda per route group → **DynamoDB** single table (on-demand) · **Bedrock** Converse (only when `PICK_MODE=bedrock`) · **SSM Parameter Store** (TMDB key, read at cold start, only when `CATALOG_MODE=tmdb`) · **CloudWatch Logs** (retention 14 days, proposed).
Region **us-east-1**. Lambda: Node.js 22.x, arm64, 256 MB, 10 s timeout (proposed). Stage throttling: **5 req/s, burst 10** for the whole API, and **1 req/s, burst 5 on `POST /pair/start`** (the only unauthenticated write). Real need is ~0.25 req/s (5 TVs polling every 20 s); the low limits cap the abuse cost at about $25/month ([ops/cost-estimate.md](../ops/cost-estimate.md), review MF-2). Reserved Lambda concurrency is **not** used: this account's Lambda concurrency limit is 10 (checked 2026-10-11 with `aws lambda get-account-settings`), which also caps parallel invocations. Table and log groups use `RemovalPolicy.RETAIN`.

## 4. Environment / config
| Var | Values | Default | Notes |
|---|---|---|---|
| `TABLE_NAME` | string | set by CDK | |
| `PICK_MODE` | `stub` \| `bedrock` | **`stub`** | Bedrock is blocked on the account (OQ-14). `bedrock` grants `bedrock:InvokeModel` only when set. |
| `BEDROCK_MODEL_ID` | inference profile id | none (required when `bedrock`) | Model choice OPEN (OQ-14: Nova vs Haiku; plan says choose Oct 14). |
| `CATALOG_MODE` | `demo` \| `tmdb` | `tmdb` (Oct 14) | Set by the deploy workflow from the GitHub repo variable `CATALOG_MODE` (unset → `tmdb`). Set it to `demo` and redeploy before recording the demo video (hackathon rules). |
| `TMDB_KEY_PARAM` | SSM parameter name | `/watchcircle/tmdb/api-key` | SecureString, created by Kiran/agent outside CDK so the value never enters the template. |
| `POSTER_BASE_URL` | URL | empty | Demo art base URL (CloudFront later). |

## 5. Data model (DynamoDB single table, plan §5)
Keys `PK`, `SK` (strings); TTL attribute `ttl` (epoch seconds). No GSI needed (proposed: token lookup via its own item).
| Entity | PK | SK | Attributes |
|---|---|---|---|
| Household | `HH#<id>` | `META` | name, timezone (IANA, e.g. `America/New_York`) |
| User (seeded) | `USER#<id>` | `PROFILE` | displayName, avatarUrl?, householdId |
| Friendship | `USER#<id>` | `FRIEND#<otherId>` | mutual rows |
| Device | `DEVICE#<deviceId>` | `META` | householdId, tokenHash, createdAt |
| Token (proposed) | `TOKEN#<sha256 hex>` | `META` | kind `device`\|`profile`, subjectId (deviceId or userId), householdId |
| PairingCode | `CODE#<code>` | `META` | deviceId, status `pending`\|`approved`, householdId?, approvedBy?, expiresAt, ttl |
| Recommendation | `HH#<recipientHH>` | `REC#<recId>` | recId (time-sortable, so SK order = plan's `REC#timestamp#id`), fromUserId, fromName, title fields (§6 `TitleRef`), note?, service?, createdAt, seen, seenAt? |
| Home member (ADR-0013) | `HH#<id>` | `MEMBER#<userId>` | displayName (written with every user put) |
| Home device (ADR-0013) | `HH#<id>` | `DEVICE#<deviceId>` | pairedAt (written on pairing; backfilled once by `scripts/backfill-devices.ts`) |
| Sent (ADR-0013) | `USER#<senderId>` | `SENT#<recId>` | title fields, note?, service, toNames[], createdAt |
| Title cache | `TITLE#<mediaType>-<id>` | `META` | TMDB details incl. US flatrate watch providers; fresh for 7 days, item TTL 30 weeks. Stored poster size `w342`; lists use `w185`. |
| Tonight's pick | `HH#<id>` | `PICK#<YYYY-MM-DD>` | recId, reason, source, createdAt, ttl (~36 h, proposed, so it outlives the evening) |
| Pick attempt (proposed) | `HH#<id>` | `PICKTRY#<YYYY-MM-DD>` | ttl 15 min; set before a Bedrock call so repeated `/tonight` calls after a failure don't re-call Bedrock |

## 6. API contract (implemented in `packages/contract`)
Auth: `Authorization: Bearer <token>`. Device tokens (`wcd_…`) are issued by pairing; profile tokens (`wcp_…`) are seeded and live in the phone link `/u/<token>` (prefixes proposed). Only SHA-256 hashes are stored. Errors: `{ error: { code, message } }` with 400 `bad_request`, 401 `unauthorized`, 403 `forbidden`, 404 `not_found`, 409 `conflict`, 410 `expired`, 500 `internal` (proposed, matches tv-app.md §4).

**Auth failures come from API Gateway, not the handlers (review MF-3):** missing `Authorization` header → **401** `{"message":"Unauthorized"}`; unknown, revoked or malformed token → **403** `{"message":"Forbidden"}` (deny cached 60 s per token). Clients must treat **401 and 403 on protected routes as "token not accepted → re-pair"** and must not assume gateway errors carry `ErrorBody`. A wrong-*kind* token (profile on a device route) gets a handler 403 with `ErrorBody`. When the authorizer can't reach DynamoDB it **throws**, so the client sees **500** (retry; keep the token), never a cached deny (MF-1). Throttled requests get **429** from the gateway. **204** responses have an empty body and no `content-type`.

| Route | Auth | Request | 200 response |
|---|---|---|---|
| `POST /pair/start` | none | `{ deviceId }` (22–64 chars `[A-Za-z0-9_-]`: TV generates it once with a CSPRNG, ≥ 128 bits, e.g. 16 random bytes base64url; proposed) | `{ code, expiresAt }` |
| `GET /pair/status?code=&deviceId=` | none | | `{ status: "pending" }` or `{ status: "paired", deviceToken }` (token delivered once) |
| `POST /pair/complete` | profile | `{ code }` | `{ ok: true, householdId }` |
| `GET /me` | any | | device: `{ kind:"device", device:{id}, householdId, householdName? }`; profile: `{ kind:"profile", user:{id,displayName,avatarUrl?}, householdId }` |
| `GET /friends` | profile | | `{ friends: [{ id, displayName, avatarUrl?, householdId }] }` |
| `GET /titles/search?q=` | profile | | `{ results: TitleRef[] }` |
| `POST /recommendations` | profile | `{ titleRef: {source:"demo",id}|{source:"tmdb",id,mediaType}|{source:"custom",title,year?} (free text, Oct 12: server sanitizes: NFC, strips control/format chars and `<>`, collapses spaces, 1–100 chars kept, raw ≤ 300; year 1880..now+3; id = slug(title)-year so the same typed title groups/Seens as one), note? (≤120 chars, proposed), service? , recipientHouseholdIds: string[] (1+) }` | `{ ids: string[] }` |
| `GET /feed` | device | `?limit=` (default 50, max 100, proposed) | `{ items: FeedItem[] }` newest first, Seen excluded |
| `POST /recommendations/{id}/seen` | device | | `{ ok: true }` |
| `DELETE /recommendations/{id}/seen` | device | | `{ ok: true }`: undo; un-sees every rec of that title in the household (added Oct 12) |
| `GET /seen?limit=20` | device | | `{ items: SeenItem[] }`: Watched history, one per title, newest `seenAt` first, max 50 (added Oct 12) |
| `GET /tonight` | device | | `{ recId, title, poster?, reason, source:"nebius"|"bedrock"|"stub"|"fallback" }` (`stub` proposed: TV renders it like `bedrock`); **204** when no candidates (proposed, OQ-11) |
| `POST /ask` | device or profile | `{ query?: string ≤300, chips?: ("short"|"funny"|"light"|"intense"|"together"|"movie"|"show")[] }` (one of them required) | `{ answer, picks: [{ recId, title, reason, quotes[], from[], poster?, runtime? }] ≤3, source:"nemotron-agent"|"nemotron-fast"|"fallback", model?, trace[] }`; **429** `rate_limited` after 20 asks per household per 10 min |
| `GET /me/feed` | profile | `?limit=` | `{ items: FeedItem[] }`: same as `/feed` for the caller's home (ADR-0013) |
| `GET /me/seen` | profile | `?limit=` | `{ items: SeenItem[] }` |
| `POST /me/seen/{id}` · `DELETE /me/seen/{id}` | profile | | `{ ok: true }`: same rules as the device routes |
| `GET /me/sent` | profile | `?limit=` (default 30, max 50) | `{ items: SentItem[] }` newest first; `SentItem = { id, title, year?, mediaType?, poster?, note?, service, to: string[] (names), createdAt }` |
| `GET /me/home` | profile | | `{ home: { id, name }, members: Person[], tvs: [{ id, label, pairedAt }] }` (`id` is the opaque device id, only for this home's own TVs, so the phone can forget one) |
| `DELETE /me/home/tvs/{id}` | profile | | `{ ok: true }`. **Forget this TV** (soft): drops `HH#…/DEVICE#…`, revokes the TV's device token, clears `householdId`/`tokenHash` on `DEVICE#META` but keeps the record, so the same stick can pair again. 404 if the TV isn't linked to the caller's home. |

| `GET /auth/config` | none | | `{ email: boolean }` (false while `EMAIL_MODE=off`) |
| `POST /auth/email/start` | none | `{ email }` | always `{ ok: true }` after ≥ 900 ms; mails a 6-digit code only to a confirmed address (ES-1/2). 1 req/s, burst 5 |
| `POST /auth/email/verify` | none | `{ email, code }` | `{ profileToken }` (new token, 90-day expiry) or 400. 1 req/s, burst 5 |
| `POST /me/email` · `POST /me/email/verify` | profile | `{ email }` · `{ email, code }` | `{ ok: true }` · `{ ok: true, email }`; 409 when the address can't be used |

Rows: `EMAIL#<sha256>/META` → userId (unique), `OTP#<sha256>/<signin|verify>` (codeHash, attempts, sends, windowStart, expiresAt, ttl). Tokens may carry `expiresAt` (authorizer denies after it).

Profile-only routes resolve the home from the **user record** (`USER#/PROFILE.householdId`), not the token context, and 401 if the user is gone (review PT-2).
`FeedItem` = tv-app.md §4 (`id, from{id,displayName,avatarUrl?}, title, year?, mediaType?, poster?, note?, service, runtime?, genres?, createdAt`). `TitleRef` = `{ source, id, mediaType, title, year?, poster?, runtime?, genres?, overview? }`.

## 7. Behavior
### 7.1 Pairing (flow A, ADR-0002)
- **start:** generate a 6-char code from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L, proposed) with `crypto.randomInt`; conditional put (retry on collision ≤ 5); TTL 10 min.
- **complete:** profile token → user → household. Code must exist, be `pending`, not expired (check `expiresAt`, since DynamoDB TTL deletion is lazy). Set `approved` + householdId.
- **status:** requires matching `deviceId` (OQ-10, proposed yes). `pending` → `{status:"pending"}`. `approved` → generate 32 random bytes → token `wcd_<base64url>`, write Token item, write/overwrite Device item, delete the old Token item if the device had one (re-pair revokes), delete the code, return token. The plaintext token is never stored. Expired/unknown code → 410/404.
### 7.2 Authorizer
Hash bearer token → GetItem `TOKEN#<hash>` → allow with context `{ kind, subjectId, householdId }`; deny only for a missing/malformed/unknown/wrong-kind token; **rethrow on store errors** (→ 500, not a cached deny; MF-1). Cached 60 s by API Gateway, so a revoked token can work for up to 60 s (documented as demo-grade).
### 7.3 Recommendations + feed (flows C, D)
- create: recipients must be households of the sender's friends (or the sender's own household, proposed). Title resolved server-side from the demo catalog (or TMDB) so clients can't inject metadata. One item per recipient household.
- feed: Query `PK=HH#<hh>`, `begins_with(SK,"REC#")`, newest first, filter `seen=false`, limit.
- seen: device's household only; idempotent; sets `seen=true, seenAt` on the rec **and on every other unseen rec of the same title (`titleSource:titleId`) in that household** (Seen is per title, review MF-5). One Query + N updates, N ≤ number of friends. Whether the feed shows one card per title or one per friend is **OPEN (OQ-19)**; today the feed returns one item per rec.
### 7.4 Tonight's pick (ADR-0003, plan §5)
1. `date` = today in household timezone. If `PICK#date` exists and its rec is unseen → return it. If its rec is now Seen → **fallback**, no new Bedrock call (plan step 8).
2. Candidates = unseen recs from the last 14 days, grouped by title (a title sent by several friends is one candidate with all senders + notes; proposed).
3. < 2 candidates → fallback. `PICK_MODE=stub` → deterministic stub picker (candidate with most senders, then newest; reason built only from sender names + runtime, e.g. "Priya and Sam both recommended it."). `PICK_MODE=bedrock` → if `PICKTRY#date` exists → fallback; else write it, call Converse (timeout 4 s, no retries, maxTokens ~200), parse JSON `{recId, reason}`, validate recId ∈ candidates and 1 ≤ reason length ≤ 220, else fallback.
4. Success (stub or bedrock) → cache `PICK#date`. Fallback is computed each call (cheap) and not cached.
5. **Fallback "Most recommended this week":** unseen recs from the last 7 days grouped by title; most distinct senders; tie → most recent. Reason (proposed): "Recommended by N friends this week" / "Recommended by <name> this week". No candidates at all → 204.
### 7.5 Seed data (ADR-0002, plan §7)
**PROVISIONAL default (OQ-18 proposal, implemented but not confirmed by Kiran; the live table is not seeded until he confirms):** one demo household (Kiran's, `America/New_York`) and friends Priya, Sam, Maya (plan) each in their own household. Each friend is friends with Kiran only, not with each other. Judge households (`--judges N`, default 1, OQ-20) each have a judge user who is friends with Priya, Sam and Maya. Profile tokens are generated by the seed script and written only to the git-ignored links file (only hashes stored). Each viewer household (Kiran's and every judge's) gets the same 4 demo recs: *Kestrel Bay* from Priya (3 h ago, note "40-min episodes, start at ep 2" from plan §7) and from Sam (26 h), *The Quiet Orchard* from Maya (50 h), *Saltwater Static* from Sam (96 h). Implementation: `services/api/src/seed/seed.ts`; CLI `services/api/scripts/seed.ts` (dry run by default; writes only with `--apply --personas-confirmed`). Demo catalog titles from plan §7: *Kestrel Bay*, *The Quiet Orchard*, *Saltwater Static* (TMDB multi-search 0 matches on 2026-10-15; plan §7 Oct 21 check). Only *Kestrel Bay*'s "40-minute episodes" is grounded in the plan; other metadata is demo filler and labeled as such in the data file.

**Seed requirements (review MF-6; implemented in API-12):**
1. **Re-runnable and relative to now:** every run (re)writes demo recs with `createdAt` = now minus a few hours/days (all inside the 7-day fallback window and the 14-day candidate window) and resets their Seen flags. Otherwise the 14/7-day windows make seeded data expire and `/tonight` returns 204 for judges (plan judging window Nov 9-20, possibly from Oct 26).
2. **`recId` is derived from the rec's `createdAt`** (`newRecId(createdAt)`), because candidates are range-queried by `recId` while the fallback filters by `createdAt`.
3. **Judge testing account (OQ-20 resolved Oct 15):** one shared judge household (*Judge's home*), not N per-judge links. Seeded by `services/api/scripts/seed-judge.ts` with real TMDB titles; fixed email/code for invite-only access. Shared-account caveat: Seen by one judge affects others until reseed. (The older demo `seed.ts --judges N` path still exists for demo-catalog personas; live judging uses `seed-judge.ts`.)
4. **Refresh step:** reseed the judge account the day before Judging Period opens (before Nov 9) and again if the feed looks empty during Nov 9–20; optional health-check dates (Oct 26, Nov 9). A scheduled re-seed (EventBridge → Lambda) remains proposed, not built.
5. **Secrets hygiene:** profile tokens are generated by the script and written **only** to a git-ignored local file (e.g. `infra/.seed-output/links.txt`), never printed to CI logs, chat, commits or email; only hashes go to DynamoDB. Re-running rotates tokens unless `--keep-tokens` is passed (proposed).
6. The plan §10 checklist includes the refresh step and the Bedrock honesty rule (MF-7).

## 8. Security (demo-grade, stated in README)
Hashed revocable tokens, no plaintext token storage, **no tokens in logs** (handlers and the authorizer never log the event, headers or token, only error name/message; API Gateway access logs, if enabled later, must exclude the `Authorization` header and any `/u/<token>` path), stage throttling, input validation with the shared zod schemas on every handler, least-privilege IAM per function (table read/write; Bedrock only when enabled; SSM read only for the search function). CORS: allow the PWA origin (OPEN, OQ-12) — `*` without credentials until the domain is known (proposed).

## 9. Testing
- Unit tests (vitest) for contract schemas, code/token generation, every handler against an in-memory store, pick logic (stub, fallback, cache, Seen-after-pick, timezone date, Bedrock validation failures with a fake Bedrock client).
- `cdk synth` + a CDK assertions test (table, routes, authorizer, no Bedrock permission in stub mode).
- Live smoke test: `services/api/scripts/smoke.ts` (seeds a throwaway household straight into DynamoDB, calls every route, deletes everything; tokens stay in memory). Run with `API_URL`, `TABLE_NAME`, `AWS_PROFILE=watchcircle`, `AWS_REGION=us-east-1`. A 503 (Lambda concurrency limit 10) is possible under bursts; clients treat it like 429.
- Browser e2e: `tv-web-e2e.ts` (browser TV `/tv/` + phone PWA), `judge-e2e.ts` (judge login path). **Todo:** `web-e2e.ts` is stale (profile-link sign-in); update for email sign-in + invites.

## 10. Acceptance (backend part of Gate 1)
TV can `pair/start` → phone `pair/complete` → TV `pair/status` gets a token → `GET /feed` returns seeded recs → `POST /recommendations` from a friend profile appears in the TV feed → `GET /tonight` returns a stub pick or fallback, never an error.


## Forget this TV (Oct 14)

Wording is gentle on purpose: no "disconnect", "delete" or "remove".
- Me → Your home lists each TV as **TV** / **TV 1, TV 2** with "Connected {time}" and a quiet **Forget this TV** link.
- Confirm (inline, not a modal): "**Stop showing picks on {TV}? You can connect it again anytime.**" Buttons: **Keep it** / **Forget** (neutral, not red).
- After forgetting, the TV's token stops working; the TV app falls back to its pairing screen on its next call. **Connect another TV** stays for adding.

## TMDB + where to watch (Oct 14)
- `services/api/src/catalog/tmdb.ts`: search + details (`append_to_response=watch/providers`), key read from SSM server-side only; clients never call TMDB.
- **Where-to-watch prefill:** when TMDB lists exactly one known US streaming service, it is pre-selected in the recommend sheet (user can change it). Several → those move to the front and the user picks. None → user picks as before.
- **Attribution:** TMDB notice (+ logo) and "Where-to-watch data from JustWatch" on the About screens (TV, phone, web). Non-commercial use only.
- **Demo mode:** `CATALOG_MODE=demo` serves the made-up catalog (no posters, no real services) for the video.

## Ask Gottawatch + Nemotron on Nebius (Oct 26)

- `PICK_MODE=nebius` runs Tonight's pick on Nemotron 3 Nano via Nebius Token Factory (`NEBIUS_API_KEY`, optional `NEBIUS_BASE_URL`, `NEBIUS_PICK_MODEL`). Same prompt, validation, cache and one-attempt guard as before.
- `POST /ask` (`src/domain/ask.ts`) is a tool-calling agent on Nemotron 3 Super 120B (`NEBIUS_AGENT_MODEL`). Tools: `get_friend_picks` (filters: maxRuntime, mediaType, genre), `get_title_details`, `get_watch_history`, `search_catalog`. All tools read only the caller's household and the catalog.
- Limits: 4 model rounds, 12 s total, 8 s per call, reasoning off, JSON mode after the first round. If the agent answers without reading friend picks, it is sent back once.
- Grounding check on every model answer: picks must be unseen candidates; quotes must appear verbatim in that title's notes; a reason may not quote unseen text or attribute words to a friend who left no note; reason ≤ 220 chars.
- Chain: agent → one-shot Nano rerank → deterministic fallback (keyword filter + popularity). `ASK_MODE=off` (or no key) uses only the fallback. The answer always says which step produced it (`source`) and includes a `trace` for the demo.
- Model choice and measurements: `tools/model-eval/RESULTS.md`. Local end-to-end check: `tools/e2e/local-ask.mjs`.
