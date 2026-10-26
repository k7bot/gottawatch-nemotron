# Independent review: backend API design and implementation

- **Reviewer:** fresh, skeptical independent reviewer (not the author). Did not deploy and did not change any code.
- **Date:** 2026-10-11 (Sun), reviewed at commit `b85ddb4`.
- **Scope:** `docs/specs/api.md`, `docs/tasks/api-tasks.md`, `docs/ops/cost-estimate.md`, `packages/contract`, `services/api`, `infra`. Checked against `docs/plan/MVP_PLAN_v2.md`, ADR-0002/0003/0005/0007/0008 and `docs/specs/tv-app.md`.
- **Context:** Amazon Build Ship Shape, Fire TV track. Deadline Fri Oct 23 2026, 12:00pm PT. Judge access must last through Nov 20. The TV is Fire OS first and Vega-ready. Bedrock is blocked at the account level, so `PICK_MODE=stub` is the default.

## Verdict: **APPROVE WITH CHANGES**

The design is sound and the right size. Its strengths:
- Tokens are hashed and revocable.
- Pairing is single-use and tied to the requesting `deviceId`.
- Every handler validates input against one shared zod contract.
- Tonight's pick is grounded and validated, and it has a fallback.
- IAM is least-privilege: no Bedrock grant in stub mode, and the authorizer can only read.
- The stack is small and fully serverless.

Nothing here is dangerous to deploy as a **dev stack in stub mode**, but fix MF-1 and MF-2 first; both are one-liners. The other must-fix items are contract and product bugs that show up as soon as the TV goes live (MF-3, MF-4) or in the demo and judging (MF-5, MF-6, MF-7). Most are small.

## What I verified (commands run, all on the box)
| Check | Result |
|---|---|
| `npm test` (root, all workspaces) | **PASS**: contract 8/8, api 31/31, infra 6/6 (45 tests) |
| `npm run typecheck` | **PASS** |
| `cdk synth --quiet` (infra) | **PASS**: 4 bundles, stub mode, no Bedrock IAM. Prints the "84 feature flags not configured" notice only. |
| Scratch scenario: Seen on a title that 2 friends sent (temporary test file, deleted, not committed) | Confirms **MF-5**: after Seen on the pick, the other sender's card for the same title stays in the feed |
| Scratch scenario: seeded recs 20 days old | Confirms **MF-6**: `GET /tonight` returns **204**, so the pick card is hidden |
| AWS docs on HTTP API Lambda authorizer status codes | Confirms **MF-3**: `isAuthorized:false` → **403** `{"message":"Forbidden"}`; a missing header → **401** `{"message":"Unauthorized"}`. Neither uses the contract error body. |

`DynamoStore` was **not** exercised. Nobody ran it against DynamoDB, and the task list says so (API-09 `[~]`). The first deploy is its first real test.

---

## Must-fix (ranked)

### MF-1. A transient authorizer failure looks like "token revoked" (security/reliability; fix before first deploy)
`handlers/authorizer.ts` catches **every** error, including DynamoDB throttling or timeouts, and returns `{isAuthorized:false}`. API Gateway then returns **403** and caches that deny for 60 s for that token. Once the TV handles 401/403 as "unpaired" (MF-3, as it must), one DynamoDB blip makes the TV wipe its token and drop the household back to the pairing screen. That would hurt most in front of a judge.
**Fix:** return `isAuthorized:false` only for an unknown, malformed or wrong-kind token. On store errors, **rethrow**: API Gateway returns 500, the TV treats that as offline and retries, and the result is not cached as a deny. Add a unit test for it.

### MF-2. The cost ceiling under abuse exceeds the budget (cost; fix before first deploy)
Stage throttling is 20 rps / burst 40 for the whole API, and `/pair/start` and `/pair/status` are unauthenticated. Sustained junk traffic at the throttle limit is about 52M requests a month. That works out to roughly API GW $52 + Lambda ~$27 + DynamoDB writes ~$32 (one `CODE#` put per `/pair/start`), so **about $110/month**, above the $100 budget. Budgets only **email**; they don't stop anything. The same throttle is also an easy denial of service, because one script starves every TV.
Real need: 5 TVs polling every 20 s ≈ 0.25 rps.
**Fix:**
- Lower the stage default to about **5 rps / burst 10**, which puts the worst case near $28/month.
- Add a tighter per-route throttle on `POST /pair/start` (e.g. 1 rps / burst 5) through the stage's `routeSettings`.
- Optionally set `reservedConcurrentExecutions` (e.g. 5) on each function.
- Add the abuse ceiling to `ops/cost-estimate.md`. The doc currently prices only friendly traffic.

### MF-3. Auth error codes in the contract don't match the gateway, and the TV spec isn't synced (contract)
- `specs/api.md §6` and `tv-app.md §3.0/§3.7` promise **401** for a bad token ("401 on any call → clear token → Pairing"). In practice the gateway returns **403** with a non-contract body `{"message":"Forbidden"}` for unknown or revoked tokens, and 401 `{"message":"Unauthorized"}` only when the header is missing. As specified, a revoked TV never re-pairs: it would sit in an undefined state, or treat 403 as "offline" forever.
  **Fix (docs + TV client):** state in api.md §6 that 401 and 403 from protected routes both mean "token not accepted → re-pair". Note that gateway-generated errors don't follow `ErrorBody`, so the TV client must not assume `error.code` exists. Requires MF-1 first, so a 403 really means a bad token.
