# UX & visual design spec: Gottawatch (TV + phone)

> **2026-10-13:** user-facing "Watch tonight" / "Tonight's pick" are now "Watch" / "Top pick" (ADR-0016).

Status: **v1.2, Sun Oct 11, 2026.** Independent review: *approve with changes* ([reviews/ux-design-review.md](../decisions/reviews/ux-design-review.md)); must-fixes MF-1…MF-10 applied in v1.1. **Scope tiers (MF-11/UXQ-17) and the design-call UXQs were decided in [ADR-0009](../decisions/ADR-0009-ux-scope-and-pacing.md)** (delegated by Kiran to expert review); v1.2 applies them (see §15). "Tier 1" = build now, "Tier 2" = gated behind Gate U2, flagged and off by default (ADR-0009 §3). Research and citations: [research/ux-research.md](../research/ux-research.md) (R1–R36). Tasks: [tasks/ux-tasks.md](../tasks/ux-tasks.md). Questions for Kiran: [open-questions-ux.md](../open-questions-ux.md) (UXQ-xx). Mockups: [design/mockups/](../design/mockups/).

Conventions:
- **(proposed)** = a choice made by the design agent, not by Kiran and not by a platform rule.
- A citation like "(R1)" = backed by that research source.
- This spec **does not change** [specs/tv-app.md](tv-app.md). Where it disagrees, §13 lists the proposed edits. Until they're accepted, tv-app.md wins for behavior and this doc wins for look and feel.

---

## 0. Design big picture (read this first)

**Product feeling (proposed):** *"Your friends are on the couch with you."* WatchCircle should feel like a warm, quiet living room in the evening, not like a catalog. Every screen answers one question:

| Moment | Question the screen answers | Where |
|---|---|---|
| Open the TV | "Did someone think of us?" | TV home: Spotlight + "From your circle" row |
| Can't decide | "What should we watch tonight?" | Tonight's pick, the default focus |
| Ready | "How do I start it?" | Search-tip / handoff, which carries the friend's tip along |
| Phone, any time | "Tell them about this, fast" | PWA: search → tap → chip note → Send (< 10 s) |

**Three things that make it engaging (honestly):**
1. **People first, posters second.** The friend's face, name and words are as prominent as the artwork. Netflix found artwork drives choice (R19), so posters stay big. Our differentiator is "who" (R24 "show someone you're thinking about them").
2. **One decision, not a list.** Tonight's pick owns the hero slot and starts with focus, so one press of OK is a decision (decision fatigue: R20).
3. **The loop closes.** After you return from the streaming app, the TV asks once "Did you watch it?" That clears the feed and (stretch) tells the friend. No streaks, nags or fake counts (R35).

---

## 1. Design principles (proposed, each traced to research)

1. **Lean back, one press.** Every screen has one obvious default action with focus already on it (R1 "clear set of actions", implemented with `DefaultFocus` from `react-tv-space-navigation`, the focus library the starter app uses).
2. **Friends' words are the content.** Show notes as large, quoted text attributed to a named person. Never paraphrase a friend on the TV, except in Tonight's pick, whose reason must be grounded in their notes (ADR-0003).
3. **Low density, big targets.** At most ~7 posters visible and 1 hero. Text ≥ 28 px body (R1).
4. **Focus is unmistakable.** Use scale + a double ring (dark gap + white ring) together and never color alone (R5, R13, R17). No glow: it can't render on this stack (§2.6).
5. **Never a dead end.** Every state has a focused next step (tv-app §3.5).
6. **Honest by construction.** Real counts, real names, labeled fallbacks, a visible demo/mock badge, no dark patterns (R35).
7. **Cheap to render.** Fire OS 6 stick (older hardware): animate only opacity/transform, no live blur, pre-rendered gradients (UNVERIFIED performance; precaution).
8. **Trademark-safe by default.** Abstract generated posters, made-up titles, no service names in demo mode (plan §7).

---

## 2. Visual direction (proposed)

**Name:** *Evening Circle.* Deep ink-indigo backgrounds (cool, desaturated, per R1 "cool colors... work better"). One warm **marigold "lamp" accent** reserved for Tonight's pick and primary actions, like a single lamp on in a dark room. Friends each get a soft, desaturated identity hue, always paired with initials and a name.

### 2.1 Palette (TV and phone share it; phone uses the same dark theme)

| Token | Hex | Use | Contrast vs `bg` / `surface-1` / `surface-2` (computed with the WCAG formula, R32) |
|---|---|---|---|
| `bg` | `#0E1020` | App background | n/a |
| `surface-1` | `#171A2E` | Cards, panels | n/a |
| `surface-2` | `#23273F` | Raised/focused surfaces, inputs | n/a |
| `text` | `#F4F1EA` | Primary text (warm white) | 16.7 / 15.2 / 13.0 |
| `text-2` | `#BFC2D6` | Secondary text (meta, labels) | 10.7 / 9.7 / 8.3 |
| `text-3` | `#9A9EB8` | Tertiary (timestamps, hints) | 7.1 / 6.5 / 5.6 |
| `accent` (marigold) | `#F2B45A` | Tonight's pick overline, primary button fill, progress | 10.3 / 9.4 / 8.0; `bg` text on `accent` = 10.3 |
| `focus` | `#FFFFFF` | Focus border | n/a |
| `friend-sky` | `#86BDEB` | Friend identity (e.g., Priya) | 9.4 / 8.6 / 7.3 |
| `friend-sage` | `#9ED3A9` | Friend identity (e.g., Sam) | 11.1 / 10.1 / 8.6 |
| `friend-lilac` | `#D4A9E0` | Friend identity (e.g., Maya) | 9.5 / 8.6 / 7.4 |
| `friend-coral` | `#F08F7F` | Friend identity (4th) | 8.0 / 7.3 / 6.2 |
| `danger` | `#F59A8E` | Errors (text + icon, never alone) | 8.9 / 8.1 / 6.9 |

All text pairs pass WCAG AA (≥ 4.5:1) and most pass AAA (≥ 7:1). Friend hues are assigned deterministically from the person id (hash → 1 of 4), with **initials always shown** so color is never the only cue.

**Scrims:** hero art sits under a left-to-right gradient `bg` 100% → 0% (at ~60% width) plus a bottom gradient, so text always sits on near-solid `bg` (R14 "use a scrim").

### 2.2 Typography (proposed)

- **UI / body: Inter.** An open-source sans with large counters and even strokes, which suits the R12 legibility advice. **Display: Fraunces (semi-bold)**, a warm serif, used **only ≥ 48 px**: the wordmark, Tonight's pick title, and the hero title (R12: "personable fonts are best suited to bigger size text").
- Both fonts are bundled with the app as **static** TTFs (e.g. `Inter-Regular/Medium/SemiBold/Bold.ttf`, `Fraunces-SemiBold.ttf`); variable fonts are not used because Android API 25 can't drive variable-font axes (review MF-10).
- **Scope (ADR-0009):** Inter **and** Fraunces SemiBold are both **Tier 1**. Fallback: Inter-only if the OFL check fails or fonts grow the APK by > 1 MB.
- **License check needed (UX-02):** both are believed to be SIL OFL, but this is UNVERIFIED until we read the license files we ship.
- Fallback: Roboto (Fire OS system) / Helvetica Neue (R1 notes Amazon uses it).

