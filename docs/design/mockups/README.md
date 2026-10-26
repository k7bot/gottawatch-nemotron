# Static mockups (review aids, not pixel specs)

Rendered from `src/*.html` with headless Chrome (`src/render.sh`). The tokens come from [specs/ux-design.md §2](../../specs/ux-design.md); the poster art from `src/poster.js` (the "Circle Art" recipe, ux-design §3). Every title shown is **made up**, and all art is generated: no photos, logos, or service names. The titles still need the Oct 21 name-collision check.

| File | Size | Shows |
|---|---|---|
| `tv-home-pick.png` | 1920×1080 | Home, default focus on **Watch tonight**, with a focusable **Mark seen** button next to it; Spotlight = Tonight's pick (bedrock state), number-free transparency line; "From your circle" row |
| `tv-home-row.png` | 1920×1080 | Home with Maya's just-sent *Saltwater Static* focused; Spotlight shows her note + key hints (OK / ☰ / ▲) |
| `tv-pairing.png` | 1920×1080 | Pairing: 3+3 code, QR (real QR of the placeholder `https://wc.example/p/K7Q4ZP`), calm countdown |
| `tv-handoff.png` | 1920×1080 | Search-tip/handoff with the friend's tip carried along and a 2.5 s progress bar |
| `phone-1-search.png` | 390×844 CSS px @2x (780×1688) | PWA: Maya's auto-focused search, results |
| `phone-2-compose.png` | 390×844 @2x | Compose sheet: note + quick chips, recipients (visible default), where-to-watch, named Send button |
| `phone-3-sent.png` | 390×844 @2x | Sent ✓ with "How it'll look on their TV" preview |

Re-render with `docs/design/mockups/src/render.sh` (needs `google-chrome`). Fonts load from the box's local Inter/Fraunces files, so the paths in `common.css` are box-specific.

## v1.1 re-render (after review MF-1/2/3/4/8)

- No glow anywhere. Focus = scale + double ring (4 px `bg` gap + 4 px white).
- Row cards are 200×300. The focused card, its ring and its avatar end at y ≈ 1007, inside the 1026 px safe edge. The under-card title label was removed.
- TV text floors: "New" pill, "n new" chip, key caps and `DEMO DATA` pill are 24 px; avatar initials are 22 px.
- Mark seen is a real secondary button on the pick.
- The pick line is number-free ("Chosen only from titles your circle sent").
- The phone flow follows the revised storyboard: Maya sends *Saltwater Static*. Phone chips are 44 px tall, and the compose sheet no longer overlaps the Send button.
- Handoff poster: the review flagged it at x = 40, but that value is inside the `.safe` box (96 px inset). Its real position is x = 136, which is inside the safe area, so it was left unchanged.
- The last row card deliberately bleeds past the right edge to signal that the row scrolls. It isn't focused, and focus scrolls the row.
