# ADR-0005: Best-effort handoff with an in-app search-tip screen

- **Status:** Accepted (plan v2 §2 Wedge, §3 F–H, §5 Handoff strategy)

## Context
Appstore policy generally limits third-party apps deep-linking into another app's video experience (plan §2), launch mechanics differ by OS (research doc), and the demo video must not show third-party trademarks or destination-app screens (plan §7).

## Decision
On Select, show a full-screen panel inside WatchCircle (~2–3 s or until OK): poster, title, "Opening your streaming app…", and "Search for: <Title>" when no verified title link exists. Then: verified title link → app launch → fail closed to in-app instructions ("Install the app from the Appstore" + search tip). Never overlay another app. A small config map `service → { packageOrAppId, titleUrlTemplate?, searchFallback }` drives it. Devpost text calls launching best-effort.

## Alternatives
- Promise title-level deep links as a feature: rejected (policy + verification risk).
- No launch at all, tip only: acceptable fallback, but plan wants a best-effort launch.

## Consequences
- The handoff module must work with an empty config map.
- Which apps/IDs/URIs to configure is open (OQ-07); none are verified yet.