**TV type scale** (1920×1080 layout px; line-height in parentheses):

| Style | Size | Weight | Use |
|---|---|---|---|
| `display` | 76 (84) | Fraunces 600 | Tonight's pick title, pairing code digits use `code` below |
| `headline` | 52 (60) | Fraunces 600 | Spotlight title for a focused rec, screen titles |
| `title` | 36 (44) | Inter 600 | Section headers ("From your circle"), dialog titles |
| `quote` | 34 (48) | Inter 500 | Friend notes, Tonight's pick reason (max 3 lines) |
| `body` | 28 (40) | Inter 400 | Instructions, helper text (**R1 minimum: 28 px**) |
| `label` | 24 (32) | Inter 600, +2% tracking | Meta (genre · runtime · year), timestamps, badges. **Floor: no TV text < 24 px.** Labels are bold/semi-bold and short, so they count as "large text" under WCAG (R32: 14 pt bold ≈ 18.5 px) |
| `code` | 112 (120) | Inter 700, tabular, 0.08em tracking | Pairing code |

Max line length for body/quote ≈ 34 em (~900 px) (proposed, R1 "keep... line width short").

**Phone type scale** (CSS px): display 32/38 Fraunces; title 22/28; body 17/24; label 14/20 semibold; caption 13/18 (only for non-essential text). Respect the user's browser font size (`rem`-based).

### 2.3 Spacing & layout grid

- **8 px base unit.** Common steps: 8, 16, 24, 32, 48, 64, 96.
- **TV safe area:** content inset **96 px left/right, 54 px top/bottom** (5%, R1/R11). Background art and scrims bleed to the edges (R11). Nothing focusable or textual sits outside the inset.
- **Focus headroom:** at least **24 px** gutter between cards so a 1.08× focused card never overlaps a neighbor (R17 "doesn't crowd").
- **Phone:** 20 px side margins; touch targets ≥ 44×44 px (our choice; WCAG minimum is 24×24, R34); primary button 56 px tall, bottom-anchored within thumb reach.

### 2.4 Shape, elevation, imagery

- Corner radius: TV cards 16 px, buttons 999 (pill), panels 24 px. Phone: cards 14 px, sheets 24 px.
- Posters 2:3. TV row cards are **200×300 px** (focused 1.08× ≈ 216×324); the focused card and its avatar must stay inside y ≤ 1026 (review MF-8). The hero art panel is 16:9 (R15).
- Avatars are circles with initials on the friend hue, `bg`-colored text. Photos are not used (no PII, trademark-safe) (proposed).
- Elevation is expressed as tonal surface (`surface-1` → `surface-2`) plus the focus ring. **No shadows or glows**: RN `boxShadow`/`filter` need the New Architecture (the app has `newArchEnabled=false`) and Android 9+/12+; `shadowColor` needs API 28+, and the stick is API 25 (review MF-1).

### 2.5 Motion (proposed values)

| Interaction | Animation | Duration / easing |
|---|---|---|
| Focus in/out | scale 1.0 → 1.08 (cards), 1.0 → 1.05 (buttons); the ring overlay's **opacity** 0 → 1 (an absolutely positioned ring View, not an animated `borderColor`, so it can use the native driver) | 150 ms, ease-out (in) / 120 ms ease-in (out) |
| Pressed (Select) | scale dips to 0.97 then returns (R1 "momentarily change to the selected state") | 90 ms + 120 ms |
| Spotlight content swap | **debounced**: update only after focus has rested 250 ms (the focus ring itself moves instantly); then fade **text** 150 ms; swap the backdrop **without** a crossfade (see §2.7) | 250 ms debounce + 150 ms |
| New card arrives | **Tier 2:** slides in from the right 40 px + fade. **Tier 1:** card appears instantly with a static "New" pill | 300 ms, once per card |
| Tonight's pick reveal (first load; Tier 2) | hero art fades from 0 → 1, overline lamp dot fades in | 400 ms, once per evening |
| Handoff progress | marigold bar fills over `HANDOFF_TIP_MS` (**4 s**, ADR-0009); **any D-pad press pauses** the countdown (the bar stops, OK still opens now) | linear |
| Pair success | **Tier 1:** static ✓ + "You're paired!"; **Tier 2:** check mark draws (600 ms) | auto-continue after 1.5 s |

**Reduce motion:** if `AccessibilityInfo.isReduceMotionEnabled()` is true (Fire OS behavior UNVERIFIED) or `prefers-reduced-motion` (phone, R33), replace slides/scales with instant state changes. The focus **ring stays**.

**Native-driver rule (MF-1):** only `transform` and `opacity` animate (native driver). Anything else (border color, size, layout) changes instantly. No autoplaying video or looping animation anywhere.

### 2.6 Focus treatment (the most important visual on TV)

Focused element = **all of**:
- (a) scale 1.08 (cards) / 1.05 (buttons, hero CTA)
- (b) **double ring**: a 4 px `bg`-colored gap ring + a 4 px white ring, built from two nested bordered Views in an absolutely positioned overlay (its opacity animates)
- (c) *(removed in v1.1: no glow, see §2.4)*
- (d) text on buttons switches to `bg` color on a white or marigold fill.

Unfocused cards sit at 100% opacity, so content doesn't look disabled. The focused row card also gets its title label shown beneath it. Satisfies R1, R5 (physical change survives High Contrast), R13 (scale + outline), R17 (distinct states).

States per focusable: `default`, `focused`, `pressed`, `disabled` (50% opacity, not focusable), `selected` (not needed in MVP).

### 2.7 Performance budget (review MF-10; target = Kiran's Fire OS 6.7.1.1 stick, exact model unknown, so assume ~1 GB RAM)

- **Backdrops:** 960×540 JPEG, upscaled to full screen (the art is abstract gradients, so the loss is invisible). Never decode two full-HD bitmaps per keypress.
- **Spotlight swap:** debounced 250 ms after focus rests; text fades, the backdrop swaps without a crossfade; preload the backdrops of the focused card's neighbours.
- **Posters:** 440×660 PNG (2× of 200×300 is 400×600; 440×660 is fine), loaded from bundled assets or CloudFront; never drawn live with SVG in the row.
- **Row:** virtualized (`SpatialNavigationVirtualizedList`), at most ~20 items rendered.
- **Effects:** no blur, no shadows, no glow; transform/opacity only.
- **Done-when for UX-06/UX-08:** holding Right for 3 s across 20 cards on Kiran's stick shows no visible hitch and loses no keypresses.

---

## 3. Trademark-safe placeholder artwork (proposed)

**Approach: generated abstract posters ("Circle Art").** Every demo-catalog title gets a poster generated deterministically from its title string. No photos, faces, real logos or real titles. The same generator draws a fallback poster when a real poster URL fails (tv-app §3.7).

- **Recipe:** seed = hash(title).
  - Pick 1 of 6 **moods**, each a 2–3 color gradient drawn from desaturated, TV-safe hues: *dusk* (indigo→rose), *tide* (teal→navy), *orchard* (sage→cream), *ember* (umber→marigold), *static* (cyan↔magenta), *frost* (slate→ice).
  - Pick 1 of 5 **motifs**, a single bold shape at poster scale: *horizon + sun disc*, *concentric rings*, *rows of dots (orchard)*, *wave lines*, *split block*.
  - Set the **title** in Fraunces near the bottom on a gradient scrim, with an optional tiny tagline-free "WC" mark.
  - Simple and high contrast, readable at 200 px (R19: simple images, few figures).
