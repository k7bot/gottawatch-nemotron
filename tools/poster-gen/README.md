# poster-gen (UX-04, Tier 1)

Pre-renders the "Circle Art" posters (440×660 PNG) and backdrops (960×540 JPEG, ux-design §2.7) for the demo catalog plus one generic **fallback** poster/backdrop (no title in the art; the TV overlays the title). Recipe: `recipe.cjs`, copied from `docs/design/mockups/src/poster.js`. Output: `apps/tv/packages/shared-ui/src/assets/art/`.

Run: `node tools/poster-gen/render.mjs` (needs `google-chrome`, `python3` + Pillow). It fails if any poster title's contrast is below 4.5:1 against the 95th-percentile-brightest background pixel behind it (MF-8). Last run 2026-10-11: Kestrel Bay 12.4:1, The Quiet Orchard 7.4:1, Saltwater Static 7.0:1.

All art is abstract and generated; titles are made up (pending the Oct 21 name-collision check).