- `tv-app.md` §3.1 and the §4 sketch still describe the pre-contract shapes. The header note mentions the deltas, but the body text that TV-05 and the mock will be written from is stale:
  - `GET /pair/status` needs `&deviceId=` and returns `{status:"pending"} | {status:"paired", deviceToken}`. It does not return `{deviceToken?}`.
  - `GET /me` now has a `kind` discriminator.
  - `/tonight` `source` includes `"stub"`. The §3.3 state table has no `stub` row, and ADR-0007's mock variants list only `bedrock`/`fallback`.
  - `FeedItem.service` is **required and nullable** in the contract (`service: null`), not optional. A mock that omits it fails validation.
  - `204` from `/tonight` comes back with `content-type: application/json` and an empty body, so a naive `res.json()` throws. Either drop the content-type on 204 or tell the client to check the status first.
  **Fix:** update tv-app.md §3.1, §3.3 and §4, plus ADR-0007's mock list, to point at `packages/contract` as the only source of truth. Get Kiran's OK on OQ-10 so the shape is final before TV-05.

### MF-4. The TV has no path for a code that is consumed or expired while polling (pairing robustness)
`pairingStatus` deletes the code before it mints the token. If the Lambda dies between the delete and `putToken`, or the approval lands seconds before `expiresAt`, the TV's next poll gets **404/410**. tv-app.md §3.1 only renews the code at `expiresAt` and says nothing about 404/410, so the TV can poll a dead code for up to 10 minutes.
**Fix (TV spec, 1 line):** on 404 or 410 from `/pair/status`, immediately request a new code. Optional server-side fix: let an **approved** code be collected for a short grace period (e.g. 2 min) after `expiresAt`.

### MF-5. Seen is per-rec, but the product treats a *title* as the unit (product bug visible in the demo)
When Priya and Sam both send *Kestrel Bay*, the household gets two `REC#` items. Tonight's pick groups them ("Sam and Priya both recommended it"), but **Seen marks only one rec**. I confirmed this with a scratch run: after Seen on the pick, the feed still shows *Kestrel Bay / Priya*. Fallback ranking then also counts the leftover copy, so the same title can come back as "Most recommended this week" right after the user marked it Seen. The video script (0:52 "Mark Seen…") walks straight into this.
**Fix (small, server-side):** `markSeen` should mark **all unseen recs with the same `titleSource:titleId`** in that household. That's one Query plus N updates, and N ≤ the number of friends. Add a test.
Separately, ask Kiran whether the feed should show one card per title (listing all senders, as Detail/OQ-05 implies) or one per sender. **OPEN, don't assume.**

### MF-6. Seed freshness: the pick card disappears for judges (demo/judging; fix in API-12)
Candidates come from the last **14 days** and the fallback from the last **7**. If the seed runs around Oct 14–18, every seeded rec is older than 14 days by judging (plan: Nov 9–20, with a possible start of Oct 26). `/tonight` then returns **204** and the headline AI feature is **invisible to judges** (confirmed in a scratch run).
Related issues:
- All judges share **one** judge profile link and so one household. The first judge who marks things Seen empties the feed for everyone after.
- Seed recs need `recId` derived from `createdAt`. `tonight` filters candidates by **recId** lower bound but the fallback filters by **createdAt**, so a seed that backdates `createdAt` with a "now" `recId` gives inconsistent results.
**Fix (API-12 spec):**
- Make the seed **re-runnable with dates relative to now**, and generate `recId` from `createdAt`.
- Add a documented "refresh demo data" step to the judge-access checklist: a scheduled re-seed (e.g. an EventBridge rule → reseed Lambda, daily during judging) or a manual run before judging opens.
- Also seed the **judge household(s)** with their own recs (one household per judge link if more than one judge link is planned), so Seen by one judge doesn't empty another's feed.
- Add this to the plan §10 checklist.

### MF-7. Honesty about Bedrock while it is blocked (judging integrity, docs only)
The default is `PICK_MODE=stub`. The TV renders `stub` exactly like `bedrock` ("Tonight's pick"), and the video script says "with Amazon Bedrock for Tonight's pick". If AWS doesn't lift the block before recording, the demo would present a deterministic stub as AI.
**Fix:** add to the plan §10 checklist: "video/Devpost claim Bedrock only if the recorded build returned `source:\"bedrock\"`". Prepare honest alternate wording (e.g. "the Bedrock call is implemented and validated; the account was blocked, see friction log"). Consider a small, unobtrusive dev-only source indicator so recordings can be verified.

---

