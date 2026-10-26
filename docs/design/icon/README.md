# Gottawatch app icon: concepts and review

Status: concepts only. Not wired into the app yet.
Palette from `docs/specs/ux-design.md`: bg `#0E1020`, accent marigold `#F2B45A`, warm white `#F4F1EA`.

Files: `svg/` (1024 viewBox vectors), `png/` (1024/180/48 px), `contact-sheet.png` (180/60/29 px on dark and light home screens). Regenerate with `python3 build.py` (needs cairosvg and pillow).

## Landscape (what to avoid)
Category marks are crowded with play triangles (Plex chevron, Apple TV, Infuse), popcorn and film reels, TV outlines, and dot clusters (Letterboxd's three dots; JustWatch's play-arrow-in-circle shape). Gottawatch's real difference is *a friend sends you a pick*. A play/TV symbol says "player" and would blend into the Fire TV launcher.

## Concepts
1. **Handoff G**: a heavy G whose crossbar ends in an arrowhead pointing in, meaning "sent to you". It's the monogram plus the action.
2. **Two-way rings**: two linked rings, one warm white and one amber, with the shared overlap filled. A connection always goes both ways.
3. **Pick bubble**: an amber speech bubble shaped like a wide screen, with a navy dot. A friend's message about something to watch.
4. **Dog-ear**: an amber page with a folded corner and a check mark. A pick saved for you.
5. **Glance**: an amber almond eye with an off-center pupil. "Gotta watch."

## Review (1–5; scored on distinctiveness, recognizability at 29px, fit)
| Concept | Distinct | 29px | Fit | Total | Notes |
|---|---|---|---|---|---|
| 1 Handoff G | 4 | 5 | 5 | **14** | Solid silhouette; the letter ties it to the name; the arrow says "a pick sent to you". There are other G marks (Google), but the amber G on navy with an arrow is its own. |
| 2 Two-way rings | 4 | 4 | 5 | **13** | Directly tells the two-way friend story and matches friend colors. Watch the Mastercard look, which the outline-plus-lens treatment avoids. At 29px the strokes get thin, so thicken them on Fire TV. |
| 3 Pick bubble | 3 | 5 | 4 | 12 | Very legible, but chat bubbles read as "messaging app". |
| 4 Dog-ear | 2 | 4 | 3 | 9 | Reads as a document or to-do app. |
| 5 Glance | 2 | 3 | 3 | 8 | Eye icons are common (privacy and vision apps), and the pupil detail gets lost at 29px. |

## Recommendation
- **Top pick: 1 Handoff G.** It's the most recognizable at small size, it can't be mistaken for Plex, Letterboxd or JustWatch, and it carries the name and the "sent to you" action.
- **Runner-up: 2 Two-way rings.** It tells the friends story best. Use it if we'd rather have a symbol than a letter.

Next (after Kiran picks): adaptive Android icon (keep the mark inside the 66% safe zone), Fire TV 320×180 banner with wordmark, iOS 1024 without alpha.

---

## Round 2: Kiran picked concept 5 (Glance eye). Refinements

Kiran's call: a picture works as a unique identifier, while a G is confusing. Changes from v1: a filled amber almond (no thin outline), a taller eye, and one large navy pupil with a single warm-white detail. Files: `svg/5a…5d`, `png/5*-{1024,180,48}.png`, `png/5*-firetv-320x180.png`. Sheet: `contact-sheet-eye.png` (180/60/29 on dark and light, plus a Fire TV 320×180 banner). Build with `python3 build_eye.py`.

| Variant | Hint | Distinct | 29px | Fit | Total | Notes |
|---|---|---|---|---|---|---|
| 5a Play glint | play triangle in pupil | 3 | 5 | 4 | 12 | Very legible, but the play triangle is the category cliché we set out to avoid. Closest to generic "watch/video" eyes. |
| **5b Heart glint** | heart in pupil | **5** | 4 | **5** | **14** | Means "a pick from someone who cares", which is the friends angle. Not a visibility glyph or Watcha's shape. At 29px the heart reads as a bright center spot, which still works. |
| 5c Screen pupil | rounded-rect pupil + glint | 5 | 5 | 4 | **14** | Most unusual silhouette and holds best at 29px. Says "TV" but not "friends". Tie, runner-up. |
| 5d Wink pair | open eye + wink | 4 | 2 | 4 | 10 | Charming at 180px, but at 29px it becomes a smudge plus a line. The wide shape wastes the square. |

**Pick: 5b Heart glint.** It's the warmest and most on-message mark (friends' picks, not just "video"). It's clearly not a generic eye or visibility icon, and it stays bold on both backgrounds and on the Fire TV banner.
**Runner-up: 5c Screen pupil.** It has the strongest small-size silhouette, so fall back to it if the heart gets lost on real devices.

Before shipping: test 5b on a real iPhone home screen and on the Fire TV launcher. If the heart blurs at 29px, scale it up about 15% for the small sizes.

---

## Final choice: 5c Screen pupil (wired in)

Kiran liked 5a (play) and 5c (screen), and we went with **5c**. It has the strongest silhouette at small sizes and the TV-screen pupil fits the Fire TV idea without using a play-triangle cliché. Master file: `svg/gottawatch-icon.svg`. Regenerate every app asset from the repo root with `python3 docs/design/icon/build_final.py`.

| Target | File(s) |
|---|---|
| iOS / Expo `icon` (1024, no alpha) | `apps/mobile/assets/icon.png` |
| Android adaptive (mark at 62%, inside the 66dp safe zone) | `apps/mobile/assets/android-icon-{foreground,background,monochrome}.png` |
| Splash / favicon | `apps/mobile/assets/splash-icon.png`, `favicon.png` |
| Fire TV launcher icon | `apps/tv/apps/expo-multi-tv/assets/images/{icon,adaptive-foreground}.png` (set in TV `app.json`) |
| Fire TV banner (`android:banner` via config-tv) | `apps/tv/apps/expo-multi-tv/assets/tv_icons/icon-*.png`; 320×180 preview at `png/firetv-banner-320x180.png` |
| Web / PWA | `apps/web/public/{favicon.svg,icon-192.png,icon-512.png,apple-touch-icon.png}` |
