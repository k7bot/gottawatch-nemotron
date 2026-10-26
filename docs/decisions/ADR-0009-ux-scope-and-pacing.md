# ADR-0009: UX scope and pacing (resolves UXQ-17 / review MF-11)

- **Status:** Accepted — delegated by Kiran to expert review on 2026-10-11
- **Decided by:** a fresh, independent senior product lead (TV apps + hackathons), not the spec author or the UX-01 reviewer. Kiran asked for an expert to "review and decide" (Sun Oct 11, 2026, ~10:15 PM ET).
- **Inputs read:** [plan v2](../plan/MVP_PLAN_v2.md) §4, §6 (gates, buffer rule), §9 (criteria); [ux-design.md](../specs/ux-design.md) v1.1; [ux-tasks.md](../tasks/ux-tasks.md); [open-questions-ux.md](../open-questions-ux.md); [UX review](reviews/ux-design-review.md); [tv-app-tasks.md](../tasks/tv-app-tasks.md); [aws-account.md](../ops/aws-account.md).
- **Supersedes (for UX only):** the plan v2 §6 buffer-rule clause "if the Oct 11 gate slips … freeze visual polish". The rest of that rule (cut stretch; Oct 19 goes to the core loop if the Oct 18 gate slips) stands.

## Context

- **Deadline** Fri Oct 23, 2026, 12:00 PM PT (3 PM ET); plan submits 2 h early; real code freeze Thu Oct 22; video recorded Tue Oct 20 – Wed Oct 21; video < 3 min (target 75 s).
- **Judging:** four equally weighted criteria: **Tech Implementation, Design, Potential Impact, Quality of the Idea** (+ up to 10% friction-log bonus). Design is 25% on its own, and judges mostly *see* the other three through the video and the UI too.
- **Kiran's direction (Oct 11):** UX/UI must be excellent, intuitive and engaging, and is as important as function.
- **State on Sun Oct 11, ~10:20 PM ET:** the Oct 11 gate (phone send → TV card) is **red**. Backend is live (25/25 smoke). The TV app is a hello-world APK not yet on the stick; the phone PWA isn't built; Bedrock is blocked (stub picks; AWS case pending).
- **Capacity:** AI agents build, so coding throughput is high. The scarce resources are (1) **on-device testing on Kiran's Fire OS 6.7.1.1 stick**, which needs Kiran (developer mode/ADB is not on yet, and there is no Fire OS simulator on the box), and (2) **calendar time for integration and the video**.
- **Device risk:** exact stick model unknown. Fire OS 6 = Android 7.1 / API 25; Fire OS 6 sticks have roughly 1–1.5 GB RAM. Plan for the weakest (≈ 1 GB), per spec §2.7.

## Decision

### 1. Don't freeze UX. Build the screens in their final design the first time (Tier 1), and treat motion and extras as gated (Tier 2).

The "freeze visual polish" rule was written for a solo human whose polish hours compete with core-loop hours. Here, polish isn't a separate pass: the tokens, focus treatment, Spotlight + row layout and states *are* how the TV and phone screens get built. Building the plan's plain vertical list first and restyling it later would cost more, not less. The real scarce resource is time on the stick, so the rule becomes: **anything that needs extra stick time or adds animation risk waits for the gate. Everything that is just "build the screen right" happens now.**

### 2. Tier 1: build now, alongside the TV/PWA tasks (must ship)

The reviewer's Tier 1, with these **modifications** (marked ➕/➖):