## Nice-to-have (ranked)
1. **Server-side unpair.** About → "Unpair this TV" only clears the local token. Device tokens never expire and can't be revoked without editing the table. Add `POST /pair/unpair` (device token → delete `TOKEN#` + `DEVICE#`). It takes about 15 minutes and makes the "revocable tokens" claim in ADR-0002 true from the UI.
2. **`deviceId` entropy.** The contract accepts 8 chars. Because `/pair/start` is unauthenticated and binds any `deviceId`, anyone who has a profile token *and* a TV's `deviceId` can re-pair that ID, which revokes the real TV's token (a denial of service, not a data leak). The TV spec should require a crypto-random ID of at least 128 bits (e.g. 22+ base64url chars); optionally raise the server minimum to 16.
3. **Profile tokens in URLs** (`/u/<token>`). Expected per ADR-0002, but:
   - keep CloudFront access logs off, or strip the path;
   - make the PWA move the token to localStorage and `history.replaceState` it out of the URL;
   - have the seed script write printed tokens to a gitignored file, never to chat, commits or email;
   - give each judge link its own household (MF-6).
4. **Prompt injection through `note`.** Friend notes go verbatim into the Bedrock prompt. Validation limits the damage (recId must be a candidate, reason ≤ 220), but a note could still steer the *reason* text shown on TV. That's acceptable at demo grade. Wrap notes as quoted data in the prompt, and optionally reject a reason that contains a URL.
5. **Gate-1 gap: API-11 and API-12 are what's missing, not more polish.** `POST /recommendations`, `/friends` and `/titles/search` don't exist, and neither do their routes in `infra`, yet api.md §10 and plan Gate 1 (already slipped from Oct 11) need them. Do API-11 → API-12 → API-13 (deploy + smoke test) next, and don't touch the Bedrock path until OQ-14 resolves.
6. **Cut or defer API-14 (TMDB).** The trademark-safe demo can't show real TMDB posters anyway (plan §7). Demo-catalog search covers the video and judges. Keep TMDB as stretch, and drop the About-screen TMDB attribution if TMDB isn't used.
7. **API-16 can be smaller.** If time is short, an S3 bucket + CloudFront with the default certificate is enough. No custom domain needed (OQ-12).
8. **Monitoring promised in plan §8 is absent.** No health route and no alarms. Add a CloudWatch alarm on API 5xx count and Lambda errors that notifies the budget email. Turn on stage access logs (without the `Authorization` header) for live-demo debugging.
9. **Table `RemovalPolicy.DESTROY`.** Fine for dev. Before handing out judge links, switch to `RETAIN` or enable deletion protection, so an accidental `cdk destroy` or replacement during Oct 23–Nov 20 doesn't wipe pairings.
10. **Bedrock IAM scope.** `foundation-model/*` in all regions is broader than needed. When enabling, scope it to the chosen model's family ARNs plus the one inference profile.
11. **Cost-estimate accuracy.** Scenario A states ~90k calls, but one TV × 4 h × 3 polls/min ≈ 22k/month. That's conservative, so harmless, but fix the arithmetic. Bedrock prices are still marked unverified on the AWS page; verify them before API-15. The doc should also say the feed `Limit` (limit × 3 = 150) is the main read-cost driver.
12. **Long-lived admin access key.** `watchcircle-bot` has `AdministratorAccess` with a static key on the shared box. Acceptable for the sprint. Rotate or delete it after Nov 20 (or after Dec 3); a scoped deploy role would be better.
13. **Minor code notes:**
    - `DynamoStore.claimPickAttempt` uses `new Date()` instead of the injected clock (inconsistent with MemoryStore; harmless in prod).
    - `getFeed` can hide older unseen items when more than 100 of the newest 150 are Seen (not a demo concern).
    - CORS headers on gateway-generated 401/403 responses are unverified. Check them in the API-13 smoke test from a browser origin, since the PWA calls `/pair/complete` cross-origin.
    - A cached stub pick survives a same-day switch to `bedrock` mode. Note this in API-15, or delete today's `PICK#` when switching.

## Not issues (checked and fine)
- **Pairing:** codes use `crypto.randomInt` over 31 symbols (~8.9e8). Only one-time delivery is possible, guarded by a conditional delete. Collecting a token needs both the code and the requesting `deviceId`. Approval needs a profile token. Expiry is checked in code, not left to TTL. Re-pairing revokes the old token. The plaintext token is never stored or logged.
- **Authorizer:** checks the prefix kind against the stored kind, caps header length and is read-only on the table. Wrong-kind tokens get 403 from the handlers.
- **Cross-household access:** every rec read and write is keyed by the token's `householdId`. Unknown IDs → 404.
- **Tonight's pick** follows plan §5 and ADR-0003 step by step:
  - cache keyed by household-local date;
  - Seen-after-pick → fallback with no second model call;
  - `PICKTRY` guard;
  - 4 s abort, no SDK retries (`maxAttempts:1`);
  - recId and length validation;
  - fallback never cached.
- **Errors:** handlers never leak stack traces (`wrap` → generic 500).
- **Overbuilding:** none. Four functions, one table, no GSI and no extra services. The Bedrock picker is about 80 lines behind an interface and was cheap to build ahead of the unblock.