- **Hero/backdrop art (16:9):** the same recipe at landscape size, with the motif offset to the right so the left 55% stays calm under the scrim (R15 "align the subject to the top right").
- **Implementation:** a Node script (`tools/poster-gen`, UX-04) renders SVG → PNG at 2× (440×660 posters, 1920×1080 backdrops) for the demo catalog. The PNGs are uploaded with the demo catalog (`CATALOG_MODE=demo`, plan §5). On the TV, fallbacks use a **bundled pre-rendered PNG set + one generic fallback poster** (no live SVG drawing; MF-10). Poster titles are rendered **into the art** at about 25 px Fraunces; that's accepted for artwork (not UI text), but UX-04 must assert title contrast ≥ 4.5:1 against the poster's own scrim (weakest case: slate moods like *Glasshouse Weather*) (MF-8).
- The mockups in `docs/design/mockups/` use this recipe (rendered in HTML/SVG).
- **Demo titles used in mockups** (all made up; **each must pass the Oct 21 TMDB name-collision check**, plan §6):
  - *Kestrel Bay*, *The Quiet Orchard*, *Saltwater Static* (from the plan)
  - plus the **(proposed)** additions *Glasshouse Weather*, *Velvet Arithmetic*, *Ninefold Hollow*, *Harbor of Small Lights*, *Paper Lanterns at Low Tide*. See UXQ-09.
- **Personas:** Priya, Sam, Maya (plan) + household "Kiran's household" (OQ-18). Avatars use initials only.

---

## 4. Information architecture

### 4.1 TV (Fire OS first)

```
Boot (splash: wordmark on bg, ≤ 1 s)
 ├─ no token ──► Pairing ──(paired)──► Pair success (1.5 s) ──► Home [first-run coach mark once]
 └─ token ok ──► Home
Home  = Header + Spotlight (Tonight's pick by default) + "From your circle" row
 ├─ OK on pick / row card ──► Search-tip & handoff ──► (streaming app) ──► Return prompt ("Did you watch …?") on Home
 ├─ Menu (☰) on a focused title ──► Title actions sheet (Mark seen · Cancel)
 └─ Up to header ► About (version, TMDB attribution, Unpair, demo-grade note)
```
**(proposed):** no separate Title detail screen. The Spotlight shows the details of whatever has focus (immersive-list pattern, R15). This resolves OQ-05 as "not adopted" (see §13, UXQ-05).

### 4.2 Phone PWA

```
/u/<token>  ─► "Hi Priya" Home: search field (focused) + "Your recent sends"
   ├─ type ─► Results ─► tap ─► Compose sheet (optional note, recipients, where-to-watch) ─► Send ─► Sent ✓ ("On Kiran's TV within a minute")
   └─ "Connect a TV" ─► Enter code (or arrive via QR: /pair?code=… ─► "Is this the code on your TV?") ─► Paired ✓
Invalid/expired link ─► friendly dead-end with "Ask Kiran for a new link"
```

---

## 5. TV screens (1920×1080), states and focus

Layout coordinates are approximate and **(proposed)**. Mockups: `tv-home-pick.png`, `tv-home-row.png`, `tv-pairing.png`, `tv-handoff.png`.

### 5.1 Home (the main screen)

**Regions:**
1. **Header** (y 54–118):
   - Left: wordmark "WatchCircle" (Fraunces 40) + household chip "Kiran's household".
   - Right: greeting "Good evening" (`label`, time-of-day from device clock) + **About** button (gear icon + label, focusable). In mock mode, a `DEMO DATA` pill sits left of About (§9).
2. **Spotlight** (y ≈ 140–560, full-bleed art behind, scrim):
   - Shows the **focused item**: Tonight's pick by default, or the focused row card.
   - Content block, left 55%:
     - Overline (`label`, accent for the pick: "TONIGHT'S PICK"; `text-2` for recs: "FROM PRIYA · 2H AGO"). The marigold **lamp dot** before the overline appears **only on real `bedrock` picks** (ADR-0009), not stub, fallback or newest.
     - Title (`display` for the pick / `headline` for recs)
     - Meta line (`label`, `text-2`): "Series · 40-min episodes · 2024" (from runtime/genres/year when present)
     - Quote (`quote`, max 3 lines; **2 lines preferred** so the row keeps its space): the pick's `reason`, or the friend's note in curly quotes, with the avatar + name row above it. For the pick, the reason already names the friends, so there is no avatar row; the transparency line below the reason carries **no avatars** (MF-4). If several friends sent the same title, show stacked avatars and up to 2 notes ("Priya: …", "Sam: …") + "and 1 more".
     - Action row:
       - Pick: **[ ▶ Watch tonight ]** primary marigold pill (initial focus) + **[ ✓ Mark seen ]** secondary pill, a real focusable button reachable with Right (review MF-2). It works with or without a ☰ key.
       - Rec (row card focused): key hints only (`label`, `text-3`): "OK Watch now · ☰ Mark seen · ▲ Tonight's pick" (R3 on-screen hint for the Menu button; the ▲ hint is mandatory because Up goes to the pick, not to the previewed title).
3. **"From your circle" row** (y ≈ 628–1026):
   - Section title (`title`) + count chip "3 new". **"n new" (ADR-0009):** cards whose `createdAt` is after the end of the last app session that ended more than 30 min ago (client-side). The count never resets while the app is open.
   - One horizontal row of 200×300 poster cards, 32 px gutters, ~7–8 visible, scrolls horizontally keeping focus at slot 2 ("fixed focus position", proposed).
   - Each card: poster, friend avatar (48 px, initials ≥ 22 px) overlapping the bottom-left corner, "New" pill top-left if new. No title label under the focused card (v1.1): it wouldn't fit inside the safe area at 1.08×, and the Spotlight already shows the title.

**Grouping (proposed, relates to OQ-19):** the row shows **one card per title**. Multiple senders show stacked avatars. Seen is title-level on the server (tv-app §3.2), so one card per title matches it.

