# Build spec: Fire TV client (`apps/tv`)

> **2026-10-13:** user-facing "Watch tonight" / "Tonight's pick" are now "Watch" / "Top pick" (ADR-0016).

Status: **Draft v1, Oct 11, 2026.** Derived from [plan v2](../plan/MVP_PLAN_v2.md) §3 (flows A, D–H), §4, §5, §7 and Appendix A. Items marked **(proposed)** fill gaps the plan left open and need confirmation; items marked **OPEN** are tracked in [open-questions.md](../open-questions.md). Tasks: [tasks/tv-app-tasks.md](../tasks/tv-app-tasks.md).

## 1. Scope

**In (plan §4):** pairing-code screen, friends feed, Tonight's pick card, D-pad focus, search-tip/handoff panel, Seen, empty/error states, About screen with TMDB attribution (plan §5 "TMDB").
**Out (plan §4 OUT):** login, overlays/PiP on other apps, watch history, chat/open-ended AI, algorithmic ranking (feed stays chronological), service filter chips (stretch), Alexa (stretch).
**Platform:** Fire OS (react-native-tvos) or Vega: **OPEN** ([ADR-0006](../decisions/ADR-0006-fire-tv-platform-fire-os-vs-vega.md)). This spec is written platform-neutral; platform-specific parts are called out (§8 handoff, storage, QR library).

## 2. Screen stack

```
Boot ──(no/invalid token)──► Pairing ──(paired)──► Feed ◄──────────────┐
  └──(valid token)──────────────────────────────►  │                   │
                                                   ├─ Select card ─► [Title detail]* ─► Search-tip/Handoff ─► (other app)
                                                   ├─ Select pick ─────────────────────► Search-tip/Handoff
                                                   └─ About
```
\* Title detail is **OPEN (OQ-05)**: plan §3D says Select goes straight to handoff. Until decided, build Select → Search-tip/Handoff (plan behavior) and keep detail as an optional task (TV-22).

Back: from Feed/Pairing → OS default (exit app) (proposed). From Search-tip/Handoff, Detail, About → previous screen.

## 3. Screens

