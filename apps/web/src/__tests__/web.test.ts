import { describe, expect, it, vi } from 'vitest';
import { captureToken, readToken, TOKEN_KEY } from '../token';
import { buildConfig } from '../config';
import { ApiFailure, LiveApiClient, MockApiClient } from '../api';
import { addRecent, defaultRecipients, householdsFromFriends, isFullCode, normalizeCode, posterUrl, sendLabel } from '../logic';

const TOKEN = 'wcp_' + 'A'.repeat(43);
function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe('token capture (review nice-to-have #3)', () => {
  it('moves /u/<token> into storage and strips it from the URL', () => {
    const storage = mem();
    const replaceState = vi.fn();
    expect(captureToken({ location: { pathname: `/u/${TOKEN}`, search: '', hash: '' }, storage, replaceState })).toBe('captured');
    expect(replaceState).toHaveBeenCalledWith('/');
    expect(storage.m.get(TOKEN_KEY)).toBe(TOKEN);
    expect(readToken(storage)).toBe(TOKEN);
  });
  it('keeps query (e.g. ?code=) but never the token', () => {
    const replaceState = vi.fn();
    captureToken({ location: { pathname: `/u/${TOKEN}/`, search: '?x=1', hash: '' }, storage: mem(), replaceState });
    expect(replaceState.mock.calls[0]![0]).toBe('/?x=1');
    expect(String(replaceState.mock.calls[0]![0])).not.toContain('wcp_');
  });
  it('malformed link: stripped, not stored', () => {
    const storage = mem();
    const replaceState = vi.fn();
    expect(captureToken({ location: { pathname: '/u/wcd_devicetokennotprofile', search: '', hash: '' }, storage, replaceState })).toBe('invalid-link');
    expect(replaceState).toHaveBeenCalledWith('/');
    expect(storage.m.size).toBe(0);
  });
  it('other paths untouched', () => {
    const replaceState = vi.fn();
    expect(captureToken({ location: { pathname: '/pair', search: '?code=K7Q4ZP', hash: '' }, storage: mem(), replaceState })).toBe('none');
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe('config guardrail', () => {
  it('live by default, mock refused in production', () => {
    expect(() => buildConfig({}, false)).toThrow(/VITE_API_URL is required/);
    expect(buildConfig({ VITE_API_URL: 'https://api.example.test/' }, false)).toMatchObject({ mode: 'live', apiUrl: 'https://api.example.test' });
    expect(buildConfig({ VITE_API_URL: 'same-origin' }, false, 'https://app.example.test').apiUrl).toBe('https://app.example.test');
    expect(() => buildConfig({ VITE_API_URL: 'ftp://x' }, false)).toThrow(/http\(s\)/);
    expect(() => buildConfig({ VITE_API_MODE: 'mock' }, false)).toThrow(/not allowed/);
    expect(buildConfig({ VITE_API_MODE: 'mock' }, true).mode).toBe('mock');
  });
});

describe('pairing code entry (ux §6.4)', () => {
  it('uppercases, strips spaces/dashes/invalid chars, caps at 6', () => {
    expect(normalizeCode('k7q-4zp')).toBe('K7Q4ZP');
    expect(normalizeCode(' k7q 4zp xx')).toBe('K7Q4ZP');
    expect(normalizeCode('O0I1L')).toBe(''); // ambiguous characters are not in the alphabet
    expect(isFullCode('K7Q4ZP')).toBe(true);
    expect(isFullCode('K7Q4Z')).toBe(false);
  });
});

describe('recipients', () => {
  const friends = [
    { id: 'u-kiran', displayName: 'Kiran', householdId: 'hh-k' },
    { id: 'u-sam', displayName: 'Sam', householdId: 'hh-s' },
    { id: 'u-sam2', displayName: 'Alex', householdId: 'hh-s' },
  ];
  const hh = householdsFromFriends(friends);
  it('labels households from friend names', () => {
    expect(hh.map((h) => h.label)).toEqual(["Kiran", "Sam and Alex"]);
  });
  it('defaults: last used (still valid) → only household → none', () => {
    expect(defaultRecipients(hh, ['hh-s', 'gone'])).toEqual(['hh-s']);
    expect(defaultRecipients(hh.slice(0, 1), null)).toEqual(['hh-k']);
    expect(defaultRecipients(hh, null)).toEqual([]);
  });
  it('send label names the recipient', () => {
    expect(sendLabel(hh, ['hh-k'])).toBe("Send to Kiran");
    expect(sendLabel(hh, ['hh-k', 'hh-s'])).toBe('Send to Kiran, Sam and Alex');
  });
  it('recent sends capped', () => {
    let l: { title: string; to: string; at: number }[] = [];
    for (let i = 0; i < 7; i++) l = addRecent(l, { title: `T${i}`, to: 'x', at: i });
    expect(l).toHaveLength(5);
    expect(l[0]!.title).toBe('T6');
  });
  it('poster: bundled art for demo titles, fallback otherwise', () => {
    expect(posterUrl('Kestrel Bay')).toBe('/art/kestrel-bay.jpg');
    expect(posterUrl('Unknown Show')).toBe('/art/fallback.jpg');
  });
});

describe('LiveApiClient', () => {
  const res = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
  it('validates and sends bearer + no-referrer', async () => {
    const f = vi.fn(async () => res(200, { results: [{ source: 'demo', id: 'kestrel-bay', mediaType: 'tv', title: 'Kestrel Bay' }] }));
    const api = new LiveApiClient('https://api.test', f as never);
    expect(await api.search(TOKEN, 'kes')).toHaveLength(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/titles/search?q=kes');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.referrerPolicy).toBe('no-referrer');
  });
  it('maps statuses: 403 unauthorized, 404/410/409, network → offline, drift → contract', async () => {
    const mk = (r: () => Promise<Response>) => new LiveApiClient('https://api.test', r as never);
    await expect(mk(async () => res(403, { message: 'Forbidden' })).me(TOKEN)).rejects.toMatchObject({ kind: 'unauthorized' });
    await expect(mk(async () => res(404, {})).pairComplete(TOKEN, 'K7Q4ZP')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(mk(async () => res(410, {})).pairComplete(TOKEN, 'K7Q4ZP')).rejects.toMatchObject({ kind: 'expired' });
    await expect(mk(async () => res(409, {})).pairComplete(TOKEN, 'K7Q4ZP')).rejects.toMatchObject({ kind: 'conflict' });
    await expect(mk(async () => { throw new TypeError('x'); }).me(TOKEN)).rejects.toMatchObject({ kind: 'offline' });
    await expect(mk(async () => res(200, { ids: 'nope' })).recommend(TOKEN, { titleRef: { source: 'demo', id: 'x' }, recipientHouseholdIds: ['h'] })).rejects.toBeInstanceOf(ApiFailure);
  });
  it('mock fixtures are contract-valid', async () => {
    const m = new MockApiClient('default', 0);
    expect((await m.me(TOKEN)).kind).toBe('profile');
    expect(await m.search(TOKEN, 'kes')).toHaveLength(1);
  });
});

import { serviceOptions } from '../logic';
describe('service picker (ADR-0012)', () => {
  it('live: Not sure first, real names, Other last; mock: generic names only', () => {
    const live = serviceOptions('live').map((o) => o.label);
    expect(live[0]).toBe('Not sure');
    expect(live).toContain('Netflix');
    expect(live.at(-1)).toBe('Other');
    const mock = serviceOptions('mock').map((o) => o.label);
    expect(mock).toEqual(['Not sure', 'Kitehouse', 'Pebblewave', 'Other']);
  });
  it('live app + demo-catalog title (CATALOG_MODE=demo, demo video): generic names only', () => {
    const labels = serviceOptions('live', 'demo').map((o) => o.label);
    expect(labels).toEqual(['Not sure', 'Kitehouse', 'Pebblewave', 'Other']);
    expect(serviceOptions('live', 'tmdb').map((o) => o.label)).toContain('Netflix');
    expect(serviceOptions('live', 'custom').map((o) => o.label)).toContain('Netflix');
  });
});

describe('free-text title fallback (no catalog match)', () => {
  it('builds a sanitized custom title and selector', async () => {
    const { customTitleRef, titleSelector, titleCaption, parseYear } = await import('../logic');
    const t = customTitleRef('  The <i>Long</i>\u0007  Night ');
    expect(t).toMatchObject({ source: 'custom', title: 'The i Long /i Night' });
    expect(titleSelector({ ...t, year: 2019 })).toEqual({ source: 'custom', title: 'The i Long /i Night', year: 2019 });
    expect(titleSelector({ source: 'demo', id: 'kestrel-bay', title: 'Kestrel Bay', mediaType: 'tv' })).toEqual({ source: 'demo', id: 'kestrel-bay' });
    expect(titleCaption({ ...t, year: 2019 })).toBe('2019 · Typed by you');
    const now = new Date('2026-10-12T12:00:00Z');
    expect([parseYear('', now), parseYear('2019', now), parseYear('19', now), parseYear('1700', now), parseYear('2030', now)]).toEqual([undefined, 2019, null, null, null]);
  });
});

describe('Me tab sign-in email survives tab switches', () => {
  it('withSavedEmail puts the verified email into the session me', async () => {
    const { withSavedEmail } = await import('../logic');
    const s = { k: 'ready', token: 't', me: { kind: 'profile', user: { id: 'u', displayName: 'U' }, householdId: 'h' }, households: [] };
    expect(withSavedEmail(s, 'a@example.com').me).toMatchObject({ email: 'a@example.com', user: { id: 'u' } });
    expect(withSavedEmail({ k: 'loading' }, 'a@example.com')).toEqual({ k: 'loading' });
  });
});

describe('signed-out welcome copy', () => {
  it('never names a person; email on → invite line, off → link copy', async () => {
    const { signedOutCopy } = await import('../logic');
    for (const emailOn of [true, false]) for (const invalid of [true, false]) {
      const c = signedOutCopy({ emailOn, invalid });
      expect(JSON.stringify(c)).not.toMatch(/Kiran|Priya|Sam|household/i);
      expect(c.linkLine).toBe(emailOn ? 'Have an invite or private link? Just open it.' : 'Open the Gottawatch link you were sent. It signs you in on this phone.');
      expect(!!c.notice).toBe(invalid);
    }
  });
});
