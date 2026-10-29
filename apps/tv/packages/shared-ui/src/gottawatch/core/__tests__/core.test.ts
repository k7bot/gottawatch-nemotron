import { describe, expect, it, vi } from 'vitest';
import { DeviceId, FeedResponse } from '@gottawatch/contract';
import { ApiFailure, LiveApiClient, kindForStatus } from '../api';
import { buildConfig } from '../config';
const LIVE = { EXPO_PUBLIC_API_URL: 'https://api.example.test', EXPO_PUBLIC_PWA_URL: 'https://app.example.test' };
import { MOCK_SCENARIOS, MockApiClient, mockFeed, mockTonight } from '../mock';
import { watchedLine, cardServiceName, handoffHeadline } from '../home';
import { greeting, hourIn } from '../home';
import { handoffRecommenders, chooseHero, countdown, friendHue, groupByTitle, isNew, metaLine, newBaseline, recOverline, splitCode, timeAgo } from '../home';
import { bytesToBase64Url, newDeviceId } from '../deviceId';

const NOW = Date.parse('2026-10-11T23:00:00Z');

function res(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  });
}

describe('config guardrails (ADR-0007)', () => {
  it('defaults to live mode and the deployed URL', () => {
    expect(() => buildConfig({}, false)).toThrow(/EXPO_PUBLIC_API_URL is required/);
    const c = buildConfig(LIVE, false);
    expect(c).toMatchObject({ apiMode: 'live', apiBaseUrl: 'https://api.example.test', handoffTipMs: 4000, feedPollMs: 20000, pairPollMs: 3000 });
    expect(c.pwaBaseUrl).toBe('https://app.example.test');
    expect(buildConfig({ ...LIVE, EXPO_PUBLIC_PWA_URL: 'none' }, false).pwaBaseUrl).toBeUndefined();
    expect(buildConfig({ EXPO_PUBLIC_API_URL: 'same-origin' }, false, 'https://tv.example.test').apiBaseUrl).toBe('https://tv.example.test');
  });
  it('refuses mock mode in a release build, allows it in dev', () => {
    expect(() => buildConfig({ EXPO_PUBLIC_API_MODE: 'mock' }, false)).toThrow(/not allowed in release/);
    expect(buildConfig({ EXPO_PUBLIC_API_MODE: 'mock' }, true).apiMode).toBe('mock');
    expect(() => buildConfig({ EXPO_PUBLIC_API_MODE: 'fake' }, true)).toThrow();
  });
  it('dev tags only in dev builds or when explicitly enabled', () => {
    expect(buildConfig(LIVE, false).showDevTags).toBe(false);
    expect(buildConfig({ ...LIVE, EXPO_PUBLIC_DEV_TAGS: '1' }, false).showDevTags).toBe(true);
  });
});

describe('LiveApiClient', () => {
  const token = 'wcd_x';
  it('maps statuses to failure kinds (tv-app §3.7)', () => {
    expect(kindForStatus(401)).toBe('unauthorized');
    expect(kindForStatus(403)).toBe('unauthorized');
    expect(kindForStatus(404)).toBe('gone');
    expect(kindForStatus(410)).toBe('gone');
    expect(kindForStatus(429)).toBe('retryable');
    expect(kindForStatus(503)).toBe('retryable');
    expect(kindForStatus(400)).toBe('client');
  });
  it('validates responses against the contract and sends the bearer token', async () => {
    const items = mockFeed(NOW, 'default');
    const f = vi.fn(async () => res(200, { items }));
    const api = new LiveApiClient('https://api.test', f as never);
    expect(await api.feed(token)).toHaveLength(4);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/feed?limit=50');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer wcd_x');
  });
  it('contract drift is a visible "contract" failure', async () => {
    const bad = { items: [{ id: 'x', title: 'T', createdAt: 'yesterday' }] };
    const api = new LiveApiClient('https://api.test', (async () => res(200, bad)) as never);
    await expect(api.feed(token)).rejects.toMatchObject({ kind: 'contract' });
  });
  it('204 on /tonight is null without parsing the empty body', async () => {
    const api = new LiveApiClient('https://api.test', (async () => res(204)) as never);
    expect(await api.tonight(token)).toBeNull();
  });
  it('gateway 403 with a non-ErrorBody body → unauthorized; network error → retryable', async () => {
    const a = new LiveApiClient('https://api.test', (async () => res(403, { message: 'Forbidden' })) as never);
    await expect(a.me(token)).rejects.toMatchObject({ kind: 'unauthorized', status: 403 });
    const b = new LiveApiClient('https://api.test', (async () => {
      throw new TypeError('Network request failed');
    }) as never);
    await expect(b.me(token)).rejects.toBeInstanceOf(ApiFailure);
    await expect(b.me(token)).rejects.toMatchObject({ kind: 'retryable' });
  });
  it('pair/status 410 → gone (request a new code, MF-4)', async () => {
    const api = new LiveApiClient('https://api.test', (async () => res(410, { error: { code: 'expired', message: 'x' } })) as never);
    await expect(api.pairStatus('ABCDEF', 'a'.repeat(22))).rejects.toMatchObject({ kind: 'gone' });
  });
});