### 3.0 Boot (no UI beyond a splash)
- Read stored `deviceToken` (persistent key-value storage; library depends on platform: Vega has an `@amazon-devices` port of `react-native-mmkv` per [research §1](../research/firetv-toolchain.md); Fire OS library choice UNVERIFIED).
- If none → Pairing. If present → `GET /me`; 200 → Feed; **401 or 403** → clear token → Pairing (API Gateway returns 403 for an unknown/revoked token and 401 for a missing header; neither uses the contract error body, see [api.md §6](api.md#6-api-contract-implemented-in-packagescontract)); **5xx** or network error → Feed in offline state using last cached feed (if any), else Error screen with Retry.
- **Acceptance:** cold start with valid token lands on Feed with no pairing flash; revoked token lands on Pairing within one request.

### 3.1 Pairing (flow A)
**Layout:** WatchCircle wordmark; "Get started" button (plan: "Get started shows a 6-character pairing code"; whether it's a button or the screen title is proposed as a button). After Get started: large code (e.g. `K7Q4ZP`), QR code + short URL to the phone PWA, countdown to expiry, helper text "On your phone, open your WatchCircle link and enter this code."
**Data:**
- `POST /pair/start` body `{ deviceId }` (proposed; plan §3A says backend binds the TV's `deviceId`) → `{ code, expiresAt }`. `deviceId`: generated once on first launch with a cryptographically secure RNG, **≥ 128 bits** (e.g. 16 random bytes as base64url = 22 chars; the contract rejects shorter IDs), and persisted.
- `GET /pair/status?code=<code>&deviceId=<deviceId>` polled every **3 s** (proposed) → `{ status: "pending" }` or `{ status: "paired", deviceToken }`; on `paired`, persist token, go to Feed. Token is delivered once (plan Appendix A).
- **404 or 410 from `/pair/status`** (code consumed, expired or unknown) → immediately request a new code with `/pair/start`; never keep polling a dead code (review MF-4).
- QR target: `<PWA_BASE_URL>/pair?code=<code>` (proposed; PWA URL/domain OPEN, OQ-12).
**Behavior:** at `expiresAt` (10-min TTL, plan) automatically request a new code; stop polling when app is backgrounded; resume on foreground. Code alphabet is server-side (unambiguous chars).
**Focus map:** Get started (initial) → after code shown: single focusable "Get a new code" button (initial focus) ↔ "About" (Right/Left). Up/Down: no-op.
**Errors:** `/pair/start` fails → inline "Can't reach WatchCircle. Check your connection." + Retry (focused).
**Acceptance:** code + QR visible within 2 s of Get started on simulator (proposed target); pairing from the phone moves the TV to Feed within one poll interval; expired code is replaced without user action; no dead-end focus states.

### 3.2 Friends feed (flow D)
**Layout:** header row (WatchCircle wordmark, household name if available (proposed), "About" button); Tonight's pick card (§3.3); then **one vertical column** of recommendation cards, reverse-chronological (plan §8 mitigation: "one column + one pick card").
**Card content (plan §3D):** friend avatar/name, poster, title, year, note, service badge if known (never shown in demo mode, §9), time ago.
**Data:** `GET /feed` (§4) on enter and every **20 s** while foregrounded (plan: 15–30 s; 20 s proposed). Seen items are excluded by the server (plan: Seen "hides from the default feed") (proposed: server-side filter).
**Refresh rules:** merge by `id`; new items appear at top; **focus never jumps**: the focused card keeps focus by `id`; if it disappears (e.g., Seen elsewhere), focus moves to the next card, else previous, else the pick card.
**Focus map:**
- Initial focus: Tonight's pick card (if shown), else first rec card, else empty-state button.
- Up from pick card → About. Down from About → pick card.
- Down from pick card → first rec card; Up from first rec card → pick card.
- Up/Down within list moves one card; list scrolls to keep focused card fully visible.
- Left/Right in list: no-op (single column).
- Select on a card → Search-tip/Handoff for that rec (or Detail if OQ-05 adopts it).
- Seen action trigger: **OPEN (OQ-06)** (options: remote Menu button on focused card; a "Mark seen" button on Detail; long-press).
**Seen:** `POST /recommendations/{id}/seen` → optimistic removal of **every card with the same title** (the server marks the title Seen for the whole household, not just that friend's rec; [api.md §7.3](api.md#73-recommendations--feed-flows-c-d)). Whether the feed shows one card per title or one per friend is **OPEN (OQ-19)**; on failure, restore card + toast "Couldn't mark as seen". If the Seen rec is today's pick → refetch `GET /tonight` (server returns fallback per plan §5 step 8).
**Empty state:** "No recommendations yet. Ask a friend to send one from their phone." (proposed copy) + focused "Refresh" button. (Plan seeds data so this should be rare.)
**Acceptance:** D-pad reaches every card and About with no focus traps; a rec sent from the phone appears within one poll interval without moving focus; Seen removes a card in < 300 ms locally (proposed); feed readable from ~10 ft (plan §9 "readable from 10 feet"; typography in §7).

### 3.3 Tonight's pick card (flow E, top of feed)
**Data:** `GET /tonight` when Feed opens and when the app returns to foreground (proposed), plus after Seen on the picked rec. Response `{ recId, title, poster, reason, source }` (plan Appendix A).
**States:**
| State | Label | Body |
|---|---|---|
| loading | "Tonight's pick" | skeleton; never blocks the rest of the feed |
| `source: "bedrock"` | "Tonight's pick" | poster, title, `reason` (≤ 220 chars, server-validated) |
| `source: "stub"` | "Tonight's pick" | same as `bedrock` (server `PICK_MODE=stub`, used while Bedrock is blocked, OQ-14). Dev/debug builds show a small, unobtrusive source tag (e.g. "stub") so recordings can be verified (proposed, review MF-7); release builds don't. |
| `source: "fallback"` | "Most recommended this week" | poster, title, `reason` if provided (fallback reason text is server-defined; proposed e.g. "Sent by 3 friends this week") |
| error / 204 / no candidates | card hidden (proposed) | feed starts with rec cards. **204 has an empty body and no content-type: check the status before parsing.** |
**Select** → same Search-tip/Handoff flow as a rec card (looked up by `recId`).
**Acceptance:** with stubbed Bedrock the card renders the stub reason; with Bedrock killed or < 2 unseen recs it renders "Most recommended this week"; an API error never breaks or delays the feed (plan §3E.4).

### 3.4 Title detail: OPEN (OQ-05)
If adopted: poster, title, year, runtime, genres, every friend who sent it with their note, buttons **[Open]** (→ Search-tip/Handoff, initial focus) **[Mark seen]** **[Back]**, Left/Right between buttons. Data comes from the feed item (no extra endpoint). Acceptance: reachable with Select, all buttons reachable, Back returns focus to the originating card.

### 3.5 Search-tip / handoff panel (flows F, G)
**Layout (full screen, inside WatchCircle):** poster + title; "Opening your streaming app…" (service name only when known **and** not demo mode); large **"Search for: <Title>"** whenever no verified title-level link exists (plan §3F).
**Behavior:**
1. Show for ~2.5 s (plan: ~2–3 s) or until OK is pressed. Back cancels and returns to Feed with focus restored.
2. Attempt launch via the handoff config map (§8): verified title link → app launch → else fail.
3. Unknown service (`service` null/"unknown"): no launch attempt; panel stays with search tip + "Back to feed" (proposed).
4. Launch failure: stay in-app: "Install the app from the Appstore" + search tip still visible + focused "Back to feed" (plan §3G.3).
5. Never draw over the other app (plan §3G.4).
**Return (flow H):** on return to WatchCircle, Feed state is preserved (same focus, Seen filtered, pick unchanged).
**Acceptance:** Select on any card always ends in either a launched app or a readable in-app instruction; Back always works; no service names/logos in demo mode.

### 3.6 About
WatchCircle version/build, TMDB attribution (logo/notice per TMDB terms; exact wording to be checked), "Demo-grade auth for the hackathon" note (plan §5), **"Unpair this TV"** (proposed; clears token → Pairing; plan says re-pairing issues a new token and revokes the old one). Back → previous screen.
**Acceptance:** TMDB attribution visible; reachable from Pairing and Feed.

### 3.7 Global error / offline / loading
| Condition | Behavior |
|---|---|
| First load in progress | Skeleton cards (no spinner-only blank screen) |
| Network error on poll | Keep showing last data; small "Offline, retrying" banner; keep polling (backoff to 60 s, proposed) |
| Network error with no data | Full-screen "Can't reach WatchCircle" + focused Retry |
| 401 or 403 on any protected call | Clear token → Pairing (gateway-generated; body is `{"message":...}`, not the contract `ErrorBody`, so never assume `error.code` exists) |
| 5xx (incl. 500 when the authorizer can't reach the database) | Treat like network error (banner, retry); **never** clear the token on 5xx; never crash |
| 429 (API throttled) or 503 (Lambda concurrency limit) | Same as network error: keep data, banner, back off and retry |
| Poster fails to load | Placeholder art with title text |
| Tonight's pick error | Hide card (§3.3) |

## 4. API contract used by the TV

**Single source of truth: [`packages/contract`](../../packages/contract/src/index.ts)** (zod schemas + TS types), described in [specs/api.md §6](api.md#6-api-contract-implemented-in-packagescontract). The TV client, the mock (ADR-0007) and the backend all import it; do not copy shapes from this page or from plan Appendix A. Details still pending Kiran's OK are tracked in OQ-10.

TV-relevant routes (auth `Authorization: Bearer <deviceToken>` except the two pairing GET/POST routes):

| Route | Response (see contract for exact schema) |
|---|---|
| `POST /pair/start` `{deviceId}` | `{ code, expiresAt }` |
| `GET /pair/status?code=&deviceId=` | `{status:"pending"}` \| `{status:"paired", deviceToken}`; 404/410 → new code |
| `GET /me` | discriminated by `kind`: `{kind:"device", device:{id}, householdId, householdName?}` |
| `GET /feed?limit=` | `{ items: FeedItem[] }`; `FeedItem.service` is **required and nullable** (`null` = unknown) |
| `POST /recommendations/{id}/seen` | `{ ok: true }` (marks the whole title Seen for the household) |
| `GET /tonight` | `{ recId, title, poster?, reason, source: "bedrock"\|"stub"\|"fallback" }` or **204 (empty body)** |

Errors from handlers use `ErrorBody` `{ error: { code, message } }`; errors generated by API Gateway itself (401/403 from the authorizer, 429 throttling) do not. The TV never sends TMDB queries; posters are display-only URLs.

## 5. Client configuration (proposed)

| Key | Purpose |
|---|---|
| `API_BASE_URL` | API Gateway base URL |
| `PWA_BASE_URL` | For the pairing QR/short URL (OQ-12) |
| `API_MODE` | `live` \| `mock` (see §9 and ADR-0007) |
| `FEED_POLL_MS` | default 20000 |
| `PAIR_POLL_MS` | default 3000 |
| `HANDOFF_TIP_MS` | default 2500 |
| `DEMO_MODE` | hides service names; uses demo catalog art |

## 6. State & data handling
- In-memory store: `feedItems` (by id), `tonight`, `focusedId`, `connectivity`.
- Persist: `deviceId`, `deviceToken`; optionally last feed snapshot for instant render on relaunch (proposed; marked stale until refreshed).
- Polling only while foregrounded (plan §5: "poll 15–30 s while foregrounded").

## 7. 10-foot UI (proposed values; Amazon design guidance not yet researched: UNVERIFIED)
- Render at 1920×1080 layout units; keep content inside a ~5% safe margin.
- Text: titles ≥ 36 px, body ≥ 24 px, no text < 20 px (proposed).
- Focus indicator: scale 1.05 + 4 px high-contrast border; never rely on color alone.
- Max ~3 rec cards visible at once vertically; posters 2:3.

## 8. Handoff config map & platform launch (plan §5 "Handoff strategy")
```ts
type ServiceKey = string; // e.g. "service_a" in demo data; real keys OPEN (OQ-07)
type HandoffTarget = {
  displayName: string;          // hidden in DEMO_MODE
  fireOs?: { packageName: string; titleUrlTemplate?: string };  // Android intent launch; needs <queries> on API 30+
  vega?: { launchUri: string; titleUrlTemplate?: string };      // Linking.openURL; manifest messaging rules apply
  searchFallback: true;         // always show "Search for: <Title>"
};
```
- Fire OS: launch by package / intent; declare target packages in `<queries>` (research §2). Title-level templates only if verified on that OS build (plan §3G.1).
- Vega: `Linking.canOpenURL` → `Linking.openURL` (research §1).
- Which real apps, IDs and URIs: **OPEN (OQ-07)**; none are verified. The handoff module must work (fail closed) with an **empty** map.

## 9. Demo / stub behavior
- **Client mock mode** (`API_MODE=mock`, proposed, [ADR-0007](../decisions/ADR-0007-tv-client-mock-api-mode.md)): an in-app fake API returns fixtures shaped exactly like §4, so the TV can be built before the backend exists; supports pairing (auto-completes after N s), feed, tonight (`bedrock`, `stub` and `fallback` variants plus 204), title-level Seen, and error injection (offline, 401, 403, 404/410 on pair status, 5xx). Fixtures are validated against `packages/contract`.
- **Server demo mode** (`CATALOG_MODE=demo`, plan §5): recommendations reference our original demo catalog with our own poster art on CloudFront.
- **Trademark-safe catalog (plan §7):** fixtures and demo data use only made-up titles, e.g. *Kestrel Bay*, *The Quiet Orchard*, *Saltwater Static* (to be checked for TMDB collisions on Oct 21), our own poster art, generic service keys (no real streaming-service names or logos), demo personas (Priya, Sam, Maya). No real TMDB posters in fixtures, screenshots or video.

## 10. Definition of done (whole TV app)
- All §3 acceptance criteria pass on the chosen simulator (and a device if available, OQ-03).
- Gate 1 slice (Pairing + Feed + polling against live API) demoable; Gate 2 adds Tonight's pick, Seen, Search-tip/Handoff, empty/error states, About.
- README in `apps/tv` explains install/run on simulator from a clean machine (plan §10).
- Friction-log entries recorded for toolchain issues ([submission/FRICTION_LOG.md](../submission/FRICTION_LOG.md)).
