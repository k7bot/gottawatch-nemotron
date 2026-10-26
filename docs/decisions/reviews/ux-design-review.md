# Independent review: UX & visual design (task UX-01)

- **Reviewer:** a fresh, skeptical senior TV/mobile product designer. Not the author. Edited no specs, mockups or code.
- **Date:** 2026-10-11 (Sun, ET), reviewed at commit `2bb36e8`.
- **Scope:** `docs/specs/ux-design.md` (Draft v1), `docs/research/ux-research.md`, `docs/tasks/ux-tasks.md`, `docs/open-questions-ux.md`, `docs/specs/tv-app.md`, `docs/plan/MVP_PLAN_v2.md` (§2–4, §6–9), all 7 PNGs in `docs/design/mockups/` plus their HTML/CSS sources. Spot-checked the TV starter in `apps/tv` (Amazon multi-TV sample) to see what the design will actually be built on.
- **Context:** Fire TV track, deadline Fri Oct 23 2026 12:00pm PT. Target device: Kiran's older Fire TV Stick on **Fire OS 6.7.1.1 (Android 7.1, API 25)**. Video under 3 min, made-up titles only. Four equally weighted judging criteria, one of which is Design. Kiran: UX must be excellent, intuitive and engaging, as important as function.

## Verdict: **APPROVE WITH CHANGES**

This is a strong design. It is unusually honest, well-researched and platform-native. The Spotlight + one row layout (P1) is the right call: it's Fire TV's own row + mini-details pattern (R1) and Google's immersive list (R15). It's also the layout the starter sample already builds with `react-tv-space-navigation`, so it's lower risk than the plan's vertical list, not higher. The palette, type scale, honesty rules, phone send flow and pairing design are all approvable as written.

It is **not ready to build as-is**, for three reasons:
1. Several visual and accessibility promises **can't be built on the stack we actually have**: glow, the VoiceView acceptance bar, and the focus APIs named in the spec.
2. There are **two honesty or continuity bugs** in the demo story and in the "Picked from N titles" line.
3. **Scope is too big for 12 days** while the Oct 11 end-to-end gate is still red. The plan's own buffer rule says to freeze visual polish if that gate slips, which collides with Kiran's new direction, and only Kiran can resolve that.

None of this needs a redesign. Every must-fix below is a spec edit or a cut.

## What I verified (cheaply, on the box or the web)

| Check | Result |
|---|---|
| Palette contrast table §2.1 (WCAG formula, Python) | **Correct**: every listed value reproduced exactly (text 16.7/15.2/13.0, text-3 7.1/6.5/5.6, `bg` on accent 10.3, etc.). |
| R3: Fire TV Menu button + "onscreen hint" (fetched Amazon page, updated May 27 2026) | **Confirmed.** Also confirms Fire OS 6 = Android 7.1 / API 25. |
| Starter app stack (`apps/tv/apps/expo-multi-tv`) | Expo 54, `react-native-tvos ~0.81`, **`newArchEnabled=false`**, minSdk 24, focus via **`react-tv-space-navigation` 6.0.0-beta1** (JS focus, not native `TVFocusGuideView`), key input via `react-native-keyevent`. |
| Remote key map (`packages/shared-ui/src/app/remote-control/RemoteControlManager.android.ts`) | **No Menu key (KEYCODE_MENU = 82) is mapped.** `SupportedKeys` has no `Menu`. P4 needs a key-map change on Android and an equivalent on Vega. |
| RN `boxShadow`/`filter` (reactnative.dev 0.76 blog + 0.82/0.83 style docs) | **New Architecture only.** Outset shadow needs Android 9+, blur needs Android 12+. On Android, `shadowColor` needs API 28+. **So the spec's white glow (§2.6c) can't render on this app/device as specified.** |
| `react-tv-space-navigation` accessibility doc (GitHub `docs/accessibility.md`) | Accessibility is **"experimental"**: TalkBack users "need to press enter to grab focus... not standard at all", and the library "could not find a way to properly intercept the accessibility focus event". **The VoiceView bar in §11/§14/UX-19 is unlikely to be achievable.** |
| Mockup CSS vs. the spec's own floors | Several TV texts sit **below the 24 px floor**: "New" pill 20 px, "3 new" chip 22 px, key-cap hints (`.kbd`) 22 px, `DEMO DATA` pill 20 px, avatar initials 18–20 px. Phone note/recipient chips are **36 px tall**, below the spec's own 44 px target rule. |
| Mockup geometry vs. the 96/54 px safe area | `tv-handoff.html` places the poster at **x = 40 px** (outside the 96 px inset). In `tv-home-*`, the row cards plus overlapping avatars end at about y ≈ 1030 **before** the 1.08× focus scale, past the 1026 px bottom edge of the safe area. |
| Pairing auth (`docs/specs/api.md` line 58) | `POST /pair/complete` requires a **profile** token, so a cold phone-camera QR scan of `/pair?code=…` has no identity (see MF-6). |
| Not verified | Whether Kiran's remote has ☰ (UXQ-04); which stick model 6.7.1.1 is (2nd-gen Stick at ~1 GB RAM vs. Stick 4K at 1.5 GB; perf budget differs a lot); whether `AccessibilityInfo.isReduceMotionEnabled()` reflects Fire OS 6. |