describe('MockApiClient', () => {
  const fast = { latencyMs: [0, 0] as [number, number] };
  it('every scenario fixture is contract-valid', () => {
    for (const s of MOCK_SCENARIOS) {
      expect(() => FeedResponse.parse({ items: mockFeed(NOW, s) })).not.toThrow();
      mockTonight(s);
    }
  });
  it('pairing: pending until autoPair, then a one-time wcd_ token; expiry → gone', async () => {
    let now = NOW;
    const api = new MockApiClient({ ...fast, now: () => now, autoPairMs: 5000, pairTtlMs: 60_000 });
    const dev = 'mockdevice0000000000000';
    const { code } = await api.pairStart(dev);
    expect(await api.pairStatus(code, dev)).toEqual({ status: 'pending' });
    await expect(api.pairStatus(code, 'otherdevice00000000000000')).rejects.toMatchObject({ kind: 'gone' });
    now += 6000;
    const s = await api.pairStatus(code, dev);
    expect(s.status).toBe('paired');
    await expect(api.pairStatus(code, dev)).rejects.toMatchObject({ kind: 'gone' });
    const c2 = (await api.pairStart(dev)).code;
    now += 61_000;
    await expect(api.pairStatus(c2, dev)).rejects.toMatchObject({ kind: 'gone' });
  });
  it('Seen is per title and the pick falls back after its title is Seen', async () => {
    const api = new MockApiClient({ ...fast, now: () => NOW });
    await api.markSeen('wcd_t', 'mock-r2'); // Sam's Kestrel Bay
    const feed = await api.feed('wcd_t');
    expect(feed.map((i) => i.title)).toEqual(['The Quiet Orchard', 'Saltwater Static']);
    expect(await api.tonight('wcd_t')).toMatchObject({ source: 'fallback', title: 'The Quiet Orchard' });
  });
  it('error scenarios', async () => {
    await expect(new MockApiClient({ ...fast, scenario: 'offline' }).feed('wcd_t')).rejects.toMatchObject({ kind: 'retryable' });
    await expect(new MockApiClient({ ...fast, scenario: 'server-error' }).feed('wcd_t')).rejects.toMatchObject({ kind: 'retryable', status: 500 });
    await expect(new MockApiClient({ ...fast, scenario: 'unpaired' }).me('wcd_stale')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(await new MockApiClient({ ...fast, scenario: 'nopick' }).tonight('wcd_t')).toBeNull();
  });
});

describe('home logic', () => {
  const items = mockFeed(NOW, 'default');
  it('groups one card per title, newest first, with distinct senders', () => {
    const cards = groupByTitle(items);
    expect(cards.map((c) => c.title)).toEqual(['Kestrel Bay', 'The Quiet Orchard', 'Saltwater Static']);
    expect(cards[0]!.senders.map((s) => s.name)).toEqual(['Priya', 'Sam']);
    expect(cards[0]!.recIds).toEqual(['mock-r1', 'mock-r2']);
    expect(recOverline(cards[0]!, NOW)).toBe('From Priya and Sam');
    expect(recOverline(cards[1]!, NOW)).toBe('From Maya · Fri');
  });
  it('hero: pick → fallback label → newest → empty (UXQ-06)', () => {
    const cards = groupByTitle(items);
    expect(chooseHero(cards, mockTonight('default'))).toMatchObject({ kind: 'pick', card: { title: 'Kestrel Bay' } });
    expect(chooseHero(cards, mockTonight('fallback')).kind).toBe('fallback');
    expect(chooseHero(cards, null)).toMatchObject({ kind: 'newest', card: { title: 'Kestrel Bay' } });
    expect(chooseHero([], null).kind).toBe('empty');
  });
  it('"n new" baseline: last session that ended > 30 min ago; short breaks keep the old baseline', () => {
    expect(newBaseline(undefined, undefined, NOW)).toBeUndefined();
    expect(newBaseline(NOW - 2 * 3600_000, undefined, NOW)).toBe(NOW - 2 * 3600_000);
    expect(newBaseline(NOW - 5 * 60_000, NOW - 5 * 3600_000, NOW)).toBe(NOW - 5 * 3600_000);
    const card = groupByTitle(items)[0]!;
    expect(isNew(card, NOW - 4 * 3600_000)).toBe(true);
    expect(isNew(card, NOW - 3600_000)).toBe(false);
    expect(isNew(card, undefined)).toBe(false);
  });
  it('copy helpers', () => {
    expect(timeAgo(new Date(NOW - 30_000).toISOString(), NOW)).toBe('just now');
    expect(timeAgo(new Date(NOW - 12 * 60_000).toISOString(), NOW)).toBe('12 min ago');
    expect(timeAgo(new Date(NOW - 2 * 3600_000).toISOString(), NOW)).toBe('2h ago');
    expect(timeAgo(new Date(NOW - 30 * 3600_000).toISOString(), NOW)).toBe('yesterday');
    expect(metaLine(items[0]!)).toBe('Series  ·  40-min episodes');
    expect(splitCode('K7Q4ZP')).toEqual(['K7Q', '4ZP']);
    expect(countdown(9 * 60_000 + 41_000)).toBe('9:41');
    expect(friendHue('u-priya')).toBe('sky');
    expect(['sky', 'sage', 'lilac', 'coral']).toContain(friendHue('u-judge-1'));
  });
});

describe('deviceId', () => {
  it('16 CSPRNG bytes → 22-char base64url accepted by the contract', () => {
    const id = newDeviceId((n) => new Uint8Array(n).map((_, i) => i * 37));
    expect(id).toHaveLength(22);
    expect(DeviceId.safeParse(id).success).toBe(true);
    expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
  });
});

describe('Watched history + undo (ux §5.5a)', () => {
  const fast = { latencyMs: [0, 0] as [number, number] };
  it('mock: seen → history (newest first) → unmark returns it to the feed', async () => {
    let t = NOW;
    const api = new MockApiClient({ ...fast, now: () => t });
    const feed = await api.feed('wcd_t');
    const a = feed[0]!;
    const b = feed.find((i) => i.title !== a.title)!;
    await api.markSeen('wcd_t', a.id);
    t += 1000;
    await api.markSeen('wcd_t', b.id);
    const h = await api.seenHistory('wcd_t');
    expect(h.map((i) => i.title)).toEqual([b.title, a.title]);
    expect((await api.feed('wcd_t')).some((i) => i.title === a.title)).toBe(false);
    await api.unmarkSeen('wcd_t', a.id);
    expect((await api.feed('wcd_t')).some((i) => i.title === a.title)).toBe(true);
    expect((await api.seenHistory('wcd_t')).map((i) => i.title)).toEqual([b.title]);
    await expect(api.unmarkSeen('wcd_t', 'nope')).rejects.toMatchObject({ kind: 'gone' });
  });
  it("mock 'history' scenario starts with watched titles hidden from the feed", async () => {
    const api = new MockApiClient({ ...fast, scenario: 'history', now: () => NOW });
    const h = await api.seenHistory('wcd_t');
    expect(h.length).toBe(2);
    const feed = await api.feed('wcd_t');
    expect(feed.some((i) => h.some((x) => x.title === i.title))).toBe(false);
  });
  it('live client: DELETE …/seen and GET /seen are validated', async () => {
    const calls: { url: string; method?: string }[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      const body = url.includes('/seen?') ? { items: [{ id: 'r1', from: { id: 'u-priya', displayName: 'Priya' }, title: 'Kestrel Bay', service: null, createdAt: '2026-10-11T20:00:00.000Z', seenAt: '2026-10-12T01:00:00.000Z' }] } : { ok: true };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const api = new LiveApiClient('https://x', f as unknown as typeof fetch);
    await api.unmarkSeen('wcd_t', 'r 1');
    const items = await api.seenHistory('wcd_t', 10);
    expect(calls[0]).toEqual({ url: 'https://x/recommendations/r%201/seen', method: 'DELETE' });
    expect(calls[1]!.url).toBe('https://x/seen?limit=10');
    expect(items[0]!.seenAt).toBe('2026-10-12T01:00:00.000Z');
  });
  it('watchedLine', () => {
    const now = Date.parse('2026-10-12T16:00:00');
    expect(watchedLine('Priya', '2026-10-12T09:00:00', now)).toBe('From Priya · watched today');
    expect(watchedLine('Sam', '2026-10-11T22:00:00', now)).toBe('From Sam · watched yesterday');
    expect(watchedLine('Sam', '2026-10-09T10:00:00', now)).toBe('From Sam · watched Fri');
    expect(watchedLine('Maya', '2026-09-30T10:00:00', now)).toBe('From Maya · watched Sep 30');
  });
});

describe('service on TV (ADR-0012)', () => {
  const it_ = (id: string, title: string, service: string | null, h: number) => ({ id, from: { id: 'u-' + id, displayName: id }, title, service, createdAt: new Date(NOW - h * 3600000).toISOString() });
  it('card shows the most common named service; ties go to the newest; Not sure never wins', () => {
    const cards = groupByTitle([it_('a', 'X', 'hulu', 5), it_('b', 'X', 'netflix', 1), it_('c', 'X', 'hulu', 9), it_('d', 'Y', null, 1), it_('e', 'Y', 'max', 3), it_('f', 'Z', 'hulu', 3), it_('g', 'Z', 'max', 1), it_('h', 'W', null, 1)] as never);
    const by = Object.fromEntries(cards.map((c) => [c.title, cardServiceName(c)]));
    expect(by).toEqual({ X: 'Hulu', Y: 'Max', Z: 'Max', W: null });
  });
  it('handoff headline names the app or falls back to the generic copy', () => {
    expect(handoffHeadline('Kitehouse', 'Kestrel Bay')).toBe('Open Kitehouse and search for “Kestrel Bay”');
    expect(handoffHeadline(null, 'Kestrel Bay')).toBe('Search for:');
  });
  it('mock data uses generic demo services only', () => {
    const names = mockFeed(NOW, 'default').map((i) => i.service);
    expect(names.every((s) => s === null || s === 'app_a' || s === 'app_b')).toBe(true);
  });
});

describe('handoff detail lists every recommender (ux §5.4, OQ-19 one card per title)', () => {
  it('shows Priya and Sam with notes and services for a two-sender title', () => {
    const card = groupByTitle(mockFeed(NOW, 'default')).find((c) => c.title === 'Kestrel Bay')!;
    const d = handoffRecommenders(card);
    expect(d.heading).toBe('Priya and Sam recommend');
    expect(d.rows.map((r) => [r.name, r.serviceName])).toEqual([['Priya', 'Kitehouse'], ['Sam', 'Kitehouse']]);
    expect(d.rows[0]!.note).toBeTruthy();
    expect(d.more).toBe(0);
  });
  it('singular heading and overflow', () => {
    const s = (i: number) => ({ id: `u${i}`, name: `F${i}`, at: '', service: null });
    expect(handoffRecommenders({ senders: [s(1)] }).heading).toBe('F1 recommends');
    const d = handoffRecommenders({ senders: [1, 2, 3, 4, 5].map(s) });
    expect([d.rows.length, d.more, d.heading]).toEqual([3, 2, 'F1, F2, F3, F4 and F5 recommend']);
  });
});

describe('peopleLabel: names only in the UI', () => {
  it('drops "household"', async () => {
    const { peopleLabel } = await import('../home');
    expect([peopleLabel("Kiran's household"), peopleLabel('Kiran’s household'), peopleLabel('Priya'), peopleLabel('Household')]).toEqual(['Kiran', 'Kiran', 'Priya', 'Household']);
  });
});

describe('greeting uses the household zone, not the device clock zone', () => {
  // 20:30 UTC on Oct 14 = 4:30 PM in New York, 1:30 PM in Los Angeles, 05:30 next day in Tokyo.
  const t = new Date('2026-10-14T20:30:00Z');
  it('defaults to America/New_York', () => {
    expect(hourIn(t)).toBe(16);
    expect(greeting(t)).toBe('Good afternoon');
  });
  it('uses the saved zone', () => {
    expect(greeting(t, 'America/Los_Angeles')).toBe('Good afternoon');
    expect(greeting(t, 'Asia/Tokyo')).toBe('Good morning');
    expect(greeting(new Date('2026-10-14T23:30:00Z'), 'America/New_York')).toBe('Good evening');
  });
  it('midnight is hour 0 and an unknown zone falls back to the device clock', () => {
    expect(hourIn(new Date('2026-10-15T04:00:00Z'), 'America/New_York')).toBe(0);
    expect(hourIn(t, 'Not/AZone')).toBe(t.getHours());
  });
});

import { ASK_QUERY_MAX, askBackdropTitle, askFocusAfter, askedLine, askErrorCopy, askSourceLine, askTraceLine, typedQuery, typingHint, TV_ASK_CHIPS, TV_NO_MATCH_HINT, TV_OFF_TOPIC_HINT } from '../ask';

describe('Ask on the TV', () => {
  it('mock ask returns contract-valid picks from the feed, movie chip narrows to the movie', async () => {
    const m = new MockApiClient({ latencyMs: [0, 0] });
    const r = await m.ask('wcd_x', ['short']);
    expect(r.picks.map((p) => p.title)).toEqual(['Kestrel Bay', 'The Quiet Orchard']);
    expect((await m.ask('wcd_x', ['movie'])).picks.map((p) => p.title)).toEqual(['The Quiet Orchard']);
    await m.markSeen('wcd_x', 'mock-r3');
    expect((await m.ask('wcd_x', ['movie'])).picks).toEqual([]);
  });
  it('trace line names the model, what it read, the quote check and the time', async () => {
    const r = await new MockApiClient({ latencyMs: [0, 0] }).ask('wcd_x', ['short']);
    expect(askTraceLine(r)).toBe("Nemotron 3 Super on Nebius · read your circle's picks · skipped what you watched · checked 1 quote word for word · 3.0s");
    expect(askTraceLine({ source: 'fallback', trace: [], picks: [] })).toBe('Ranked by friend count');
  });
  it('nothing fits: status no_match, no picks, the closest one offered (not as a best bet), no backdrop', async () => {
    const m = new MockApiClient({ latencyMs: [0, 0] });
    await m.markSeen('wcd_x', 'mock-r3');
    const r = await m.ask('wcd_x', ['movie']);
    expect(r).toMatchObject({ status: 'no_match', picks: [], closest: { title: 'Kestrel Bay' } });
    expect(r.answer).toMatch(/None of your circle's picks/);
    expect(askBackdropTitle(r)).toBeUndefined();
    expect(askTraceLine(r)).toBe("Nemotron 3 Super on Nebius · read your circle's picks · skipped what you watched · nothing fit, so it says so · 3.0s");
    expect(TV_NO_MATCH_HINT).toMatch(/ask a friend/);
    const forced = await new MockApiClient({ latencyMs: [0, 0], scenario: 'ask-nomatch' }).ask('wcd_x', ['short']);
    expect(forced).toMatchObject({ status: 'no_match', picks: [], closest: { title: 'The Quiet Orchard' } });
  });
  it('off topic (phone-only today) renders without picks; older answers without status still read as ok', async () => {
    const r = await new MockApiClient({ latencyMs: [0, 0], scenario: 'ask-offtopic' }).ask('wcd_x', ['short']);
    expect(r).toMatchObject({ status: 'off_topic', picks: [] });
    expect(askBackdropTitle(r)).toBeUndefined();
    expect(askTraceLine(r)).toMatch(/not a what-to-watch question/);
    expect(askSourceLine({ source: 'fallback', status: 'off_topic' })).toBe('Checked by Gottawatch');
    const ok = await new MockApiClient({ latencyMs: [0, 0] }).ask('wcd_x', ['short']);
    expect(ok.status).toBe('ok');
    expect(askBackdropTitle(ok)).toBe('Kestrel Bay');
    expect(askBackdropTitle({ picks: ok.picks })).toBe('Kestrel Bay');
  });
  it('typed question: empty does nothing, spaces collapse, capped at the contract max', () => {
    expect(typedQuery('')).toBeUndefined();
    expect(typedQuery('   \n ')).toBeUndefined();
    expect(typedQuery('  something   spooky\tbut cozy ')).toBe('something spooky but cozy');
    expect(typedQuery('x'.repeat(ASK_QUERY_MAX + 40))).toHaveLength(ASK_QUERY_MAX);
    expect(ASK_QUERY_MAX).toBe(300);
  });
  it('typing hint names the right keys and counts down near the limit', () => {
    expect(typingHint('android', 10)).toBe('Press Done to ask · Back to cancel');
    expect(typingHint('web', 10)).toBe('Press Enter to ask · Esc to cancel');
    expect(typingHint('android', ASK_QUERY_MAX - 20)).toBe('Press Done to ask · Back to cancel · 20 left');
  });
  it('the typed question is shown above the answer (chips are not), long ones cut to one line', () => {
    expect(askedLine({ query: 'something spooky but cozy' })).toBe('You asked “something spooky but cozy”');
    expect(askedLine({ chip: 'short' })).toBeUndefined();
    expect(askedLine(undefined)).toBeUndefined();
    const long = askedLine({ query: 'word '.repeat(40).trim() })!;
    expect(long.length).toBeLessThan(100);
    expect(long.endsWith('…”')).toBe(true);
  });
  it('mock ask takes the query path: ok, no_match and off_topic', async () => {
    const m = new MockApiClient({ latencyMs: [0, 0] });
    const ok = await m.ask('wcd_x', [], 'something spooky but cozy');
    expect(ok).toMatchObject({ status: 'ok' });
    expect(ok.picks.length).toBeGreaterThan(0);
    const none = await m.ask('wcd_x', [], 'a Korean horror movie');
    expect(none).toMatchObject({ status: 'no_match', picks: [], closest: { title: 'The Quiet Orchard' } });
    const off = await m.ask('wcd_x', [], "what's the capital of France");
    expect(off).toMatchObject({ status: 'off_topic', picks: [] });
    expect(TV_OFF_TOPIC_HINT).toBe('Press OK to rephrase, or pick a mood.');
  });
  it('after an answer, focus stays on what asked: the typed tile (any status) or the chip', () => {
    expect(askFocusAfter({ query: "what's the capital of France" })).toBe('typed');
    expect(askFocusAfter({ query: 'a Korean horror movie' })).toBe('typed');
    expect(askFocusAfter({ chip: 'short' })).toBe('short');
  });
  it('live client sends a typed question as the query with no chips', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 'off_topic', answer: 'x', picks: [], source: 'nemotron-agent', trace: [] }), { status: 200 }));
    const r = await new LiveApiClient('', f as never).ask('wcd_x', [], "what's the capital of France");
    expect(r.status).toBe('off_topic');
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ query: "what's the capital of France", chips: [] });
  });
  it('429 and offline get their own copy; chips are short enough for one row', async () => {
    await expect(new MockApiClient({ latencyMs: [0, 0], scenario: 'ask-limit' }).ask('wcd_x', ['funny'])).rejects.toMatchObject({ status: 429 });
    expect(askErrorCopy(new ApiFailure('retryable', 'HTTP 429', 429))).toMatch(/few minutes/);
    expect(askErrorCopy(new ApiFailure('retryable', 'Network error'))).toMatch(/connection/);
    expect(TV_ASK_CHIPS.reduce((n, c) => n + c.label.length, 0)).toBeLessThan(50);
  });
  it('live client posts chips to /ask with a longer timeout', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ answer: 'x', picks: [], source: 'fallback', trace: [] }), { status: 200 }));
    const r = await new LiveApiClient('', f as never).ask('wcd_x', ['light']);
    expect(r.source).toBe('fallback');
    expect(r.status).toBe('ok'); // an older server without status parses as ok
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/ask');
    expect(JSON.parse(String(init.body))).toEqual({ query: '', chips: ['light'] });
  });
});

import { readFileSync } from 'node:fs';
describe('pairing words match the phone', () => {
  it("the pairing screen tells you to choose 'Connect a TV' and never says 'Pair a TV'", () => {
    const screen = readFileSync(new URL('../../screens/PairingScreen.tsx', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../../GottawatchApp.tsx', import.meta.url), 'utf8');
    expect(screen).toContain('`1 · ${TV_PAIR_STEP}`');
    expect(app).toContain('const UNPAIRED_BANNER = TV_DISCONNECTED_BANNER;');
    expect(screen + app).not.toMatch(/Pair a TV|Pair it again|Pair this TV/);
  });
});