**Focus map (proposed, replaces tv-app §3.2's vertical list), in `react-tv-space-navigation` terms (MF-1):**
- Structure: `SpatialNavigationRoot` → one **vertical** `SpatialNavigationNode` containing, in order: [header node (horizontal: About)], [Spotlight actions node (horizontal: Watch tonight, Mark seen)], [row = horizontal `SpatialNavigationVirtualizedList`].
- Initial focus: `DefaultFocus` on **Watch tonight** (pick present) → else first row card → else the empty-state button.
- Down from the Spotlight actions → the row, landing on the last-focused card, else the first. **To verify in code:** whether the library remembers the last-focused child per node by default; if not, store the focused id and restore it (UX-09).
- Up from the row → Spotlight CTA. When the row has focus, the Spotlight shows the focused card. When focus returns Up, the Spotlight switches back to Tonight's pick.
- Right from Watch tonight → Mark seen; Left returns.
- Up from the Spotlight actions → About. Down from About → Watch tonight.
- Left/Right within the row moves one card; no wrap at the ends (proposed: wrap disorients with few items; R1 notes the system 1D list wraps, so this is a deliberate deviation, see UXQ-14).
- **OK** on the CTA or a card → Search-tip & handoff for that title.
- **Menu (☰)** on the CTA or a card → Title actions sheet. **Requires a key-map change:** the starter's `RemoteControlManager.android.ts` maps no Menu key (`SupportedKeys` has no `Menu`); add `Menu` and map Android keycode 82 (plus the Vega equivalent). This is a named sub-task of UX-10. Without it ☰ silently does nothing, which is why Mark seen is also a button (MF-2).
- **Back (MF-5):** Back from the row, About, or anything other than the default focus → focus returns to **Watch tonight** (and the Spotlight switches back to the pick). Back on Watch tonight → exit app (OS default). A "Press back again to exit" toast is **not** used unless Amazon certification is confirmed to allow it. **To test on the stick:** the starter maps keycode 67 (DEL) to `Back`, not 4 (`KEYCODE_BACK`); confirm Back reaches JS.
- Focus never jumps on poll refresh: new cards insert to the left of the focused card only if the focus index is preserved by id (tv-app §3.2 rule kept).

**States:**

| State | What shows | Focus |
|---|---|---|
| Loading (first) | Header; Spotlight skeleton (bars shimmer **off**, static `surface-1` blocks); 6 skeleton cards | none until data; no spinner-only screen |
| Populated, pick = `bedrock` | Overline "TONIGHT'S PICK" + reason + line **"Chosen only from titles your circle sent"** (`label`, `text-3`; number-free, MF-4). If the contract gains `candidateCount` (UXQ-15), the line becomes "Picked from {candidateCount} titles your circle sent"; never use the row count | CTA |
| Pick = `stub` | Same as bedrock in UI; **dev builds** add a small `stub` tag next to the overline (tv-app §3.3) | CTA |
| Pick = `fallback` | Overline "MOST RECOMMENDED THIS WEEK" (accent) + server reason (e.g., "Sent by 3 friends this week"). Never call it "picked for you" | CTA |
| Pick just marked Seen | The hero switches to the fallback/newest with a one-line transition note above the overline (`label`, `text-2`, ADR-0009): **"Marked as seen. Here's what else your circle sent."** (proposed copy), shown until focus moves | CTA |
| Nothing tonight (204 / error / < 1 rec) | **(proposed, OQ-11/UXQ-06):** the Spotlight shows the **newest rec** with overline "NEWEST FROM YOUR CIRCLE". If there are no recs at all → empty state | CTA "Watch now" |
| First run (just paired) | Populated + a one-time coach mark panel at the bottom right: "Your friends' picks land here. Use Mark seen (or ☰ on a title) when you've watched something." [Got it] (Tier 2) | Got it, then CTA |
| Empty (0 recs) | Spotlight art = generated "circle" motif; headline "Your circle is quiet tonight"; body "When a friend recommends something from their phone, it shows up here."; button [Refresh] | Refresh |
| New rec arrives while open | Card appears with a "New" pill (slide-in is Tier 2); row count chip updates; Spotlight doesn't change unless that card has focus | unchanged |
| Offline with data | Top-right banner (`surface-2`, `text`): "Offline · showing what we had · retrying" | unchanged |
| Offline / error, no data | Full screen: "Can't reach WatchCircle" + "Check the TV's internet connection." + [Try again] | Try again |
| Unpaired (401/403) | → Pairing, with a banner on Pairing: "This TV was disconnected. Connect it again to see your circle." | Get a code |
| Mock mode | `DEMO DATA` pill in header (§9) | n/a |

**Return prompt (proposed, resolves part of OQ-06; Tier 2 per ADR-0009, item 1):** shown only when **all** of these hold (MF-7):
- the app returns to foreground after a handoff for title T that **reached a launched state** (not a failed launch or a cancelled tip screen);
- at least `RETURN_PROMPT_MIN_MS` has passed since the launch (default **20 min**; a dev/demo flag can lower it so the video can show it after an honest "Later that night" cut);
- less than 6 h has passed.

The Spotlight then shows T with:
- overline "WELCOME BACK"
- headline "Did you watch Kestrel Bay?"
- buttons [Not yet] [Yes, mark seen], with **default focus on [Not yet]** (an accidental OK must never hide a title); Yes still shows the Undo toast.

It appears **once** per handoff and is dismissed by Back or Not yet. That is not nagging (R35), since it's a single question tied to the user's own action.

### 5.2 Title actions sheet (Menu button)

A right-side panel (520 px wide, `surface-1`, slides in 200 ms) with:
- title (`title`)
- [Mark seen] (initial focus): optimistic removal and toast "Marked as seen" + [Undo] for 5 s (Undo is the 2nd focusable item while the toast shows; proposed)
- [Cancel]

Back closes it.

The Spotlight's **Mark seen** button (§5.1) is always present for the pick, so the actions sheet is a shortcut, not the only path. Whether Kiran's remote has a ☰ key is unknown (UXQ-04). If it doesn't, row cards reach Mark seen by first making the title the Spotlight focus (OK → handoff → return prompt) or via a row-card Mark seen variant to be decided in UX-10.

### 5.3 Pairing

**Layout** (mockup `tv-pairing.png`): split screen.
- **Left (text column, x 96–1000):**
  - wordmark
  - headline "Bring your circle to this TV"
  - steps (`body`): "1 · On your phone, scan the code or open **wc.example/pair** (short URL TBD, OQ-12)" / "2 · Enter this code"
  - the code in `code` style, split **K7Q · 4ZP** inside a `surface-2` pill
  - below: "Waiting for your phone…" with a slow 3-dot pulse (static under reduce-motion)
  - "New code in 9:41" (`label`, `text-3`, calm, no red; R35)
- **Right:** QR card (white 420×420 rounded tile, QR 360 px with quiet zone) + caption "Scan with your phone camera". Short payload (e.g., `https://<short>/p/K7Q4ZP`) to keep the QR version low (R36).
- Bottom-left focusables: [Get a new code] [About].

**Flow / states:**

| State | Shows | Focus |
|---|---|---|
| First launch, before code | Wordmark, headline "Your friends' recommendations, on the big screen", [Get started] (plan §3A says Get started shows the code) | Get started |
| Requesting | Code pill shows skeleton dashes `— — —  — — —` | none |
| Code shown | as above | Get a new code |
| Expired | Code auto-renews (tv-app §3.1); Tier 1 swaps instantly (no crossfade) + "We made you a fresh code." Renew cap is Tier 2; **Note:** RFC 8628 §3.1 advises against auto-requesting; we keep auto-renew only while the screen is visible and foregrounded, capped at **3 renewals (30 min)**, then show "Still there? [Get a new code]" (proposed, UXQ-13) | Get a new code |
| Phone connected | Full-screen success: ring + check draw, "You're paired!", "Welcome, Kiran's household" | none, auto → Home after 1.5 s |
| Start fails | Inline: "Can't reach WatchCircle. Check your connection." + [Try again] | Try again |

### 5.4 Search-tip & handoff

**Layout** (mockup `tv-handoff.png`): full-bleed backdrop art of the title (dimmed scrim).
- Left: poster 360×540.
- Right column:
  - overline "OPENING YOUR STREAMING APP…" (service name only if known **and** not demo mode)
  - `title` "When it opens, search for:"
  - a **search-box-styled frame** (`surface-2`, 4 px `text-3` border, magnifier icon) containing the title in `display`, so the user recognizes it as what to type
  - friend's tip carried along (`quote`, smaller 30 px): avatar + "Priya: “Start at episode 2, trust me.”" (proposed: the advice is most useful *right before* watching)
- Bottom: marigold progress bar (**4 s**; any D-pad press pauses it, ADR-0009), hints `label`: "OK  Open now   ·   Back  Stay here".

**States:**

| State | Shows | Focus / keys |
|---|---|---|
| Opening (default) | as above | OK = launch now, Back = cancel → Home with focus restored |
| Unknown service (`service: null`) | Overline "WATCH IT IN YOUR STREAMING APP". Same search box. No progress bar. [Back to WatchCircle] | Back to WatchCircle |
| Launch failed | Overline "COULDN'T OPEN THE APP". Body "Install it from the Appstore, then search for the title below." Search box stays. [Back to WatchCircle] (plan §3G.3) | Back to WatchCircle |
| Demo mode | No service names anywhere; the video cuts at launch (plan §7) | n/a |

**Update Oct 12 ([ADR-0012](../decisions/ADR-0012-recommender-picks-service.md)):** when the title's service is known, the screen is **tip-only** (no countdown or launch for now). The overline reads "OPEN {SERVICE}", the headline 'Open {service} and search for "{title}"', and the search box stays. The service shown is the most common one among the friends' recs, ties going to the most recent. Unknown, Other or Not sure → the "Unknown service" row above. Seed/demo data uses "Kitehouse/Pebblewave", so no real brand appears in the video. The rec detail (Spotlight meta line) adds "On {service}". Phone compose: "Where can they watch it?" chips, **Not sure** selected by default.

**Update Oct 12 (multi-recommender detail, follows the §5.1 one-card-per-title grouping / OQ-19 proposal):** the handoff detail lists **every** friend who sent the title, newest first: a `label` line "Priya and Sam recommend" ("Priya recommends" for one), then one row per friend: avatar + "Name: “note”" (just the name if no note) + "· On {service}" when that friend picked a named service. Up to 3 rows, then "and N more". This replaces the single "friend's tip" line above. (Bug found on the emulator: the card showed 2 senders, the detail only Priya.)

### 5.5 About

A simple list panel:
- "WatchCircle 0.x (build)"
- household name
- "Paired since Oct 11"
- TMDB attribution block (logo/notice per TMDB terms; wording TBD, tv-app §3.6)
- "Demo-grade sign-in for the hackathon. No passwords, no personal data beyond first names." (proposed copy)
- [Unpair this TV] → confirm dialog: "Unpair this TV? You'll need your phone to pair it again." [Unpair] [Cancel], with **Cancel focused by default** (safe default)

Back → previous screen.

### 5.5a Watched history + Undo (added Oct 12 after Kiran's emulator test: "once Mark seen is pressed the title is gone with no way back")

- **Undo toast** (Tier 1 now; it was §5.2 "proposed"): after any Mark seen (Spotlight button, actions sheet, return prompt), a toast sits bottom-centre for **6 s**: "Marked as seen" + [Undo]. Focus does **not** jump to it, so an accidental OK can't undo. It's reached with **Down** from wherever focus is. On Fire TV, Back while the toast shows just closes the toast. Undo calls `DELETE /recommendations/{id}/seen` and the title returns to the row (and the Spotlight, if it was the pick). Failure → toast "Couldn't undo. Try again from Watched."
- **Watched screen**: header button **"Watched"** next to About (and an About-panel link). It's a vertical list, newest first, one row per title: poster thumb, title, "From Priya · watched Tue" and a [Put back] button. Put back = `DELETE …/seen` → back in the feed with a toast "Back in your list". Empty state: "Nothing watched yet. Titles you mark as seen show up here." It shows at most 50; older titles drop off the list (no paging in Tier 1).
- **API** (api.md §7.3): `DELETE /recommendations/{id}/seen` (device) un-sees **every** rec of that title in the household (mirror of title-level Seen), `{ ok: true }`, idempotent, 404 for an unknown rec. `GET /seen?limit=` (device, default 20, max 50) → `{ items: SeenItem[] }` = FeedItem + `seenAt`, one per title (the most recently seen rec), newest `seenAt` first.
- Phone: no change in this step (a "Watched ✓ back to the sender" view stays the stretch goal UXQ-07).

### 5.6 Boot / splash

The wordmark centered on `bg` with a soft marigold dot "lamp" fading in. No progress UI unless boot exceeds 2 s, then "Connecting…".

---

## 6. Phone PWA screens (390×844 reference), states

Mockups: `phone-1-search.png`, `phone-2-compose.png`, `phone-3-sent.png`.

**Speed budget for "send a rec in < 10 s" (proposed acceptance test UX-15):**
- open link: already open/installed, 0–1 s
- type 3–5 letters: ~3 s
- tap a result: 1 s
- tap Send: 1 s

That's ≈ 6–8 s. Measured with a stopwatch on Kiran's phone, 5 runs, median < 10 s.

### 6.1 Home / search (`/u/<token>`)

> **Update Oct 14 (phone app + PWA): Recommend tab = list first.** The tab opens on "Recommend / Send a show to a friend's TV.", a tappable search bar ("Search a show to recommend") and **You recommended** (your sent picks, newest first: title, to whom, service, time). "You recommended" moved here from Me. Empty: card "Nothing recommended yet" + "Recommend something". Tapping the bar opens the search flow below (with Cancel back to the list); heading "What should your friends watch?", or "What should Alex watch?" when entered from a Friends-row **Recommend** (that friend pre-selected in Compose). "Send another" re-opens search; "Done" returns to the list.
>
> **Tab bar (phone app; PWA matches):** four 24px line icons (1.8 stroke, rounded) above 11px labels: For you = TV, Recommend = paper plane, Friends = two people, Me = person. Active = amber icon with a light amber fill + bold amber label; inactive = text3. Hairline top border on 96% navy; bar extends into the bottom safe area; each tab ≥50px tall, full-width hit area, press dims. For you count = amber badge with navy ring on the icon (1–9, then "9+"), hidden at 0; no "· N" in the label. Review (Oct 14): icons consistent stroke/size, active state not color-only (fill + weight), inactive contrast ≈6:1 on navy, badge has a screen-reader label ("For you, 3 waiting").

- Top: "Hi Priya" (`display`) + sub "What should Kiran's household watch?" (when Priya has exactly one friend household; else "Recommend something to your circle").
- **Search field auto-focused** (keyboard up on load; on iOS, auto-focus may not raise the keyboard: UNVERIFIED, test). Placeholder: "Search a show or movie".
- Below the field (before typing):
  - "Send again?" is out of scope.
  - "**Your recent sends**" list (title + to whom + time). Stretch: a "✓ Watched" status from the household, which needs the API (UXQ-07).
- **Results** (after 2+ chars, 250 ms debounce): rows of 56×84 poster thumb + title + year + type. Tap anywhere on the row → Compose.
- States:
  - searching (3 skeleton rows)
  - no results ("No matches for "kestrl". Check the spelling or try fewer words.")
  - error ("Search isn't working right now. Try again in a moment." + Retry)
  - offline ("You're offline. We'll be ready when you're back.")
  - invalid link ("This link doesn't work anymore. Ask Kiran for a new one.")
  - mock badge.

### 6.2 Compose (bottom sheet over results)

- Poster + title + year at the top.
- **Note**: a one-line field "Add a note (optional)" with a 120-char counter appearing at 100+ (contract NOTE_MAX = 120). ~~Quick chips~~ **Removed Oct 12 (Kiran):** they were a static, made-up list (proposed copy, UXQ-08) with no research behind them, and canned words aren't what the sender wants to say; a plain optional field with placeholder "Why they'll love it, or where to start" is enough.
- **To:** recipient chips. Default = **the last recipients used**, or the only friend household on first use. Always visible, one tap to toggle (no hidden preselection, R35). "Everyone" chip if > 1 household.
- **Where to watch (optional):** collapsed row "Where: Not sure ▾" (plan §3C: Unknown by default). Demo mode shows invented "Kitehouse / Pebblewave / Other / Not sure".
- Primary button (56 px, marigold, full width, bottom): **"Send to Kiran's household"**. The label states the recipient so there are no surprises.
- States: sending (button shows spinner + "Sending…", disabled), error ("Didn't send. Check your connection and try again." button stays, note kept), validation (no recipient → button disabled with hint "Pick who it's for").

**Update Oct 12 (free-text fallback, OQ-16 no TMDB key yet):** no results → notice "We couldn't find “{q}” in our list yet." + primary button **Recommend “{q}” anyway** + caption "Their TV shows the title as you typed it. Check the spelling first." When there are results, a quiet link under them: "Not listed? Recommend “{q}” anyway". Compose for a typed title: caption "Typed by you · no poster yet" and an optional **Year** field (4 digits; invalid → "Use a 4-digit year, or leave it empty." and Send disabled). The TV shows it with the neutral placeholder poster (title set in the display face). Same flow in the native app.

### 6.3 Sent ✓

- Large check draw (reduce-motion: static) + "Sent to Kiran's household".
- Sub: "It'll show up on their TV within a minute." (honest: feed polls every 20 s, tv-app §5).
- **"How it'll look on their TV"**: a mini TV-card preview (poster + avatar + note). This is the delight moment, connecting phone to living room.
- Buttons: [Recommend another] (primary), [Done].

### 6.4 Connect a TV (/pair)

- **Manual:** 6 large boxes, auto-uppercase, accepts lowercase/space/dash and strips them (R23 §6.1). Hint: "The code is on your TV screen."
- **Via QR** (`/pair?code=K7Q4ZP`): "Is this the code on your TV?" + the code shown big + [Yes, connect this TV] + "No, that's not it". This follows R23 §3.3.1/§5.4.
- **Cold QR scan, no identity (MF-6):** `POST /pair/complete` needs a **profile** token (api.md). A camera scan opens the default browser, and on iOS an installed PWA does not share storage with Safari, so the page may have no profile. Then show: **"Open your WatchCircle link first, then scan again."** + the code shown big + a hint to type it on the Pair screen after opening the link. Alternative (plan §4 lists a "seeded-profile picker" as IN): a "Who are you?" picker of seeded profiles (UXQ-16). **Judges' testing instructions must start with the profile link**, then pairing.
- Success: "Connected! Look at your TV." Errors:
  - wrong code: "That code didn't match. Check the TV and try again."
  - expired: "That code expired. Your TV shows a new one."

---

## 7. Core emotional moments (what we design and test for)

1. **"Someone thought of us" (TV open):**
   - The greeting and household name make the screen feel like *yours*.
   - "3 new" chip and "New" pills on cards.
   - The friend's **avatar + name + their words** are in the Spotlight the moment a card gets focus.
   - Test: Kiran opens the TV, and within 3 s, without pressing anything, can say who sent something new.
2. **"Done in 10 seconds" (phone send):**
   - Auto-focused search, one-tap result, a Send button that names the recipient, and Sent ✓ with a TV preview.
   - Test: median < 10 s (UX-15).
3. **"Tonight, sorted" (Tonight's pick):**
   - The hero slot and default focus, so one OK press is a decision.
   - The reason uses friends' names and words.
   - The transparency line "Chosen only from titles your circle sent" (or a server-provided count, UXQ-15) builds trust and shows it isn't a generic algorithm.
   - The fallback is labeled honestly.
   - Test: a first-time viewer understands why this title was chosen (reads the reason aloud correctly).
4. **"Carry the tip into the app" (handoff):** the friend's tip ("start at ep 2") appears exactly when it's needed.
5. **"We watched it" (return):** one question closes the loop and cleans the feed.

---

## 8. Microcopy (proposed; voice = warm, brief, plain; sentence case; no exclamation marks except pairing success)

**Oct 12 (Kiran):** user-facing copy uses people's names only, never "household" ("Priya's household" → "Priya"; TV About row "Paired with"). Internal API/data names (`householdId`, `householdName`) stay.

| Where | Copy |
|---|---|
| TV pairing headline | Bring your circle to this TV |
| TV pairing steps | 1 · On your phone, scan the code or open {shortUrl} · 2 · Enter this code |
| Waiting | Waiting for your phone… |
| Code refresh | New code in {m:ss} / We made you a fresh code. |
| Pair success | You're paired! · Welcome, {householdName} |
| Home greeting | Good morning / Good afternoon / Good evening |
| Pick overline | TONIGHT'S PICK |
| Pick transparency | Chosen only from titles your circle sent (if `candidateCount` is added: Picked from {candidateCount} titles your circle sent) |
| Fallback overline | MOST RECOMMENDED THIS WEEK |
| No pick | NEWEST FROM YOUR CIRCLE |
| Row title | From your circle · {n} new |
| Rec overline | FROM {NAME} · {timeAgo} (e.g., "FROM PRIYA · 2H AGO"; "FROM PRIYA AND SAM") |
| CTA (pick) | Watch tonight · Mark seen |
| CTA (rec, no pick) | Watch now |
| Menu hint | ☰ Mark seen |
| Actions sheet | Mark seen · Cancel |
| Toast | Marked as seen · Undo · Back in your list · Couldn't undo. Try again from Watched. |
| Watched | Watched · From {name} · watched {day} · Put back · Nothing watched yet. Titles you mark as seen show up here. |
| Return prompt | Welcome back · Did you watch {title}? · Not yet (default) · Yes, mark seen |
| Handoff | Opening your streaming app… · When it opens, search for: · OK Open now · Back Stay here |
| Handoff fail | Couldn't open the app · Install it from the Appstore, then search for the title below. · Back to WatchCircle |
| Empty | Your circle is quiet tonight · When a friend recommends something from their phone, it shows up here. · Refresh |
| Offline banner | Offline · showing what we had · retrying |
| Error | Can't reach WatchCircle · Check the TV's internet connection. · Try again |
| Unpaired | This TV was disconnected. Connect it again to see your circle. |
| First-run coach | Your friends' picks land here. Use Mark seen (or ☰ on a title) when you've watched something. · Got it |
| Phone hello | Hi {name} · What should {household} watch? |
| Phone search | Search a show or movie |
| Send | Send to {household} / Send to {n} households |
| Sent | Sent to {household} · It'll show up on their TV within a minute. · How it'll look on their TV · Recommend another · Done |
| QR confirm | Is this the code on your TV? · Yes, connect this TV · No, that's not it |
| Cold QR scan | Open your WatchCircle link first, then scan again. |

Time-ago format on TV: "just now", "12 min ago", "2h ago", "yesterday", "Mon" (proposed). In overlines, render uppercase via style rather than in the string, so VoiceView doesn't spell it out.

---

## 9. Demo / mock / dev badges

- **Mock mode** (`API_MODE=mock`, ADR-0007): a `DEMO DATA` pill (`surface-2`, `text-2`, `label`) in the TV header and the phone top bar. It is always on in mock mode, which keeps us honest in screenshots.
- **Dev source tag** for Tonight's pick (`stub`/`bedrock`/`fallback`): dev builds only (tv-app §3.3).
- **Demo video** is recorded in **live** mode with `CATALOG_MODE=demo`, so no mock pill shows.
- **Proposed rule (UXQ-10):** never record a `stub` pick as if it were AI. Record a real `bedrock` pick, or show the honestly labeled fallback.

---

## 10. Engagement without dark patterns (rules)

**Do:**
- show real "new since last time"
- show friends' names and words
- give one Tonight's pick per evening (it changes daily, a natural reason to return)
- show the sender their rec landed (Sent ✓ preview)
- *(stretch)* "Watched ✓" status back to the sender (UXQ-07; needs an API read of title-level Seen for households the sender recommended to)

**Don't:**
- streaks
- push notifications (none in MVP)
- badges/points
- autoplay
- infinite feeds (the feed is bounded, limit 50)
- fake "X people are watching"
- countdown pressure (beyond the real pairing expiry)
- confirmshaming
- hidden recipient defaults

Taxonomy: R35.

---

## 11. Accessibility checklist (applies to every screen)

0. **Stack limitation (MF-9):** the focus library's accessibility support is documented by its authors as *experimental* (TalkBack users must press Enter to grab focus; the library can't intercept accessibility focus). So VoiceView support is **best-effort**: we label everything and document what works, and log the limitation in `submission/FRICTION_LOG.md` / `PRODUCT_FEEDBACK.md` (genuine feedback on the sample's focus library vs. VoiceView).
1. **Labels:** every focusable has an `accessibilityLabel` (set via `useSpatialNavigatorFocusableAccessibilityProps`) that reads as one sentence, e.g. *"Tonight's pick: Kestrel Bay. Priya and Sam both loved it… Press select to watch."* For a row card: *"Kestrel Bay, from Priya, 2 hours ago: Start at episode 2. Card 2 of 7."* (R7, R8).
2. **Hints:** the row container hint is "Press left and right to browse, up for tonight's pick" (R8 usage hint; whether the Fire OS extra is reachable from RN is UNVERIFIED, so fall back to `accessibilityHint`).
3. **Contrast:** all text ≥ 4.5:1; body ≥ 7:1 on its actual background (§2.1, R32). Text on art always sits on the scrim.
4. **Never color alone:** friend hue + initials + name; the focus = border + scale; errors = icon + text.
5. **Focus survives High Contrast Text** (R9): border/scale are physical changes (R5). Test with the setting on.
6. **Text Banner / Screen Magnifier** (R9): with real text labels, Text Banner works. Don't render text into images, except posters, whose titles are also in labels.
7. **Reduce motion** honored (§2.5).
8. **Phone:** semantic HTML, labels on inputs, 44 px targets, visible focus rings for keyboard users, `prefers-reduced-motion`, dynamic type via rem.
9. **Demo video:** burned-in captions for all voiceover. Not required by the rules as far as we read; proposed for accessibility and for judges watching muted.

---

## 12. Demo-video storyboard (aligned with plan §7; target 75 s; proposed edits in **bold**)

| Time | Shot | On screen | VO / caption |
|---|---|---|---|
| 0:00–0:07 | Couch, TV shows Home at evening; Spotlight = Tonight's pick (*Kestrel Bay*, computed earlier from **seeded** notes by Priya and Sam) | "Good evening · Kiran's household" | "So many shows. What should *we* watch tonight?" |
| 0:07–0:17 | Phone (screen recording): **Maya** types "sal", taps ***Saltwater Static***, taps chip "Perfect for a weeknight", taps **Send to Kiran's household**; **on-screen stopwatch shows ~8 s**; Sent ✓ with TV preview | phone-1/2/3 | "Friends already know. Sending a rec takes seconds." |
| 0:17–0:27 | TV: *Saltwater Static* lands in "From your circle" with a "New" pill (demo poll interval or an honest cut; never imply instant push); D-pad Down → Spotlight shows Maya's avatar + quote | tv-home-row | "It lands on the big screen, in their words." |
| 0:27–0:41 | TV: Up → Tonight's pick, **unchanged**: "*Kestrel Bay*: Priya and Sam both loved it, and it's a 40-minute episode…" + "Chosen only from titles your circle sent" | tv-home-pick | "Can't decide? Tonight's pick chooses one, from what your circle sent this week." |
| 0:41–0:50 | OK → handoff: "When it opens, search for: Kestrel Bay" + Priya's tip; progress bar; **cut** at launch | tv-handoff | "One press toward the app you already pay for. No overlays." |
| 0:50–0:58 | **Caption "Later that night"** → return → "Did you watch Kestrel Bay?" → Yes, mark seen → card leaves (recorded with a lowered `RETURN_PROMPT_MIN_MS`, disclosed by the caption cut) | Home | "Mark it seen, and the circle keeps it fresh." |
| 0:58–1:10 | Plain-box architecture (text only, no logos) | — | "Fire TV app, phone web app, and AWS: API Gateway, Lambda, DynamoDB, and Amazon Bedrock for Tonight's pick." |
| 1:10–1:15 | Wordmark on `bg` + repo URL | — | "WatchCircle: your friends, on the couch." |

**Why (MF-3):** the pick is computed once per household per night and cached (ADR-0003), so the live send must be a *different* title; otherwise viewers would infer the AI reacted to the send. If the pick is marked Seen on camera, the hero flips to the fallback; avoid that on camera.

Lower-third: "Running on Fire TV Stick (Fire OS)". Captions burned in. Only made-up titles and generated art, and destination apps are never shown (plan §7).

---

## 13. Proposed changes to [tv-app.md](tv-app.md) (not applied; for Kiran + reviewer)

| # | tv-app.md section | Current | Proposed | Why |
|---|---|---|---|---|
| P1 | §3.2 Layout | One vertical column of rec cards + pick card | **Spotlight (hero) + one horizontal "From your circle" row**; the Spotlight previews the focused item (§5.1) | Native Fire TV row + mini-details pattern (R1) and immersive list (R15); still a 1-D focus model per region; shows more posters (R19) with notes up front (R20) |
| P2 | §3.2 Focus map | Up/Down within the list | Focus map in §5.1 (Down = row, Up = CTA, Left/Right in row, Up from CTA = About) | Follows P1 |
| P3 | §3.4 / OQ-05 | Title detail optional | **Not adopted**; the Spotlight shows the details and all senders' notes | Fewer screens; details visible while browsing (R15, R20) |
| P4 | OQ-06 Seen trigger | Open | **Focusable [Mark seen] button next to Watch tonight** (MF-2) + **Menu (☰) → actions sheet** as a shortcut (needs keycode 82 mapping) + a **return prompt** after handoff (≥ 20 min, default focus Not yet) | R3 (Menu + on-screen hint); loop closure at the natural moment |
| P5 | §3.3 / OQ-11 no candidates | Card hidden | The Spotlight shows the newest rec ("NEWEST FROM YOUR CIRCLE"); empty state only if 0 recs | The hero is never blank; one-press decision preserved |
| P6 | §3.3 bedrock state | poster, title, reason | + transparency line "Chosen only from titles your circle sent" (a count only if `candidateCount` is added, UXQ-15) | Trust; differentiation from generic AI (plan §2) |
| P7 | §3.5 Handoff | Title + "Search for" | + search-box styling, friend's tip carried over, progress bar, key hints | Usability at the critical moment |
| P8 | §3.1 Pairing | Code, QR, URL, countdown | Split layout, code 3+3, calm countdown, auto-renew capped at 3 then "Still there?", pair-success screen | R23 §3.1/§3.3.1/§6.1; R21/R22 |
| P9 | §3.2 grouping / OQ-19 | Open | One card per title, stacked avatars, up to 2 notes in the Spotlight | Matches title-level Seen |
| P10 | §7 10-foot UI | "titles ≥ 36, body ≥ 24, no text < 20" | Type scale §2.2 (body ≥ 28 per R1, label floor 24 semibold), focus §2.6, safe area 96/54 px | R1 minimum body 28 px at 1080p |
| P11 | New | — | First-run coach mark; "New" pills + "n new" (client-side last-opened timestamp); `DEMO DATA` pill in mock mode | Engagement + honesty |
| P12 | §3.6 About | Unpair | Unpair confirm with Cancel as the default focus | Safe default |
| P13 | §2 Back | Feed/Pairing → exit | Back from the row or About → Watch tonight; Back on Watch tonight → exit (MF-5) | Don't lose the user's place |
| P14 | §6 State | — | Performance budget §2.7 (debounced Spotlight, 960×540 backdrops, virtualized row) | Old Fire OS 6 stick (MF-10) |

P1–P14 need no API changes. **One optional contract addition is proposed as an open question, not applied:** `TonightResponse.candidateCount` (integer ≥ 2, the number of candidate titles the pick was chosen from) so the transparency line can show a true number (UXQ-15). Without it, the copy stays number-free. The "Watched ✓ for sender" stretch (UXQ-07) would need a new read endpoint; it's not proposed for MVP.

---

## 14. Acceptance (design-level, proposed)

- All mockup screens are implemented with the tokens in §2 (no ad-hoc colors or sizes).
- On Kiran's TV from his usual seat: every text style is readable, and the focus location is obvious after looking away and back (R1). Record the TV size and distance (UXQ-12).
- Every focusable has an accessibility label; High Contrast Text and Text Banner verified on the stick; VoiceView is **best-effort** with its limitations documented (UX-19, MF-9).
- Holding Right for 3 s across 20 cards on the stick: no visible hitch, no lost keypresses (§2.7).
- Median phone send < 10 s (UX-15).
- No real titles, logos, service names or faces in any screenshot or video frame (plan §7).
- Independent review done (approve with changes); MF-1…MF-10 applied in v1.1. Scope tiers decided in ADR-0009; Tier 1 build may start. Still open for Kiran: UXQ-04 (☰ key), UXQ-12 (TV size/distance), brand colors.

---

## 15. Changelog

**v1.2 (Oct 11, 2026)**: applies [ADR-0009](../decisions/ADR-0009-ux-scope-and-pacing.md):
- Fraunces SemiBold moves to Tier 1 (Inter-only fallback).
- Handoff timer 4 s, paused by any D-pad press (OK still opens now).
- "n new" = since the last session that ended > 30 min ago; never resets while open.
- One-line transition copy when the pick is marked Seen.
- Lamp dot only on real `bedrock` picks.
- Tier labels are now decisions: slide-in, reveal, check-mark draw, coach mark, renew cap and return prompt are Tier 2 (flagged, off by default). Tier 1 equivalents are static.
- UXQ decisions recorded in ADR-0009 §5 (layout, palette, fonts, no detail screen, newest-rec hero, initials avatars, no wrap, number-free transparency line, cold-scan message).


**v1.1 (Oct 11, 2026)**: applied review must-fixes ([ux-design-review.md](../decisions/reviews/ux-design-review.md)):
- **MF-1:** focus map rewritten for `react-tv-space-navigation`; Menu key (keycode 82) mapping called out; glow removed; ring opacity animated instead of border color.
- **MF-2:** Mark seen is a focusable button next to Watch tonight; ☰ is a shortcut.
- **MF-3:** storyboard: the live send is Maya → *Saltwater Static*; the pick stays *Kestrel Bay* from seeded notes; "Later that night" cut before the return prompt.
- **MF-4:** number-free transparency line; `candidateCount` proposed as an open question (UXQ-15); no avatars on that line.
- **MF-5:** Back from the row returns to Watch tonight; Back there exits; DEL vs KEYCODE_BACK test.
- **MF-6:** cold QR scan without identity defined; judges' instructions start with the profile link; picker alternative (UXQ-16).
- **MF-7:** return prompt needs a launched handoff + ≥ 20 min (`RETURN_PROMPT_MIN_MS`); default focus Not yet.
- **MF-8:** row cards 200×300; all TV text ≥ 24 px (pills, chips, key caps, demo pill), avatar initials ≥ 22 px; phone chips ≥ 44 px; poster-title contrast check in UX-04. The mockups were re-rendered.
- **MF-9:** VoiceView is best-effort with documented limits.
- **MF-10:** performance budget §2.7; static fonts; pre-rendered fallback posters.
- **MF-11:** scope tiers **not decided**; recorded for Kiran as UXQ-17. "Tier 2" tags in this spec are labels for that proposal, not decisions.

The review's nice-to-haves (4 s handoff timer, split-screen video, "n new" semantics, sticky Send footer, chip append rule, duplicate-send hint, "Thanks, Priya" loop, etc.) are **not applied**. They're listed as UX-22 for later.


## Signed-out welcome (web + native), Oct 13, 2026
Shown when the phone has no profile (no link opened, signed out, or link revoked). Never names a person.
- Title **Gottawatch**; value line "The shows your friends say you've gotta watch, waiting on your TV."
- Revoked link: notice "That link doesn't work anymore. Ask the person who sent it for a new one."
- `GET /auth/config` `email: true`: primary **Sign in with email** (email → 6-digit code), then secondary "Have an invite or private link? Just open it." Native adds "Paste a link instead" which reveals the link field.
- `email: false`: "Open the Gottawatch link you were sent. It signs you in on this phone." (native shows the paste field directly).
- Copy source: `signedOutCopy` in `apps/web/src/logic.ts` and `apps/mobile/src/core/copy.ts` (tests keep them identical). Cold-QR copy also no longer names anyone.
