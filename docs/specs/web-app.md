# Phone PWA spec (apps/web), Tier 1

Status: v1, 2026-10-11. Sources: ADR-0004 (PWA on S3 + CloudFront), ADR-0009 (Tier 1 scope), [ux-design.md](ux-design.md) §6/§8 (screens + copy), [api.md](api.md) (routes), API review nice-to-have #3 (token handling). Tasks: [web-tasks.md](../tasks/web-tasks.md).

## 1. Scope (Tier 1)
IN: profile-link entry, Home/search (auto-focused), one-tap result → Compose (optional note, recipients, where-to-watch, Send above the keyboard), Sent ✓ with "How it'll look on their TV", Connect a TV at `/pair` (manual 6-box entry, QR confirm, cold-scan message), all error states from ux §6, DEMO DATA badge in mock mode, web app manifest.
OUT (Tier 2 / later): check-mark draw animation, service worker / offline cache, server-side "recent sends" (UXQ-07; Tier 1 keeps recent sends in localStorage on this phone only), "Who are you?" profile picker (UXQ-16), TMDB search (demo catalog only).

## 2. Stack
Vite + React 19 + TypeScript, npm workspace `apps/web`, contract types and zod validation from `@gottawatch/contract`. No router library: 4 views switched on `location.pathname` (`/`, `/pair`) with `history.pushState`. No third-party requests (fonts self-hosted: Inter + Fraunces, OFL, same files as the TV).

## 3. Profile token handling (review nice-to-have #3, ADR-0002)
- Links look like `https://<pwa>/u/<wcp_token>` (seed script `--pwa-url`).
- **Before the first render and before any network call**, `main.tsx` reads the token from the path, saves it to `localStorage` (`wc.profileToken`) and calls `history.replaceState` to `/`, so the token leaves the visible URL, history entry and any later Referer.
- `<meta name="referrer" content="no-referrer">` plus a CloudFront `Referrer-Policy: no-referrer` header. CloudFront access logs stay **off**. The token is never logged (no `console` calls with it) and never put in committed files.
- `/me` 401/403 → token removed, "This link doesn't work anymore. Ask Kiran for a new one."
- A new link replaces the stored token (switching profiles = opening another link).

## 4. Screens (copy from ux §8)
- **Home/search:** "Hi {name}" + "What should {household} watch?" when the profile has exactly one friend household, else "Recommend something to your circle". Search input auto-focused; results after 2+ chars, 250 ms debounce; states: searching (3 skeleton rows), no results, error + Retry, offline, invalid link. Below the field before typing: "Your recent sends" (this phone only).
- **Compose (bottom sheet):** poster/title/year, note field (counter at 100+, max 120 = NOTE_MAX; note chips removed Oct 12, see ux §6.2), recipient chips (default = last used, else the only friend household; "Everyone" if > 1), "Where: Not sure ▾" (demo: Kitehouse / Pebblewave / Other / Not sure), Send button **"Send to {household}"** pinned to the bottom of the visual viewport so it stays above the keyboard. States: sending, error (note kept), no recipient (disabled + "Pick who it's for").
- **Sent ✓:** static check, "Sent to {household}", "It'll show up on their TV within a minute.", TV card preview (poster + sender avatar + note), [Recommend another] [Done].
- **Connect a TV:** `/pair` manual: 6 boxes (one input underneath; uppercase; strips spaces/dashes; only the pairing alphabet). `/pair?code=X` with a profile: "Is this the code on your TV?" + code + [Yes, connect this TV] / "No, that's not it" (→ manual). Without a profile (cold camera scan): "Open your WatchCircle link first, then scan again." + code big + hint. Success "Connected! Look at your TV." Errors: 404 "That code didn't match. Check the TV and try again."; 410 "That code expired. Your TV shows a new one."; 409 treated as "already used" (proposed copy: "That code was already used. Your TV shows a new one.").
- Household labels: the API has no household names for friends, so a friend household is labeled "{displayName}'s household" (several friends in one household: "Priya and Sam's household") (proposed).

## 5. Config / modes
`VITE_API_URL` (default: deployed API), `VITE_API_MODE` = `live` | `mock`; mock only in `vite dev` (`import.meta.env.DEV`), refused in production builds (ADR-0007 guardrail), shows DEMO DATA.

## 6. Hosting (API-16, OQ-12 decided 2026-10-11: CloudFront default domain for now)
Same CDK stack as the API (so CORS can name the distribution domain): private S3 bucket (block public access, OAC), CloudFront (HTTPS redirect, default certificate, `PriceClass_100`, SPA fallback 403/404 → `/index.html`, no access logs, security headers incl. `Referrer-Policy: no-referrer`), `BucketDeployment` of `apps/web/dist` with invalidation. API CORS `allowOrigins` = `https://<distribution domain>` only. Deployed by the `deploy-api` GitHub Actions workflow (builds the PWA first). The TV pairing QR points at `https://<domain>/pair?code=<code>`.

## 7. Tests
Unit (vitest): token capture + URL cleanup, code normalization, recipient defaults/labels, API client validation and error mapping. Live: browser e2e against the deployed PWA with a throwaway seeded household (profile link → token gone from URL → pair a fresh device via QR confirm → search → send with chip → rec appears in that device's `/feed`), then cleanup; captures mobile screenshots (390×844).

## 8. Tabs + email sign-in (ADR-0013, Oct 12)
Bottom tabs **For you** (inbox grouped by title, Watched it + 6 s Undo, Watched history with Put back) · **Recommend** (the flow above, unchanged; local "recent sends" removed) · **Friends** (names, "N waiting for you · you sent N") · **Me** (name, "Signed in on this phone", home members, connected TVs + Connect a TV, server-side "You recommended", Sign-in email, sign out with confirm). Default tab: For you when it has items, else Recommend. Email sign-in shows on the signed-out screen and on Me only when `GET /auth/config` returns `email: true`. Screenshots: `docs/design/screenshots/phone-tab-*.png`, `phone-email-*.png`, `phone-me-add-email.png`. Live check: `services/api/scripts/phone-tabs-live.ts`.


Signed-out welcome: see ux-design.md "Signed-out welcome" (email primary when enabled, link as secondary, no hard-coded names). Screenshot: `docs/design/screenshots/phone-signed-out.png`.
