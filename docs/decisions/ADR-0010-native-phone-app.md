# ADR-0010: Native phone app (React Native + Expo) alongside the PWA

- **Status:** Accepted — Kiran, Mon Oct 12, 2026, 12:39 AM ET
- **Amends:** [ADR-0004](ADR-0004-phone-client-is-pwa.md) (the PWA stays; it is no longer the *only* phone client)
- **Independent review:** [reviews/mobile-app-review.md](reviews/mobile-app-review.md), Oct 12: **approve with changes**. Must-fixes 1–4 and should-fixes 6–10 applied on Oct 12; must-fix 5 (real-device smoke test) is still open.

## Context
- Kiran wants a phone app that is "handy/signed-in", keeps **cached content**, can send **notifications**, and can **grow its own features independent of Fire TV**.
- The PWA (ADR-0004) is live at the CloudFront default domain and works end to end (web-e2e 17/17). Judges need a no-install link, so it stays.
- iOS distribution will use an Apple Developer account Kiran shares with an organization. Org name, Team ID and bundle-ID prefix are unknown (OQ-21).
- Deadline Fri Oct 23, 2026; ADR-0009 tiers apply (Tier 1 now, Tier 2 gated).

## Decision
1. Build `apps/mobile`: **Expo (managed workflow, TypeScript), React Native**, iOS + Android. Phone-only (not react-native-tvos), separate from `apps/tv`.
2. **Independent of Fire TV:** own navigation and home (search/send first; "Your sends" and later friends' activity), no shared UI with the TV app. It talks only to the public HTTP API with a **profile** token, like the PWA.
3. **Shared code:** `packages/contract` (schemas) and a new **`packages/client`** (contract-validated API client + pure phone logic: code normalization, recipients, labels) used by both `apps/web` and `apps/mobile`. UI is not shared.
4. **Sign-in = the existing profile link** (ADR-0002, no new auth). Token stored in **expo-secure-store** (Keychain / Android Keystore-backed), never logged.
5. **Deep links:** Tier 1: in-app "paste link" (the https profile link) and the custom scheme `watchcircle://pair?code=X`. The app still *accepts* `watchcircle://u/<token>`, but asks before switching away from a different signed-in profile. **We never issue token-bearing custom-scheme links** (in invites, QR codes or anywhere else), because custom schemes aren't exclusive on Android. Universal links (iOS) / App Links (Android) for the existing `https://<pwa>/u/…` and `/pair?code=…` URLs are **Tier 2**: they need the Apple Team ID (OQ-21) and the Android signing-key SHA-256 in files served by CloudFront.
6. **Push notifications and universal/App Links are deferred until after the Oct 23 submission** (review). Push: Expo push service (APNs + FCM behind it) needs backend changes (store push tokens per profile, send on `POST /recommendations` to the recipients' phones) plus Apple/Firebase credentials. Not part of the Oct 23 submission.
7. **Distribution:** Android: a locally built debug/preview APK first, then Play internal testing later (needs a Play Console account; Kiran decides). iOS: TestFlight via **EAS Build/Submit under the org's Apple account**. No store listings or Apple/Google account use by agents.
8. Placeholder identifiers, **PROPOSED** until OQ-21 is answered: iOS bundle ID / Android package `com.k7apps.watchcircle.mobile`.

## Priority and cutoffs (from the review)
- **Priority order:** (1) the Fire TV app running on the real stick, (2) the PWA working end to end, (3) native Android polish (review must-fixes, real-device smoke test), then everything else. Native mobile must not take time away from the Fire TV device session.
- **iOS cutoff:** if the OQ-21 details (Team ID, allowed bundle ID, EAS access) are not in by **Thu Oct 15, 2026**, native iOS is dropped from the Oct 23 scope and we demo Android + PWA.
- Judges are never asked to sideload; the PWA stays their path.

## Alternatives
- **PWA only (ADR-0004):** no Keychain storage, weak iOS push (web push only for home-screen PWAs, iOS 16.4+), no store presence. Rejected by Kiran for the phone experience; kept for judges.
- **Share the TV codebase (react-native-tvos):** couples phone features to Fire TV constraints (old arch, TV focus engine). Rejected: independence is a stated goal.
- **Bare React Native / native Swift+Kotlin:** more control, much more setup and two codebases. Rejected for the timeline.

## Consequences
- More surface to build and test; the PWA remains the judges' path and the reference for copy (ux-design §6).
- The demo/video can show either client; judges are not asked to install the app.
- Backend unchanged for Tier 1. Tier 2 push adds a push-token route + a send step (mobile-app.md §6).
- iOS builds are blocked until Kiran provides the org account details (OQ-21).
