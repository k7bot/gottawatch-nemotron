// Pure Home-screen logic (ux-design §5.1, ADR-0009): grouping, Spotlight choice, "n new", copy helpers.
import { serviceName, summarizeService } from '@gottawatch/contract';
import type { FeedItem, Tonight } from './api';

/** One row card per title (ux §5.1 grouping); senders newest first. */
export interface TitleCard {
  key: string; // stable id for focus restore: normalized title
  title: string;
  recIds: string[]; // newest first
  primary: FeedItem; // newest rec of this title
  senders: { id: string; name: string; note?: string; at: string; service?: string | null }[];
  newestAt: string;
  /** Service id to show (ADR-0012): most common named one across the title's recs, ties → newest. */
  service: string | null;
}

export const titleKey = (title: string) => title.trim().toLocaleLowerCase();

export function groupByTitle(items: FeedItem[]): TitleCard[] {
  const sorted = [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const map = new Map<string, TitleCard>();
  for (const it of sorted) {
    const k = titleKey(it.title);
    let c = map.get(k);
    if (!c) {
      c = { key: k, title: it.title, recIds: [], primary: it, senders: [], newestAt: it.createdAt, service: null };
      map.set(k, c);
    }
    c.recIds.push(it.id);
    if (!c.senders.some((s) => s.id === it.from.id)) {
      c.senders.push({ id: it.from.id, name: it.from.displayName, ...(it.note ? { note: it.note } : {}), at: it.createdAt, service: it.service ?? null });
    }
  }
  const cards = [...map.values()];
  for (const c of cards) c.service = summarizeService(sorted.filter((i) => titleKey(i.title) === c.key));
  return cards;
}

/** Plain-text name for a card's service, or null for unknown / Other / Not sure. */
export const cardServiceName = (c: Pick<TitleCard, 'service'>) => serviceName(c.service);

/**
 * Handoff detail (ux §5.4, multi-recommender update Oct 12): one card per title (OQ-19 proposal),
 * so the detail lists every friend who sent it, newest first: "Priya and Sam recommend" + each
 * friend's note and service. Shows up to `max` rows; the rest collapse into "and N more".
 */
export function handoffRecommenders(card: Pick<TitleCard, 'senders'>, max = 3) {
  const names = card.senders.map((s) => s.name);
  const heading = names.length === 0 ? '' : `${joinNames(names)} recommend${names.length === 1 ? 's' : ''}`;
  const rows = card.senders.slice(0, max).map((s) => ({ id: s.id, name: s.name, note: s.note, serviceName: serviceName(s.service ?? null) }));
  return { heading, rows, more: Math.max(0, card.senders.length - max) };
}

/** Handoff headline (ux §5.4 + ADR-0012). */
export function handoffHeadline(service: string | null, title: string): string {
  return service ? `Open ${service} and search for “${title}”` : 'Search for:';
}

export type SpotlightKind = 'pick' | 'fallback' | 'newest' | 'empty';

export interface HeroChoice {
  kind: SpotlightKind;
  card?: TitleCard;
  tonight?: Tonight;
}

/** Tonight's pick if present (pick/stub/bedrock or fallback), else the newest rec, else empty (UXQ-06). */
export function chooseHero(cards: TitleCard[], tonight: Tonight | null | undefined): HeroChoice {
  if (tonight) {
    const card = cards.find((c) => c.recIds.includes(tonight.recId)) ?? cards.find((c) => titleKey(c.title) === titleKey(tonight.title));
    return { kind: tonight.source === 'fallback' ? 'fallback' : 'pick', card, tonight };
  }
  if (cards.length) return { kind: 'newest', card: cards[0] };
  return { kind: 'empty' };
}

/**
 * "n new" (ADR-0009): cards whose newest rec arrived after the end of the last session that
 * ended more than 30 min ago. `baseline` is fixed when the app opens and never reset while open.
 */
export const SESSION_GAP_MS = 30 * 60_000;
export function newBaseline(lastSessionEnd: number | undefined, previousBaseline: number | undefined, now: number): number | undefined {
  if (lastSessionEnd === undefined) return previousBaseline; // first run: nothing is "new" yet
  if (now - lastSessionEnd > SESSION_GAP_MS) return lastSessionEnd;
  return previousBaseline ?? lastSessionEnd; // short break: keep the earlier baseline
}
export const isNew = (card: TitleCard, baseline: number | undefined) =>
  baseline !== undefined && Date.parse(card.newestAt) > baseline;

/** "just now", "12 min ago", "2h ago", "yesterday", "Mon" (ux §8). */
export function timeAgo(iso: string, now: number): string {
  const t = Date.parse(iso);
  const d = Math.max(0, now - t);
  if (d < 60_000) return 'just now';
  if (d < 3600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < 24 * 3600_000) return `${Math.floor(d / 3600_000)}h ago`;
  if (d < 48 * 3600_000) return 'yesterday';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(t).getDay()]!;
}