## Must-fix (ranked; do before UX-06 and later build tasks)

**MF-1 · Re-target the spec to the real stack: focus APIs, Menu key, no glow.** *(spec edit; about 30 min)*
- §5.1 names `TVFocusGuideView autoFocus` / `hasTVPreferredFocus`, but the app uses `react-tv-space-navigation`. Rewrite the focus map in its terms:
  - `SpatialNavigationRoot`
  - a vertical node containing [header, spotlight actions, row]
  - a horizontal `SpatialNavigationVirtualizedList` for the row
  - `DefaultFocus` for initial focus
  - last-focused restore per node (confirm the lib's default)
- Add **`Menu` to `SupportedKeys`** and map keycode 82 on Android (plus the Vega equivalent) as a named sub-task of UX-10. Without it, P4 silently does nothing.
- **Remove the glow (§2.6c)** or replace it with a pre-rendered 9-patch PNG halo. Recommendation: drop it. Focus = scale + a **double ring** (4 px `bg` gap ring + 4 px white ring) built from two nested bordered Views. That's cheap, survives High Contrast, and matches the mockups closely enough.
- Note in §2.5 that the **border fade can't use the native driver** (only transform/opacity can). Animate the opacity of an absolutely positioned ring overlay instead of `borderColor`.

**MF-2 · Make "Mark seen" a real, focusable button on the Spotlight CTA row; keep ☰ as a shortcut.** *(UX/IA)*
- In `tv-home-pick.png` the "☰ Mark seen" hint sits right next to "Watch tonight" and **looks like a button**. A first-time user will press Right, nothing will happen, and the UI feels broken. That's the most likely "unintuitive" moment a judge hits.
- Make it a secondary pill **[Mark seen]**, reachable with Right from the CTA. This is the spec's own no-Menu-key fallback; promote it to the default. It also removes the hard dependency on UXQ-04 and on MF-1's key mapping for the pick.
- Row cards keep ☰ → actions sheet + the on-screen hint (R3) + the first-run coach mark. That's discoverable enough for a secondary action.

**MF-3 · Fix the demo-story continuity, which is currently a quiet honesty problem.** *(storyboard §12)*
- At 0:07 Priya **sends** *Kestrel Bay* live. At 0:27 Tonight's pick says "*Kestrel Bay*: Priya and Sam both loved it". But the pick is computed **once per household per night and cached** (ADR-0003), and the opening shot (0:00) already shows a pick. Viewers will infer the AI reacted to the send they just watched, which the system doesn't do.
- Fix: have the live phone send be a **different** title (for example Maya → *Saltwater Static*), landing in the row with its "New" pill. Tonight's pick stays *Kestrel Bay*, grounded in **seeded** notes from Priya and Sam, and the VO says "picked from what your circle sent this week".
- The return prompt (0:50) needs a real elapsed gap, see MF-7. Use an honest "Later that night" caption cut.

**MF-4 · "Picked from N titles your circle sent": N must come from the server or be dropped.** *(§5.1, P6, §7.3)*
- The spec sets N = row count. That isn't the pick's candidate set: the row shows up to 50 feed items, while the candidate query covers unseen recs in the pick window. A wrong number in the one AI-trust line contradicts the honesty principle (§1.6, R35 fake social proof).
- Either add `candidateCount` to `TonightResponse` (a one-field contract change, which contradicts "No API changes needed" in §13, so update that line), or use number-free copy: "Chosen only from titles your circle sent."
- Also drop the stacked avatars on that line unless they come from the pick's actual grounding recs.

**MF-5 · Back behavior on Home: Back in the row returns to the top first, then exits.** *(§5.1)*
- "Back on Home → exit app" from deep in the row is a common TV annoyance and data loss for the user's place.
- Standard TV pattern: **Back from the row (or any non-default focus) → focus to the Spotlight CTA** (and the Spotlight switches back to the pick). **Back on the CTA → exit.**
- Consider a "Press back again to exit" toast only if Amazon certification allows it. Otherwise exit directly on the second Back.
- Also confirm in code that Back reaches JS: the starter maps keycode **67 (DEL)** to `Back`, not 4 (`KEYCODE_BACK`). Back is probably handled by `GoBackConfiguration`/navigation, but **test it on the stick**.

**MF-6 · Define the cold QR-scan path (phone has no identity).**
- The pairing QR targets `/pair?code=…`, and `POST /pair/complete` needs a profile token. A camera scan opens the default browser. On iOS, an **installed PWA has separate storage from Safari**, so even a returning user may land with no identity.
- The spec needs this state: "Open your WatchCircle link first, then scan again" (or a "Who are you?" seeded-profile picker if plan §4 "Seeded-profile picker" is in scope; it is listed in IN).
- Put this in §6.4 and UX-16, and make sure the **judges' testing instructions** use the profile link first.

**MF-7 · Return prompt: add a minimum elapsed time and a safe default focus.** *(§5.1, UX-11)*
- As specified, it fires on *any* foreground return within 6 h, including 10 s later when the launch failed, the user changed their mind, or the handoff only opened the app's home. "Did you watch it?" after 10 s reads as broken.
- Fire only if ≥ **20 min** elapsed (proposed) and the handoff reached a launched state.
- Default focus on **[Not yet]**, or keep [Yes] but rely on the Undo toast. Pick one and write it down: an accidental OK silently hiding a title is the costliest mis-press on this screen.
- Add a dev flag (`RETURN_PROMPT_MIN_MS`) so the video can show it honestly after a caption cut.

**MF-8 · Enforce the spec's own legibility and safe-area floors in the mockups and tokens.**
- Bump to ≥ 24 px: "New" pill, "n new" chip, key-cap hints, `DEMO DATA` pill, avatar initials (40–52 px avatars need ≥ 22–24 px initials).
- Keep the focused card (1.08×) and its avatar **inside y ≤ 1026**: shrink cards to about 200×300 or end the Spotlight at about y 520.
- Move the handoff poster inside x ≥ 96.
- Phone chips ≥ 44 px tall.
- Poster titles are rendered **in the image** at about 25 px Fraunces, which breaks "Fraunces only ≥ 48 px". Accept that for art, but have UX-04 assert title contrast ≥ 4.5:1 against its own scrim. The table in §2.1 doesn't cover text-on-art, and a slate mood like *Glasshouse Weather* is the weakest case.

**MF-9 · Make the accessibility bar honest for this stack.** *(§11, §14, UX-19)*
- Given the library's own "experimental" TalkBack status, rewrite UX-19's done-when as follows:
  - labels on every focusable via `useSpatialNavigatorFocusableAccessibilityProps`
  - High Contrast Text + Text Banner verified
  - VoiceView **best-effort, documented limitation** with what works
- Log it in `FRICTION_LOG.md`/`PRODUCT_FEEDBACK.md`. That's genuine, useful feedback for Amazon (the sample's focus lib vs. VoiceView), and it can earn friction-log bonus credit.
- Don't promise "VoiceView reads every focusable element" (§14) as acceptance.

