// Bundled demo catalog (plan §7: original, made-up titles so the video stays trademark-safe).
// Title names are pending the Oct 21 name-collision check (plan §7).
// GROUNDED in the plan: Kestrel Bay is a series with 40-minute episodes.
// DEMO FILLER (not from any source; change freely): mediaType of the other two titles.
// Deliberately no year/genres/overview/poster until the demo art and copy exist (plan Oct 17-18).
import type { TitleRef } from "@gottawatch/contract";

export const DEMO_CATALOG: readonly TitleRef[] = [
  { source: "demo", id: "kestrel-bay", mediaType: "tv", title: "Kestrel Bay", runtime: 40 },
  { source: "demo", id: "the-quiet-orchard", mediaType: "movie", title: "The Quiet Orchard" }, // mediaType: filler
  { source: "demo", id: "saltwater-static", mediaType: "movie", title: "Saltwater Static" }, // mediaType: filler
];

export function findDemoTitle(id: string): TitleRef | undefined {
  return DEMO_CATALOG.find((t) => t.id === id);
}

/** Case-insensitive substring match on the title; at most `limit` results. */
export function searchDemoCatalog(q: string, limit = 20): TitleRef[] {
  const needle = q.trim().toLocaleLowerCase();
  if (!needle) return [];
  return DEMO_CATALOG.filter((t) => t.title.toLocaleLowerCase().includes(needle)).slice(0, limit);
}