| Area | Tier 1 scope |
|---|---|
| Foundations | UX-03 tokens (first task; both apps). ➕ **UX-02 fonts: Inter *and* Fraunces SemiBold, static TTFs** (moved up from Tier 2, see rationale). UX-04 poster generator. |
| TV home | UX-06 Focusable (scale + double ring, no glow), UX-07 Spotlight (pick / rec / fallback / newest / empty variants; ➕ "newest" added per UXQ-06), UX-08 row (static "New" pill + "n new" chip; no slide-in), UX-09 focus wiring + MF-5 Back rule, UX-10 Mark seen button + ☰ sheet (☰ only if the remote has it). |
| TV flows | UX-12 pairing (plain auto-renew, static ✓ success screen, 1.5 s auto-continue), UX-13 handoff (all 3 variants), UX-14 subset: loading, empty, offline banner, full error, unpaired banner, `DEMO DATA` pill. |
| Phone | UX-15 send-in-10-s, UX-16 pairing + cold-scan message, ➕ **UX-17 phone states** (the reviewer left it untiered; a send flow without error states isn't shippable). |
| Cheap review items pulled in from UX-22 ➕ | Handoff tip **4 s, pausing on any D-pad press** (replaces 2.5 s; OK still opens now); mandatory "▲ Tonight's pick" hint in the rec state; one-line transition copy when the pick is marked Seen; lamp dot only on real (bedrock) picks; sticky Send footer + chip rule (replace when the note is empty, else append with ", "); define "n new" as "since the last session that ended > 30 min ago", never reset while the app is open. Each is ≤ 30 min and copy/logic only, no animation. |
| Fallback art | ➕ **One generic bundled fallback poster** (the cheap half of UX-05). |
| Verification + demo | UX-18 on-device readability + perf check, ➕ UX-19 reduced to *labels on every focusable + High Contrast Text check* (VoiceView best-effort, logged as friction), ➕ UX-20 final demo art after the Oct 21 name check, ➕ UX-21 shot list + captions (incl. the split-screen phone+TV send and an optional ~10 s QR-pairing beat). |

**Perf rules are part of Tier 1, not polish:** spec §2.7 as written (960×540 backdrops, debounced Spotlight swap without backdrop crossfade, virtualized row ≤ ~20 items, transform/opacity only, no blur/shadow/glow). The "hold Right 3 s across 20 cards" check on the stick is a Tier 1 exit criterion.

### 3. Tier 2: gated, flagged, individually droppable

**Gate U2 (condition, not a date):** Tier 2 work may start only when **all** of these are true:
1. **Core loop green on Kiran's stick:** phone send → card in the TV row, against the live API (plan Gate 1, but on the real device).
2. Tonight's pick (stub or bedrock, plus fallback) and the handoff screen work with **no dead ends**.
3. The Tier 1 **perf check passed on the stick** (hold Right across 20 cards: no hitch, no lost keys).

**Calendar limits:** target Gate U2 by **Wed Oct 14**; the **last day to start** a Tier 2 item is **Fri Oct 16**; Tier 2 **feature cutoff is end of Sun Oct 18** (the plan's rehearsable-demo gate). Mon Oct 19 is fixes only, because recording starts Oct 20. If Gate U2 isn't green by Fri Oct 16, Tier 2 is dropped entirely and the time goes to the core loop.

**Rules for every Tier 2 item:** behind its own flag, default **off** until it passes on the stick (no visible hitch, reduce-motion path works); an item that hasn't passed by Oct 18 stays off and ships as Tier 1 behaviour. No item may make a Tier 1 screen depend on it.

**Tier 2 order (by value in the video and to a first-time judge):**
1. UX-11 **return prompt** ("Did you watch it?", ≥ 20 min, default focus Not yet). It closes the loop on camera. If it misses the cutoff, the storyboard's 0:50 beat uses the Mark seen button instead.
2. "New" card **slide-in** (the 0:17 storyboard beat).
3. Tonight's pick **reveal** (400 ms fade, once per evening).
4. **Pair-success** check-mark animation.
5. **First-run coach mark** (lower value now that Mark seen is a visible button).
6. Pairing **renew cap** + "Still there?" (UXQ-13).
7. Full per-mood **CircleArt** PNG set (rest of UX-05).
8. Duplicate-send hint on the phone.

### 4. Cut until after submission

"Watched ✓" for the sender (UXQ-07); "Thanks, Priya ♥"; full VoiceView support (best-effort only, documented); greeting-by-clock tweaks (just keep "Good evening" true when filming); "Press back again to exit" toast.

### 5. Other UX questions decided here (design calls that don't need Kiran's personal knowledge)

| UXQ | Decision |
|---|---|
| UXQ-01 layout | **Spotlight + one "From your circle" row** (spec §5.1). It's Fire TV's own pattern and what the Amazon starter already builds with. TV-10/TV-11 should be built directly in this layout, not the plan's vertical list. |
| UXQ-02 palette | **"Evening Circle" as specified** (§2.1, contrast verified). Kiran has no stated brand ("K7 Apps" is only a publisher name). A brand-color override remains his call and is cheap through tokens until Oct 18. |
| UXQ-03 fonts | **Inter + Fraunces SemiBold, static TTFs, both in Tier 1.** Fallback: Inter-only if the OFL check fails or the APK grows > 1 MB from fonts. |
| UXQ-05 detail screen | **Dropped.** The Spotlight is the detail view; TV-22 closes as "not adopted". |
| UXQ-06 no pick | **Show the newest rec** in the hero ("NEWEST FROM YOUR CIRCLE"); the empty state only at 0 recs. |
| UXQ-07 Watched ✓ | **After submission** (see §4). |
| UXQ-08 chips | **As listed.** |
| UXQ-09 extra titles | **Yes**, pending the Oct 21 name-collision check. |
| UXQ-10 honesty in video | **Agree.** Never show a stub pick as "Tonight's pick" in the video; record a real Bedrock pick or the labelled "Most recommended this week". The live send is a different title from the pick (MF-3). |
| UXQ-11 avatars | **Initials on soft colors**, no photos. |
| UXQ-13 renew cap | Plain auto-renew in Tier 1; cap is Tier 2. |
| UXQ-14 row ends | **Stop at the ends**, no wrap. |
| UXQ-15 `candidateCount` | **Keep the number-free line; don't change the contract before submission.** The number adds little, costs contract churn with another worker, and with Bedrock blocked it would mostly describe stub picks. Revisit after submission. |
| UXQ-16 cold scan | **Message** ("Open your WatchCircle link first, then scan again") + judges' instructions in the README that open the profile link first. **No profile picker**: it needs a new API read and weakens the identity model (ADR-0002). |

**Left open for Kiran** (personal knowledge): UXQ-04 (does his remote have ☰? The design no longer depends on it), UXQ-12 (TV size and viewing distance), brand colors (only if he has any). The stick's exact model can be read over ADB (`ro.product.model`) once developer mode is on, so it doesn't need to be asked.

## Rationale (tied to judging, risk and the device)

- **Design (25%)** is judged as "complete, coherent, device-appropriate": legible at 10 ft, intentional D-pad focus, no dead ends, every state handled. That is Tier 1. Animations are garnish on a 75 s video; a stutter or a focus trap on camera costs far more than a missing reveal.
- **Tech Implementation (25%)** rewards something that actually runs on Fire TV. The core loop on the real stick is still red, so anything that competes with it for **stick time** (Kiran's time) waits. Agent coding time is cheap; Kiran's testing time is the bottleneck.
- **Quality of the Idea / Impact (25% each)** come through the friends' words on the big screen, one grounded pick, and the < 10 s phone send. All of that is Tier 1 content. A distinctive display face (Fraunces) is the cheapest way to look like a product rather than a generic streaming clone, which is why it moves up: static TTFs have no runtime cost on API 25.
- **Device performance:** an older 1–1.5 GB Fire OS 6 stick is where animated UIs on React Native most often stutter. Making every Tier 2 item flagged, off by default and stick-verified means the worst case is "plain but smooth", never "pretty but janky".
- **Schedule:** a hard Oct 18 cutoff leaves Oct 19 for fixes and Oct 20–21 for the video with a stable build, consistent with the plan's freeze on Oct 22.

## Alternatives considered

- **Freeze all UX polish until the gate is green (plan buffer rule as written):** rejected. It contradicts Kiran's direction, would mean building screens twice, and saves agent time that isn't scarce.
- **Reviewer's split unchanged with Tier 2 after Oct 18:** rejected on timing. "After Oct 18" leaves only the Oct 19 buffer day before recording, so Tier 2 would never land or would land untested.
- **Everything at once (no tiers):** rejected. Animations add stick-testing load and stutter risk on a device we can't simulate.

## Consequences

- [ux-tasks.md](../tasks/ux-tasks.md) scope-tier section now holds the decided tiers; [open-questions-ux.md](../open-questions-ux.md) marks UXQ-01/02/03/05/06/07/08/09/10/11/13/14/15/16/17 decided.
- **Follow-ups for other owners (not edited here, to avoid conflicts):**
  - `docs/specs/ux-design.md`: v1.2 to reflect this ADR (Fraunces in Tier 1; handoff 4 s with pause; "n new" definition; transition copy; tier labels now decided; status line).
  - `docs/tasks/tv-app-tasks.md`: TV-10/TV-11 retarget to Spotlight + row; TV-19 timer 4 s; TV-22 closes as not adopted.
  - `docs/plan/MVP_PLAN_v2.md` §6 buffer rule: note that ADR-0009 supersedes the "freeze visual polish" clause.
  - `docs/decisions/README.md`: add ADR-0009 to the index.
- **Dependency on Kiran:** Gate U2 and every Tier 1 perf check need the app on his stick. Developer mode/ADB should be on by **Wed Oct 14** at the latest; otherwise Tier 2 slides toward being dropped and perf is unverified going into the video.