**MF-10 · Performance budget for an old Fire OS 6 stick (Spotlight swap is the risk).**
- Every Left/Right in the row swaps a **full-bleed 1920×1080 backdrop** with a 200 ms crossfade. On Fire OS 6 hardware (the MediaTek quad-core sticks have about 1–1.5 GB RAM; exact model unverified), decoding a full HD bitmap per keypress, two at once during a crossfade (≈ 8 MB ARGB each), is the most likely source of stutter and dropped key repeats. Requirements:
  - **Debounce Spotlight updates** about 200–300 ms after focus settles; the focus ring moves instantly.
  - **Backdrops at 960×540 JPEG**, upscaled. The art is abstract gradients, so the loss is invisible.
  - Preload the neighbouring cards' backdrops.
  - Swap without a crossfade, or fade **text only**, when running on a low-RAM device or under reduce-motion.
  - Posters at 440×660 are fine. Cap the row at about 20 items rendered (virtualized list).
  - **UX-05 should be a bundled pre-rendered PNG set + one generic fallback**, not `react-native-svg` drawing posters live in the row.
  - Use static, not variable, font files (Android API 25 can't drive variable-font axes; ship `Inter-*.ttf`/`Fraunces-SemiBold.ttf` statics).
- Add a done-when to UX-06/UX-08: "hold Right for 3 s across 20 cards on Kiran's stick: no visible hitch, no lost keypresses."

**MF-11 · Scope: decide a UX cut line with Kiran now.** *(tasks; needs Kiran)*
- The Oct 11 end-to-end gate is red (backend deploy blocked). Plan §6 says "if the Oct 11 gate slips… freeze visual polish," while Kiran now says UX is as important as function. **Kiran must choose**; don't resolve this silently.
- My recommendation is to keep UX but tier it:
  - **Tier 1 (ship regardless; build alongside TV-xx):** UX-03 tokens, UX-06 Focusable (MF-1 version), UX-07 Spotlight (pick/rec/fallback/empty only), UX-08 row, UX-09 focus wiring (+ MF-5), UX-10 (MF-2 button + ☰ sheet), UX-12 pairing (no renew cap, no success animation beyond a static check), UX-13 handoff, UX-14 subset (loading, empty, offline banner, full error), UX-15, UX-16 (+ MF-6), UX-04 posters, UX-18 on-device check.
  - **Tier 2 (only after the Oct 18 gate):** UX-11 return prompt, UX-02 Fraunces (Inter-only until then; it's cheap but not free), first-run coach mark, "New" slide-in animation, pick "reveal" animation, pair-success animation, renew cap, UX-05.
  - **Cut:** "Watched ✓" for senders (UXQ-07) until after submission.
- The phone and TV share tokens, so UX-03 is the one task to do first.

## Nice-to-have (ranked)

1. **Handoff timing is too short to memorize.** 2.5 s to read and remember "*Kestrel Bay*" plus "start at episode 2" from 10 ft is tight for a household. Use **4 s**, pause the countdown on any D-pad press, and keep OK = open now. Separately, consider whether the search-box frame looks like an **editable field** (users may try to type). A subtle "type this" label above it already helps; keep the frame non-focusable.
2. **Make the video's magic moment visible: split-screen phone + TV.** The single most "wow" beat is a phone send landing on the TV seconds later. Show both at once. For the video, use a demo poll interval (for example 5 s) or a tasteful cut, and never imply sub-second push. Consider a 10 s **QR pairing beat** ("no account, no typing on the remote"), which is also a Design-criterion talking point. That still leaves room under 90 s.
3. **Spotlight "Up" ambiguity.** When a row card is focused, Up goes to *Tonight's pick*'s CTA, not the previewed title. The "▲ Tonight's pick" hint covers it; keep that hint mandatory in the rec state and in the accessibility hint.
4. **"n new" semantics.** Define "last opened" as the last session that lasted > N minutes or ended > 30 min ago. Otherwise a handoff and quick return wipes the "New" pills mid-evening. Never reset the counter while the app is open.
5. **Marking the pick Seen flips the hero to "Most recommended this week".** That's correct per the API but jarring. Add a one-line transition copy ("Okay, here's what's most recommended this week") or show the newest rec. Check this doesn't happen on camera.
6. **Compose sheet on small phones / with the keyboard up.** Make the Send button a **sticky footer** above the keyboard. Specify whether chips **replace** or **append** to the note (the mockup shows "Start at episode 2, trust me.", i.e. edited). Recommend: replace when the field is empty, append with ", " otherwise. Recipients: on first use the default is visible and selected, which is fine (R35). Keep it.
7. **Phone results:** show "from Kiran's household's feed already" if the title was already sent recently (prevents duplicate sends). It's cheap client-side from "Your recent sends".
8. **Engagement without dark patterns:** a future (post-MVP) one-press **"Thanks, Priya ♥"** from the TV return prompt is the most natural loop closer, better than a sender-side "Watched ✓" list. Note it in the stretch list; don't build it now.
9. **Greeting** depends on the device clock. Harmless, but if the video is shot in daylight, record with "Good evening" true or drop the greeting from the shot.
10. **Fallback overline in accent color**: fine, but use the same lamp dot as the pick only for real picks, so color isn't the cue for "AI vs. fallback". The text already distinguishes them.

## Area-by-area notes (short)

- **D-pad intuitiveness:** good overall: one default action, a 1-D row, no wrap (UXQ-14 "stop at ends" is right for ≤ 20 items). The weak spots are MF-2 (hint looks like a button), MF-5 (Back) and nice-to-have #3 (Up meaning).
- **10-ft legibility:** the type scale is right (body 28, label floor 24, R1-backed). The mockups break their own floor in five places (MF-8). Quotes at 34 px with 2-line max is good. Validate on Kiran's TV (UX-18, UXQ-12).
- **Engagement / ethics:** excellent. The don't-list is right. "3 new", friend names and words, and the Sent ✓ TV preview are honest and warm. The phone preview card is a genuinely nice touch.
- **Phone 10-s flow:** realistic (≈ 6–8 s). The risk is iOS not raising the keyboard on auto-focus (already flagged). The stopwatch test (UX-15) is the right acceptance.
- **Pairing:** strong (RFC 8628-faithful, 3+3 code, calm countdown, confirm-on-QR). The gap is the cold-scan identity state (MF-6).
- **First-run / empty:** good. "Your circle is quiet tonight" is warm. The seeded household makes empty rare in the demo; still screenshot it for UX-14.
- **Accessibility:** contrast verified; never color alone is honored. The VoiceView bar is unrealistic on this focus library (MF-9).
- **Performance:** blur is already banned, which is good. The glow is impossible (MF-1) and the backdrop swap is the real risk (MF-10).
- **Scope:** about 21 tasks at 0.5–2 h on top of the TV tasks, with the core loop still red. Needs a tier decision (MF-11).
- **Will it wow judges?** The visual direction is distinctive (warm, quiet, human, unlike generic dark-grid streaming clones), and "your friends' words on the big screen" plus "one grounded pick" is a clear story. Fix MF-3 so the AI beat is unimpeachable and add the split-screen send (nice-to-have #2), and the 75–90 s video should land.

## Answers I'd suggest Kiran give to the UXQ list (reviewer's view, for his decision)

UXQ-01 Spotlight + row: **yes**. UXQ-02 palette: **yes**. UXQ-03 fonts: **Inter now, Fraunces in Tier 2**. UXQ-04 Menu: **yes as shortcut, plus a visible Mark seen button (MF-2)**; still tell us whether your remote has ☰. UXQ-05 drop detail screen: **yes**. UXQ-06 newest in hero: **yes**. UXQ-07: **post-submission**. UXQ-08 chips: fine. UXQ-09 titles: fine, pending the Oct 21 check. UXQ-10 honesty: **agree, plus MF-3**. UXQ-11 initials: **yes**. UXQ-12: info needed. UXQ-13 renew cap: **Tier 2**; plain auto-renew is fine for MVP. UXQ-14: **stop at ends**.
