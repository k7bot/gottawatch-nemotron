// Pure helpers (unit-tested): pairing-code normalization, recipients, labels, recent sends.
import { cleanCustomTitle, CUSTOM_YEAR_MIN, DEMO_SERVICES, LIVE_SERVICES, OTHER_SERVICE_ID, PAIR_CODE_ALPHABET, serviceName, PAIR_CODE_LENGTH, type CreateRecommendationRequest, type TitleRef } from '@gottawatch/contract';
import type { AskChip } from '@gottawatch/contract';
import type { Friend } from './api';

/** Uppercase, drop spaces/dashes and anything outside the pairing alphabet, max 6 (ux §6.4, R23). */
export function normalizeCode(input: string): string {
  let out = '';
  for (const ch of input.toUpperCase()) {
    if (PAIR_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length === PAIR_CODE_LENGTH) break;
  }
  return out;
}
export const isFullCode = (c: string) => c.length === PAIR_CODE_LENGTH && normalizeCode(c) === c;

export interface HouseholdChoice {
  householdId: string;
  label: string; // "Kiran" (names only in UI, never "household", Kiran Oct 12)
  short: string; // "Kiran"
  names?: string[];
}

/** Friends grouped by household. The API has no household names for friends (web-app.md §4). */
export function householdsFromFriends(friends: Friend[]): HouseholdChoice[] {
  const by = new Map<string, string[]>();
  for (const f of friends) by.set(f.householdId, [...(by.get(f.householdId) ?? []), f.displayName]);
  return [...by.entries()].map(([householdId, names]) => {
    const short = joinNames(names);
    return { householdId, short, label: short, names };
  });
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Default recipients: the last ones used that still exist, else the only household, else none. */
export function defaultRecipients(households: HouseholdChoice[], last: string[] | null): string[] {
  const ids = new Set(households.map((h) => h.householdId));
  const kept = (last ?? []).filter((id) => ids.has(id));
  if (kept.length) return kept;
  return households.length === 1 ? [households[0]!.householdId] : [];
}

export function sendLabel(households: HouseholdChoice[], selected: string[]): string {
  if (!selected.length) return 'Send';
  if (selected.length === 1) return `Send to ${households.find((h) => h.householdId === selected[0])?.label ?? 'them'}`;
  return `Send to ${namesFor(households, selected)}`;
}
function namesFor(households: HouseholdChoice[], selected: string[]): string {
  const names = households.filter((h) => selected.includes(h.householdId)).flatMap((h) => h.names ?? [h.short]);
  return names.length <= 3 ? joinNames(names) : `${names.length} friends`;
}
export function sentTo(households: HouseholdChoice[], selected: string[]): string {
  if (selected.length === 1) return households.find((h) => h.householdId === selected[0])?.label ?? 'them';
  return namesFor(households, selected);
}

// --- For you inbox (ADR-0013): one card per title, like the TV detail -------------------
export interface InboxGroup {
  key: string;
  title: string;
  year?: number;
  mediaType?: string;
  runtime?: number;
  poster?: string;
  /** Newest first. The first id is used for Seen (Seen is per title server-side). */
  recs: import('@gottawatch/contract').FeedItem[];
  senders: string[];
  latest: string;
}
export function groupInbox(items: import('@gottawatch/contract').FeedItem[]): InboxGroup[] {
  const by = new Map<string, InboxGroup>();
  for (const i of items) {
    const key = `${i.title.toLocaleLowerCase()}|${i.year ?? ''}`;
    let g = by.get(key);
    if (!g) {
      g = { key, title: i.title, year: i.year, mediaType: i.mediaType, runtime: i.runtime, poster: i.poster, recs: [], senders: [], latest: i.createdAt };
      by.set(key, g);
    }
    g.recs.push(i);
    if (!g.senders.includes(i.from.displayName)) g.senders.push(i.from.displayName);
    if (i.createdAt > g.latest) g.latest = i.createdAt;
  }
  const out = [...by.values()];
  for (const g of out) g.recs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out.sort((a, b) => (a.latest < b.latest ? 1 : -1));
}
/** "Priya recommends" / "Priya and Sam recommend". */
export function recommendLine(senders: string[]): string {
  return `${joinNames(senders)} ${senders.length === 1 ? 'recommends' : 'recommend'}`;
}


export interface RecentSend {
  title: string;
  to: string;
  at: number;
}
export function addRecent(list: RecentSend[], item: RecentSend, max = 5): RecentSend[] {
  return [item, ...list].slice(0, max);
}

export function timeAgo(at: number, now: number): string {
  const d = Math.max(0, now - at);
  if (d < 60_000) return 'just now';
  if (d < 3600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)}h ago`;
  if (d < 2 * 86400_000) return 'yesterday';
  return new Date(at).toLocaleDateString('en-US', { weekday: 'short' });
}

export const slugify = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
// Bundled demo-catalog art (tools/poster-gen writes apps/web/public/art/<slug>.jpg).
const ART = new Set([
  'kestrel-bay',
  'the-quiet-orchard',
  'saltwater-static',
  'small-hours-bakery',
  'lanternfish-and-co',
  'ninety-seconds-to-orbit',
  'the-paper-comet',
  'night-desk-at-hollow-pines',
  'copper-and-thistle',
  'the-marigold-line',
  'fjordlight',
  'the-birdie-rule',
  'below-quarry-lake',
  'the-lighthouse-supper-club',
]);
export const posterUrl = (title: string, poster?: string) => poster ?? (ART.has(slugify(title)) ? `/art/${slugify(title)}.jpg` : '/art/fallback.jpg');
export const hasOwnArt = (title: string, poster?: string) => !!poster || ART.has(slugify(title));

const HUES = ['#86BDEB', '#9ED3A9', '#D4A9E0', '#F08F7F'];
export function friendHue(id: string): string {
  const fixed: Record<string, string> = { 'u-priya': HUES[0]!, 'u-sam': HUES[1]!, 'u-maya': HUES[2]! };
  if (fixed[id]) return fixed[id]!;
  let h = 2166136261;
  for (const c of id) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return HUES[(h >>> 0) % HUES.length]!;
}
export const initials = (n: string) => {
  const p = n.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1]![0] : '')).toUpperCase();
};

export interface ServiceOption {
  value: string | null; // null = Not sure
  label: string;
  /** Brand dot colour (invented demo services only). */
  color?: string;
}
/**
 * "Where can they watch it?" choices (ADR-0012): Not sure first (the default), then real names in
 * the live app or the generic demo names in mock mode or for a demo-catalog title (server
 * CATALOG_MODE=demo, used for the trademark-safe demo video), then Other.
 */
export function serviceOptions(mode: 'live' | 'mock', titleSource?: TitleRef['source']): ServiceOption[] {
  const list = mode === 'mock' || titleSource === 'demo' ? DEMO_SERVICES : LIVE_SERVICES;
  return [{ value: null, label: 'Not sure' }, ...list.map((x) => ({ value: x.id, label: x.name, ...(x.color ? { color: x.color } : {}) })), { value: OTHER_SERVICE_ID, label: 'Other' }];
}

// --- Free-text fallback when search has no match (ux §6.2 update Oct 12, OQ-16) ---------------
/** A local TitleRef for a typed title; the server re-sanitizes and assigns the real id. */
export function customTitleRef(typed: string, year?: number): TitleRef {
  return { source: 'custom', id: 'custom', title: cleanCustomTitle(typed), ...(year !== undefined ? { year } : {}) };
}
/** What POST /recommendations gets for a picked title. */
export function titleSelector(t: TitleRef): CreateRecommendationRequest['titleRef'] {
  if (t.source === 'custom') return { source: 'custom', title: t.title, ...(t.year !== undefined ? { year: t.year } : {}) };
  if (t.source === 'tmdb') return { source: 'tmdb', id: t.id, mediaType: t.mediaType ?? 'movie' };
  return { source: 'demo', id: t.id };
}
/** Caption under a title: "2019 · Movie", or for a typed title "2019 · Typed by you". */
export function titleCaption(t: TitleRef): string {
  const kind = t.source === 'custom' ? 'Typed by you' : t.mediaType === 'tv' ? 'Series' : t.mediaType === 'movie' ? 'Movie' : '';
  return [t.year, kind].filter(Boolean).join(' · ');
}
/** "" → undefined (ok); a 4-digit year in range → number; anything else → null (invalid). */
export function parseYear(input: string, now = new Date()): number | undefined | null {
  const s = input.trim();
  if (!s) return undefined;
  if (!/^\d{4}$/.test(s)) return null;
  const y = Number(s);
  return y >= CUSTOM_YEAR_MIN && y <= now.getFullYear() + 3 ? y : null;
}

/** TMDB attribution required by their terms (About screens). */
export const TMDB_NOTICE = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';

/** Resize a TMDB poster URL (stored at w342) for lists, e.g. posterAt(url, 'w185'). Other URLs pass through. */
export function posterAt(url: string | undefined, size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500'): string | undefined {
  if (!url) return url;
  return url.replace(/^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+\//, `$1${size}/`);
}

// --- Where to watch (TMDB watch providers, US subscription; data by JustWatch) ----------------
export const JUSTWATCH_NOTICE = 'Where-to-watch info by JustWatch.';

/** Exactly one known subscription service → pre-select it; zero or several → let the sender pick. */
export function preselectService(providers: string[] | undefined): string | null {
  return providers && providers.length === 1 ? providers[0]! : null;
}

/** Known services first (in TMDB's order), then the usual list. */
export function orderServiceOptions(options: ServiceOption[], providers: string[] | undefined): ServiceOption[] {
  if (!providers?.length) return options;
  const known = providers.map((p) => options.find((o) => o.value === p)).filter((o): o is ServiceOption => !!o);
  return [...known, ...options.filter((o) => !known.includes(o))];
}

/** Gentle line under "Where can they watch it?", or null when nothing is known. */
export function providerHint(providers: string[] | undefined): string | null {
  const names = (providers ?? []).map((p) => serviceName(p)).filter((n): n is string => !!n);
  if (!names.length) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return names.length === 1
    ? `Looks like it's on ${list} in the US. Change it if they watch somewhere else.`
    : `Looks like it's on ${list} in the US. Pick the one they use.`;
}

