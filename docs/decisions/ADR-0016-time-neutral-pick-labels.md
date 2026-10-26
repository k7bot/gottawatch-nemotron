# ADR-0016: Time-neutral TV labels ("Watch", "Top pick")

Date: 2026-10-13 · Status: accepted (Kiran)

## Context
Kiran tested the TV app mid-afternoon: "Watch tonight" and "Tonight's pick" read wrong outside the evening, and after each Mark seen the next title also wore "Tonight's pick", so it looked like every title had the badge. A dev-only `stub` source tag was also visible next to the heading.

## Decision
- Primary TV button is always **Watch** (was "Watch tonight" / "Watch now"); key hint reads "OK Watch".
- The pick heading is **Top pick** (chosen over "Watch next": shorter, and says *why* it's first). Key hint under row-card previews is "▲ Back to top" (it said "▲ Top pick", which made every focused title look like the top pick).
- The #1 ranked title (Tonight's pick, or the fallback when there is none) is always headed **Top pick**, including when its own card is focused in the row. No other title gets it: row previews name the senders ("From Maya · Sat"). (Revised Oct 13: an earlier 2+-friends rule hid the label too often.)
- The source tag (`stub`/`bedrock`) is no longer drawn; it stays in the API (`source`) and the `showDevTags` config.
- After any Mark seen (button or Menu sheet), D-pad focus returns to the next item's **Watch** button.
- API/contract names (`/tonight`, `TonightResponse`, `PICK_MODE`) stay as they are (internal).

Older docs that say "Watch tonight"/"Tonight's pick" are superseded by this ADR for user-facing copy. The phone/web app has no such labels.

## Greeting note
"Good morning" at 3:41 PM ET was the emulator clock (stale snapshot clock read 1:10 AM EDT while the Mac read 3:45 PM; TZ was correctly America/New_York). `greeting()` uses device-local `getHours()` correctly; no code change.
