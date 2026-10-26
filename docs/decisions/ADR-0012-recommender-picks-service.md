# ADR-0012: The recommender picks the streaming service; real names in the live app

- **Status:** Accepted, Kiran, Mon Oct 12, 2026 (answer to feedback B; research: [where-to-watch.md](../research/where-to-watch.md))
- **Amends:** ux-design §5.4 ("service name only if known and not demo mode"), ADR-0005 (best-effort handoff + search tip)

## Decision
1. When sending, the recommender picks **where to watch** on the phone (web PWA and native app) from a fixed list, or **"Not sure"**, which is the default.
2. **Live app:** real service names as **plain text** (no logos): Netflix, Prime Video, Disney+, Hulu, Max, Apple TV, YouTube, Peacock, Paramount+, plus "Other".
   **Demo/seed data and mock mode:** invented service names only ("Kitehouse", "Pebblewave"; generic "Streaming app A/B" until Oct 20, swapped so the demo looks like a real catalog, each name web-checked for clashes). The seed uses those ids, so the demo video never shows a real brand.
3. The API stores a stable **service id** (`netflix`, `app_a`, …) in the existing `service` field (`null` = Not sure). One shared catalog in `packages/contract` maps ids to display names. Unknown ids (older clients, "other") count as unknown.
4. **TV:** the rec detail shows "On {service}". The handoff shows **'Open {service} and search for "{title}"'**. Unknown, "Other" or Not sure → the existing generic copy ("Watch it in your streaming app").
5. **Several friends, different services:** show the **most common** service among that title's recs that name one. Ties go to the **most recent**. "Not sure" never outvotes a named service.
6. **No auto-launch yet.** Launching another app by package name needs a small native module (React Native `Linking` can't start a package), and the package names are community-sourced, not verified on Kiran's stick. So the handoff stays **tip-only** for named services, with no countdown and no failure state. App launch can come later behind an allow-list verified on the device (`pm list packages`).
7. Auto-detection via TMDB stays a later, optional step (needs a TMDB key).

## Consequences
- No backend schema change: `service` already exists (string ≤ 40, nullable).
- The handoff no longer shows "Couldn't open the app" for named services: no launch is attempted, so there is nothing to fail.
