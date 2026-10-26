// Bundled demo catalog (plan §7: original, made-up titles so the video stays trademark-safe).
// Every title, year, runtime, genre and overview here is invented for the demo. Names are
// pending a name-collision check before the video is recorded.
// GROUNDED in the plan: Kestrel Bay is a series with 40-minute episodes; Saltwater Static is
// the live send in shot 2 of the demo video. Everything else is demo filler (change freely).
// Art: tools/poster-gen renders a Circle Art poster + backdrop for every id below.
import type { TitleRef } from "@gottawatch/contract";

const t = (
  id: string,
  mediaType: "tv" | "movie",
  title: string,
  year: number,
  runtime: number,
  genres: string[],
  overview: string,
): TitleRef => ({ source: "demo", id, mediaType, title, year, runtime, genres, overview });

export const DEMO_CATALOG: readonly TitleRef[] = [
  t("kestrel-bay", "tv", "Kestrel Bay", 2025, 40, ["Drama", "Mystery"],
    "A marine biologist comes home to a storm-battered harbor town and finds the old lighthouse logbooks don't match what anyone remembers."),
  t("the-quiet-orchard", "movie", "The Quiet Orchard", 2024, 108, ["Drama", "Romance"],
    "Two estranged siblings get one autumn to bring in their late grandmother's apple harvest, and to decide whether to sell the farm."),
  t("saltwater-static", "movie", "Saltwater Static", 2026, 97, ["Comedy", "Sci-Fi"],
    "A late-night pirate radio host starts getting calls from a fishing boat that went down thirty years ago."),
  t("small-hours-bakery", "tv", "Small Hours Bakery", 2026, 22, ["Comedy", "Romance"],
    "A 4 a.m. bakery, its sleep-deprived crew, and the regulars who keep them going until sunrise."),
  t("lanternfish-and-co", "tv", "Lanternfish and Co", 2025, 26, ["Comedy"],
    "The overnight crew of a struggling public aquarium tries to save it, one disastrous fundraiser at a time."),
  t("ninety-seconds-to-orbit", "movie", "Ninety Seconds to Orbit", 2025, 131, ["Sci-Fi", "Thriller"],
    "When a launch goes wrong, a ground crew has ninety seconds to talk a rookie pilot through an impossible fix."),
  t("the-paper-comet", "movie", "The Paper Comet", 2023, 92, ["Animation", "Family", "Adventure"],
    "A girl folds a paper comet that really flies, and has to return it to the sky before the whole town notices."),
  t("night-desk-at-hollow-pines", "tv", "Night Desk at Hollow Pines", 2024, 47, ["Mystery", "Thriller"],
    "A motel night clerk keeps a private ledger of the guests who check in but never check out."),
  t("copper-and-thistle", "tv", "Copper and Thistle", 2023, 55, ["Crime", "Drama", "History"],
    "Edinburgh, 1891: a coroner and a pickpocket form an uneasy partnership to solve the city's strangest deaths."),
  t("the-marigold-line", "movie", "The Marigold Line", 2024, 103, ["Romance", "Comedy"],
    "Two rival tour guides are stuck sharing one rickety sleeper train across the country, and one very small cabin."),
  t("fjordlight", "tv", "Fjordlight", 2025, 48, ["Documentary", "Nature"],
    "One remote fjord filmed across a full year: orcas in winter, midnight sun in summer, and the few families who live there."),
  t("the-birdie-rule", "movie", "The Birdie Rule", 2026, 118, ["Drama", "Sport"],
    "A retired badminton champion reluctantly coaches her stubborn teenage neighbor toward a national title."),
  t("below-quarry-lake", "tv", "Below Quarry Lake", 2024, 44, ["Mystery", "Drama"],
    "When the town quarry is drained for the first time in decades, a car that vanished in 1998 comes back up."),
  t("the-lighthouse-supper-club", "movie", "The Lighthouse Supper Club", 2022, 95, ["Comedy", "Drama"],
    "Five retirees open an illegal pop-up restaurant in a decommissioned lighthouse."),
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
