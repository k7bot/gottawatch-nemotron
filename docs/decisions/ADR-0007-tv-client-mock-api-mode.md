# ADR-0007: TV client mock API mode

- **Status:** Proposed (added in the TV build spec Oct 11; not in plan v2). Independent review done (agree with changes, [reviews/ADR-0006-0007-review.md](reviews/ADR-0006-0007-review.md)); guardrails below added 2026-10-11. Awaiting Kiran's OK to mark Accepted.

## Context
The backend (plan Oct 9) is not built and AWS build access is pending; the Oct 11 gate has slipped. The TV app needs data to build screens, focus, and error states now.

## Decision (proposed)
`API_MODE=live|mock`. Mock mode is an in-app fake implementing the exact contract in `packages/contract` (the only source of truth; tv-app spec §4 points to it) with demo-catalog fixtures (original titles only), simulated pairing (`{status:"pending"|"paired"}` shape, 404/410 on dead codes), `bedrock`/`stub`/`fallback` pick variants plus 204, title-level Seen, `FeedItem.service` always present (`null` = unknown), and error injection (offline/401/403/5xx). *(Updated 2026-10-11 to match the implemented contract, review api-spec-review.md MF-3.)*

## Alternatives
- Wait for the backend: blocks TV work.
- Local mock HTTP server: extra process to run on the simulator host; possible later.
- Point at the server's `CATALOG_MODE=demo`: still needs a deployed backend.

## Consequences
- Contract drift risk: mock and backend must both follow spec §4 (one shared types file once `services/api` exists).
- Mock mode must be off in judge builds.

## Guardrails (from the independent review, added 2026-10-11)
1. **One `ApiClient` interface, two implementations** (`LiveApiClient`, `MockApiClient`), chosen once at startup. No `if (mock)` checks inside screens.
2. **One shared contract module** (TypeScript types plus runtime validation, e.g. zod), used by the mock, the TV app and the Lambdas. *Exists since 2026-10-11: `packages/contract`.* The mock validates its own fixtures against it; dev builds validate live responses so contract drift shows up as a visible error.
3. **Realistic mock:** configurable latency (about 300–1500 ms), pairing expiry based on real timestamps, and offline/401/5xx injection.
4. **Can't ship by accident:** `API_MODE` defaults to `live`. Mock mode shows a persistent on-screen **"MOCK DATA"** badge. Release builds fail or refuse to start with `API_MODE=mock`. Plan §10 submission checklist gets the item "judge/video build is live mode".
5. **Time-boxed:** mock mode is for UI work only. The TV switches to the live dev API as soon as `/pair/start`, `/pair/status` and `/feed` are deployed. Gate 1 and the Oct 18 rehearsal run on live data.
6. OQ-10 (contract approval) blocks the *final shape of the mock fixtures*, not the start of UI work.