/** UI shows people's names, never "household" (Kiran, Oct 12): "Kiran's household" → "Kiran". Data names unchanged. */
export const peopleLabel = (name: string) => name.replace(/[’']s household$/i, '').replace(/\s*household$/i, '').trim() || name;

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "FROM PRIYA · 2H AGO" / "FROM PRIYA AND SAM" (rendered uppercase via style, ux §8). */
export function recOverline(card: TitleCard, now: number): string {
  if (card.senders.length > 1) return `From ${joinNames(card.senders.map((s) => s.name))}`;
  return `From ${card.senders[0]?.name ?? 'your circle'} · ${timeAgo(card.newestAt, now)}`;
}

export function metaLine(item: FeedItem): string {
  const parts: string[] = [];
  if (item.mediaType === 'tv') parts.push('Series');
  else if (item.mediaType === 'movie') parts.push('Movie');
  for (const g of item.genres ?? []) parts.push(g);
  if (item.runtime) parts.push(item.mediaType === 'tv' ? `${item.runtime}-min episodes` : `${item.runtime} min`);
  if (item.year) parts.push(String(item.year));
  return parts.join('  ·  ');
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase();
}

const HUES = ['sky', 'sage', 'lilac', 'coral'] as const;
export type FriendHue = (typeof HUES)[number];
/** Deterministic hue from the person id (ux §2.1). Demo personas keep the mockup colours. */
export function friendHue(id: string): FriendHue {
  const fixed: Record<string, FriendHue> = { 'u-priya': 'sky', 'u-sam': 'sage', 'u-maya': 'lilac' };
  if (fixed[id]) return fixed[id]!;
  let h = 2166136261;
  for (const c of id) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return HUES[(h >>> 0) % HUES.length]!;
}

export const DEFAULT_TZ = 'America/New_York';

/** Hour 0–23 in an IANA zone; falls back to the device clock if the zone is unknown or Intl lacks zones. */
export function hourIn(d: Date, timeZone: string = DEFAULT_TZ): number {
  try {
    const h = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(d));
    if (Number.isInteger(h) && h >= 0 && h <= 24) return h % 24;
  } catch {
    /* unknown zone */
  }
  return d.getHours();
}

/** Greets in the household's saved zone (default America/New_York), never the device's (emulators often run UTC). */
export function greeting(d: Date, timeZone: string = DEFAULT_TZ): string {
  const h = hourIn(d, timeZone);
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** "K7Q4ZP" → ["K7Q", "4ZP"] (ux §5.3). */
export const splitCode = (code: string): [string, string] => [code.slice(0, 3), code.slice(3)];

export function countdown(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Watched history line (ux §5.5a): "From Priya · watched today / yesterday / Tue / Oct 3". */
export function watchedLine(fromName: string, seenAt: string, now: number): string {
  const d = new Date(seenAt);
  const day = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const diff = Math.round((day(new Date(now)) - day(d)) / 86400000);
  const when =
    diff <= 0 ? 'today' : diff === 1 ? 'yesterday' : diff < 7 ? d.toLocaleDateString('en-US', { weekday: 'short' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `From ${fromName} · watched ${when}`;
}

/** Toast timing (ux §5.5a). */
export const UNDO_TOAST_MS = 6000;
export const INFO_TOAST_MS = 3000;