// --- Ask Gottawatch (Nemotron on Nebius) ---------------------------------------------------
export const ASK_CHIPS: { id: AskChip; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'funny', label: 'Funny' },
  { id: 'light', label: 'Light' },
  { id: 'intense', label: 'Intense' },
  { id: 'together', label: 'Together' },
  { id: 'movie', label: 'Movie' },
  { id: 'show', label: 'Show' },
];
export const ASK_MAX_CHIPS = 5;
/** Toggle a chip; "movie" and "show" are mutually exclusive, and at most ASK_MAX_CHIPS stay on. */
export function toggleChip(on: AskChip[], c: AskChip): AskChip[] {
  if (on.includes(c)) return on.filter((x) => x !== c);
  const next = on.filter((x) => !(c === 'movie' && x === 'show') && !(c === 'show' && x === 'movie'));
  return [...next, c].slice(-ASK_MAX_CHIPS);
}
export const ASK_EXAMPLES = ['Something short and funny', "We're both tired", 'Worth staying up for', 'Something we can watch with the kids'];

export function askErrorCopy(kind: string): string {
  if (kind === 'offline') return "You're offline. Ask again when you're back.";
  if (kind === 'rate_limited') return "That's a lot of asking. Give it a few minutes, or just pick from the list below.";
  if (kind === 'unauthorized') return 'This link signed out. Open your Gottawatch link again.';
  return "Couldn't get an answer just now. Try again, or pick from the list below.";
}

