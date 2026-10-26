// Bundled pre-rendered art (tools/poster-gen, UX-04). Live posters from TMDB are not in Tier 1 yet.
const POSTERS: Record<string, number> = {
  'kestrel-bay': require('../../assets/art/kestrel-bay-poster.png'),
  'the-quiet-orchard': require('../../assets/art/the-quiet-orchard-poster.png'),
  'saltwater-static': require('../../assets/art/saltwater-static-poster.png'),
  'small-hours-bakery': require('../../assets/art/small-hours-bakery-poster.png'),
  'lanternfish-and-co': require('../../assets/art/lanternfish-and-co-poster.png'),
  'ninety-seconds-to-orbit': require('../../assets/art/ninety-seconds-to-orbit-poster.png'),
  'the-paper-comet': require('../../assets/art/the-paper-comet-poster.png'),
  'night-desk-at-hollow-pines': require('../../assets/art/night-desk-at-hollow-pines-poster.png'),
  'copper-and-thistle': require('../../assets/art/copper-and-thistle-poster.png'),
  'the-marigold-line': require('../../assets/art/the-marigold-line-poster.png'),
  'fjordlight': require('../../assets/art/fjordlight-poster.png'),
  'the-birdie-rule': require('../../assets/art/the-birdie-rule-poster.png'),
  'below-quarry-lake': require('../../assets/art/below-quarry-lake-poster.png'),
  'the-lighthouse-supper-club': require('../../assets/art/the-lighthouse-supper-club-poster.png'),
};
const BACKDROPS: Record<string, number> = {
  'kestrel-bay': require('../../assets/art/kestrel-bay-backdrop.jpg'),
  'the-quiet-orchard': require('../../assets/art/the-quiet-orchard-backdrop.jpg'),
  'saltwater-static': require('../../assets/art/saltwater-static-backdrop.jpg'),
  'small-hours-bakery': require('../../assets/art/small-hours-bakery-backdrop.jpg'),
  'lanternfish-and-co': require('../../assets/art/lanternfish-and-co-backdrop.jpg'),
  'ninety-seconds-to-orbit': require('../../assets/art/ninety-seconds-to-orbit-backdrop.jpg'),
  'the-paper-comet': require('../../assets/art/the-paper-comet-backdrop.jpg'),
  'night-desk-at-hollow-pines': require('../../assets/art/night-desk-at-hollow-pines-backdrop.jpg'),
  'copper-and-thistle': require('../../assets/art/copper-and-thistle-backdrop.jpg'),
  'the-marigold-line': require('../../assets/art/the-marigold-line-backdrop.jpg'),
  'fjordlight': require('../../assets/art/fjordlight-backdrop.jpg'),
  'the-birdie-rule': require('../../assets/art/the-birdie-rule-backdrop.jpg'),
  'below-quarry-lake': require('../../assets/art/below-quarry-lake-backdrop.jpg'),
  'the-lighthouse-supper-club': require('../../assets/art/the-lighthouse-supper-club-backdrop.jpg'),
};
const FALLBACK_POSTER: number = require('../../assets/art/fallback-poster.png');
const FALLBACK_BACKDROP: number = require('../../assets/art/fallback-backdrop.jpg');

export const slugify = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function posterFor(title: string) {
  const s = POSTERS[slugify(title)];
  return { source: s ?? FALLBACK_POSTER, isFallback: s === undefined };
}
export function backdropFor(title: string | undefined) {
  return (title && BACKDROPS[slugify(title)]) || FALLBACK_BACKDROP;
}

export const SCRIM_LEFT: number = require('../../assets/art/scrim-left.png');
export const SCRIM_BOTTOM: number = require('../../assets/art/scrim-bottom.png');
