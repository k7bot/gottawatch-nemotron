// Bundled pre-rendered art (tools/poster-gen, UX-04). Live posters from TMDB are not in Tier 1 yet.
const POSTERS: Record<string, number> = {
  'kestrel-bay': require('../../assets/art/kestrel-bay-poster.png'),
  'the-quiet-orchard': require('../../assets/art/the-quiet-orchard-poster.png'),
  'saltwater-static': require('../../assets/art/saltwater-static-poster.png'),
};
const BACKDROPS: Record<string, number> = {
  'kestrel-bay': require('../../assets/art/kestrel-bay-backdrop.jpg'),
  'the-quiet-orchard': require('../../assets/art/the-quiet-orchard-backdrop.jpg'),
  'saltwater-static': require('../../assets/art/saltwater-static-backdrop.jpg'),
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