/** Small honest label for where the answer came from. With no picks, nothing was "picked". */
export function askSourceLabel(source: string, status: string = 'ok'): string {
  const verb = status === 'ok' ? 'Picked' : 'Checked';
  if (source === 'nemotron-agent') return `${verb} by Nemotron 3 Super on Nebius`;
  if (source === 'nemotron-fast') return `${verb} by Nemotron 3 Nano on Nebius`;
  if (status === 'off_topic') return 'Checked by Gottawatch';
  if (status === 'no_match') return 'Checked by keyword (the AI was busy)';
  return 'Picked by friend count (the AI was busy)';
}

/** Questions to offer when the last one was off topic or nothing fit: one tap asks again. */
export const ASK_TRY = ['Something short and funny', 'Something we can all watch together', "What's the best movie my friends sent?"];

/** The gentle next step under a "nothing fits" answer. */
export const ASK_NO_MATCH_HINT = 'Know someone who has seen one? Ask them to send it your way.';

const TOOL_COPY: Record<string, string> = {
  get_friend_picks: "Read your friends' picks and notes",
  get_watch_history: "Checked what you've already watched",
  get_title_details: 'Looked up a title',
  search_catalog: 'Searched the catalog',
};
/** Plain-language trace rows for "How I picked this". */
export function askTraceRows(trace: { kind: string; label: string; detail?: string; ms?: number }[]): { text: string; meta?: string }[] {
  return trace.map((t) => {
    const ms = t.ms !== undefined ? (t.ms >= 1000 ? `${(t.ms / 1000).toFixed(1)}s` : `${t.ms}ms`) : undefined;
    if (t.kind === 'tool') return { text: TOOL_COPY[t.label] ?? t.label, ...(ms ? { meta: ms } : {}) };
    if (t.kind === 'model') {
      const name = /super/i.test(t.label) ? 'Nemotron 3 Super' : /nano/i.test(t.label) ? 'Nemotron 3 Nano' : t.label;
      const what = t.detail === 'answer' ? 'wrote the answer' : t.detail === 'one-shot rerank' ? 'ranked the picks' : /tool call/.test(t.detail ?? '') ? 'decided what to look up' : 'thought';
      return { text: `${name} ${what}`, ...(ms ? { meta: ms } : {}) };
    }
    if (t.label === 'grounding' && t.detail?.startsWith('status')) return { text: "Checked the answer against your friends' picks" };
    if (t.label === 'grounding') return { text: t.detail?.startsWith('dropped') ? 'Removed anything not backed by a friend' : "Checked every quote against your friends' notes" };
    if (t.label === 'fallback') return { text: 'Ranked by how many friends picked it' };
    const CHECKS: Record<string, string> = {
      'off topic': "Not a what-to-watch question, so no picks",
      'no match': "Nothing your friends sent fits, so it says so",
      nudge: "Reminded it to start from your friends' picks",
      'agent out of time': 'Took too long, so a faster model finished',
      'agent failed': 'The big model was busy',
      'fast model failed': 'The fast model was busy too',
      'agent used all rounds': 'Out of steps, so a faster model finished',
    };
    if (CHECKS[t.label]) return { text: CHECKS[t.label]! };
    return { text: t.label.charAt(0).toUpperCase() + t.label.slice(1) };
  });
}
