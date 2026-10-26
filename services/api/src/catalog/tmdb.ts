// TMDB catalog (CATALOG_MODE=tmdb). Real titles, years, posters and runtimes from The Movie Database.
// The v4 read token lives only in SSM SecureString (TMDB_PARAM_NAME); read once per cold start, never logged.
// Hackathon rules: the demo video must not show real posters/service names, so CATALOG_MODE=demo stays available.
// "This product uses the TMDB API but is not endorsed or certified by TMDB." (shown on About screens)
import type { TitleRef } from "@gottawatch/contract";
import type { Store } from "../lib/store.js";

export const TMDB_IMG = "https://image.tmdb.org/t/p/";
/** Stored poster size; clients swap to w185 for lists via posterAt(). */
export const POSTER_SIZE = "w342";
const TTL_MS = 7 * 24 * 3600 * 1000;

export type FetchJson = (path: string) => Promise<unknown>;

export interface Catalog {
  mode: "demo" | "tmdb";
  search(q: string): Promise<TitleRef[]>;
  /** Server-side metadata for a selected title (never trusted from the client). */
  get(id: string, mediaType?: "movie" | "tv"): Promise<TitleRef | undefined>;
}

interface TmdbItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  runtime?: number;
  episode_run_time?: number[];
  genres?: { name: string }[];
  popularity?: number;
  "watch/providers"?: { results?: Record<string, { flatrate?: { provider_id: number; provider_name: string }[] }> };
}

/** TMDB provider ids (US) → our service ids. Add-on channels (e.g. "... Amazon Channel") are skipped on purpose. */
export const PROVIDER_MAP: Record<number, string> = {
  8: "netflix", 1796: "netflix",
  9: "prime_video", 119: "prime_video", 2100: "prime_video",
  337: "disney_plus",
  15: "hulu",
  1899: "max", 384: "max",
  350: "apple_tv",
  188: "youtube",
  386: "peacock", 387: "peacock",
  531: "paramount_plus", 2303: "paramount_plus", 2616: "paramount_plus",
};

/** Supported US subscription services, in TMDB's display order, de-duplicated. */
export function usProviders(it: TmdbItem): string[] {
  const flat = it["watch/providers"]?.results?.US?.flatrate ?? [];
  return [...new Set(flat.map((p) => PROVIDER_MAP[p.provider_id]).filter((x): x is string => !!x))];
}

export function toTitleRef(it: TmdbItem, mediaType: "movie" | "tv"): TitleRef | undefined {
  const title = (it.title ?? it.name ?? "").trim();
  if (!title || !Number.isInteger(it.id)) return undefined;
  const yr = Number((it.release_date ?? it.first_air_date ?? "").slice(0, 4));
  const runtime = mediaType === "movie" ? it.runtime : it.episode_run_time?.[0];
  return {
    source: "tmdb",
    id: String(it.id),
    mediaType,
    title,
    ...(yr > 1800 ? { year: yr } : {}),
    ...(it.poster_path ? { poster: `${TMDB_IMG}${POSTER_SIZE}${it.poster_path}` } : {}),
    ...(runtime && runtime > 0 ? { runtime: Math.round(runtime) } : {}),
    ...(it.genres?.length ? { genres: it.genres.map((g) => g.name).slice(0, 3) } : {}),
    ...(it.overview ? { overview: it.overview.slice(0, 600) } : {}),
  };
}

export function tmdbFetcher(getToken: () => Promise<string>, fetchImpl: typeof fetch = fetch): FetchJson {
  return async (path) => {
    const token = await getToken();
    const r = await fetchImpl(`https://api.themoviedb.org/3${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`TMDB ${r.status}`);
    return r.json();
  };
}

export function tmdbCatalog(fetchJson: FetchJson, store: Store, now: () => Date = () => new Date()): Catalog {
  return {
    mode: "tmdb",
    async search(q) {
      const body = (await fetchJson(`/search/multi?query=${encodeURIComponent(q.trim())}&include_adult=false&language=en-US&page=1`)) as { results?: TmdbItem[] };
      return (body.results ?? [])
        .filter((it) => it.media_type === "movie" || it.media_type === "tv")
        .map((it) => toTitleRef(it, it.media_type as "movie" | "tv"))
        .filter((t): t is TitleRef => !!t)
        .slice(0, 20);
    },
    async get(id, mediaType) {
      if (!/^\d{1,10}$/.test(id) || !mediaType) return undefined;
      const key = `${mediaType}-${id}`;
      const hit = await store.getTitle(key);
      // Entries cached before providers existed (no `providers` field) are refreshed once.
      if (hit && hit.title.providers && now().getTime() - Date.parse(hit.cachedAt) < TTL_MS) return hit.title;
      let it: TmdbItem;
      try {
        it = (await fetchJson(`/${mediaType}/${id}?language=en-US&append_to_response=watch/providers`)) as TmdbItem;
      } catch (e) {
        if (hit) return hit.title; // stale beats failing the send
        if (String(e).includes("TMDB 404")) return undefined;
        throw e;
      }
      const base = toTitleRef(it, mediaType);
      const t = base && { ...base, providers: usProviders(it) };
      if (t) await store.putTitle({ key, title: t, cachedAt: now().toISOString() }, new Date(now().getTime() + 30 * TTL_MS));
      return t;
    },
  };
}
