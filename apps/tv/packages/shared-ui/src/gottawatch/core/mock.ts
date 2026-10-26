// In-app fake API (ADR-0007): same ApiClient interface, fixtures validated against the contract,
// realistic latency + real-timestamp pairing expiry, scenario-based error injection.
// Fixtures use only the made-up demo catalog and personas (plan §7). DEV BUILDS ONLY (config.ts).
import { FeedResponse, PAIR_CODE_ALPHABET, SeenHistoryResponse, TonightResponse } from '@gottawatch/contract';
import { ApiFailure, type ApiClient, type FeedItem, type Me, type PairStart, type PairStatus, type SeenItem, type Tonight } from './api';

export type MockScenario =
  | 'default' // bedrock pick, 4 recs
  | 'stub'
  | 'fallback'
  | 'nopick' // /tonight 204 → Spotlight shows the newest rec
  | 'empty' // 0 recs
  | 'offline' // every call fails like a network error
  | 'unpaired' // stored token rejected (401) → re-pair banner
  | 'server-error' // /feed 500
  | 'handoff' // same data as default (kept for old screenshot URLs)
  | 'history' // two titles already watched (Watched screen)
  | 'history-error'; // GET /seen fails

export const MOCK_SCENARIOS: MockScenario[] = ['default', 'stub', 'fallback', 'nopick', 'empty', 'offline', 'unpaired', 'server-error', 'handoff', 'history', 'history-error'];

export interface MockOptions {
  scenario?: string;
  latencyMs?: [number, number];
  autoPairMs?: number;
  pairTtlMs?: number;
  now?: () => number;
  random?: () => number;
}

const HOUR = 3600_000;

export function mockFeed(now: number, scenario: string): FeedItem[] {
  if (scenario === 'empty') return [];
  const items: FeedItem[] = [
    {
      id: 'mock-r1',
      from: { id: 'u-priya', displayName: 'Priya' },
      title: 'Kestrel Bay',
      mediaType: 'tv',
      runtime: 40,
      note: '40-min episodes, start at ep 2',
      service: 'app_a', // generic demo ids only (ADR-0012)
      createdAt: new Date(now - 3 * HOUR).toISOString(),
    },
    {
      id: 'mock-r2',
      from: { id: 'u-sam', displayName: 'Sam' },
      title: 'Kestrel Bay',
      mediaType: 'tv',
      runtime: 40,
      service: 'app_a',
      createdAt: new Date(now - 26 * HOUR).toISOString(),
    },
    {
      id: 'mock-r3',
      from: { id: 'u-maya', displayName: 'Maya' },
      title: 'The Quiet Orchard',
      mediaType: 'movie',
      service: 'app_b',
      createdAt: new Date(now - 50 * HOUR).toISOString(),
    },
    {
      id: 'mock-r4',
      from: { id: 'u-sam', displayName: 'Sam' },
      title: 'Saltwater Static',
      mediaType: 'movie',
      service: null,
      createdAt: new Date(now - 96 * HOUR).toISOString(),
    },
  ];
  return FeedResponse.parse({ items }).items; // guardrail 2: fixtures must match the contract
}

export function mockTonight(scenario: string): Tonight | null {
  if (scenario === 'nopick' || scenario === 'empty') return null;
  const base = { recId: 'mock-r1', title: 'Kestrel Bay' };
  const t =
    scenario === 'fallback'
      ? { ...base, reason: 'Recommended by 2 friends this week', source: 'fallback' as const }
      : scenario === 'stub'
        ? { ...base, reason: 'Priya and Sam both recommended it. Episodes run about 40 minutes.', source: 'stub' as const }
        : { ...base, reason: "Priya and Sam both loved it, and it's a 40-minute episode, which works for a weeknight.", source: 'bedrock' as const };
  return TonightResponse.parse(t);
}

export class MockApiClient implements ApiClient {
  readonly mode = 'mock' as const;
  private scenario: string;
  private latency: [number, number];
  private autoPairMs: number;
  private pairTtlMs: number;
  private now: () => number;
  private rand: () => number;
  private codes = new Map<string, { deviceId: string; startedAt: number; expiresAt: number }>();
  private seenTitles = new Map<string, { recId: string; at: number }>(); // title → most recent Seen
  private items: FeedItem[];
  private tokenCounter = 0;

  constructor(o: MockOptions = {}) {
    this.scenario = o.scenario ?? 'default';
    this.latency = o.latencyMs ?? [300, 1500];
    this.autoPairMs = o.autoPairMs ?? 6000;
    this.pairTtlMs = o.pairTtlMs ?? 10 * 60_000;
    this.now = o.now ?? Date.now;
    this.rand = o.random ?? Math.random;
    this.items = mockFeed(this.now(), this.scenario);
    if (this.scenario === 'history')
      this.items.slice(-2).forEach((i, n) => this.seenTitles.set(i.title, { recId: i.id, at: this.now() - (n + 1) * 86400000 }));
  }

  private async wait() {
    const [a, b] = this.latency;
    const ms = a + (b - a) * this.rand();
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    if (this.scenario === 'offline') throw new ApiFailure('retryable', 'Network error (mock offline)');
  }
  private checkToken(token: string) {
    if (!token.startsWith('wcd_')) throw new ApiFailure('unauthorized', 'HTTP 403 (mock)', 403);
    if (this.scenario === 'unpaired' && token === 'wcd_stale') throw new ApiFailure('unauthorized', 'HTTP 403 (mock)', 403);
  }

  async pairStart(deviceId: string): Promise<PairStart> {
    await this.wait();
    let code = '';
    for (let i = 0; i < 6; i++) code += PAIR_CODE_ALPHABET[Math.floor(this.rand() * PAIR_CODE_ALPHABET.length)];
    const startedAt = this.now();
    const expiresAt = startedAt + this.pairTtlMs;
    this.codes.set(code, { deviceId, startedAt, expiresAt });
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  async pairStatus(code: string, deviceId: string): Promise<PairStatus> {
    await this.wait();
    const c = this.codes.get(code);
    if (!c || c.deviceId !== deviceId) throw new ApiFailure('gone', 'HTTP 404 (mock)', 404);
    if (this.now() >= c.expiresAt) throw new ApiFailure('gone', 'HTTP 410 (mock)', 410);
    if (this.now() - c.startedAt < this.autoPairMs) return { status: 'pending' };
    this.codes.delete(code); // token delivered once
    return { status: 'paired', deviceToken: `wcd_mock${++this.tokenCounter}${'x'.repeat(24)}` };
  }

  async me(token: string): Promise<Me> {
    await this.wait();
    this.checkToken(token);
    return { kind: 'device', device: { id: 'mockDevice0000000000000' }, householdId: 'hh-kiran', householdName: "Kiran's household", timezone: 'America/New_York' };
  }

  async feed(token: string): Promise<FeedItem[]> {
    await this.wait();
    this.checkToken(token);
    if (this.scenario === 'server-error') throw new ApiFailure('retryable', 'HTTP 500 (mock)', 500);
    return this.items.filter((i) => !this.seenTitles.has(i.title));
  }

  async tonight(token: string): Promise<Tonight | null> {
    await this.wait();
    this.checkToken(token);
    const t = mockTonight(this.scenario);
    if (t && this.seenTitles.has(t.title)) {
      // Server behaviour after the pick is Seen: fallback over the remaining recs (api.md §7.4).
      const rest = this.items.filter((i) => !this.seenTitles.has(i.title));
      if (!rest.length) return null;
      return TonightResponse.parse({ recId: rest[0]!.id, title: rest[0]!.title, reason: `Recommended by ${rest[0]!.from.displayName} this week`, source: 'fallback' });
    }
    return t;
  }

  async markSeen(token: string, recId: string): Promise<void> {
    await this.wait();
    this.checkToken(token);
    const item = this.items.find((i) => i.id === recId);
    if (!item) throw new ApiFailure('gone', 'HTTP 404 (mock)', 404);
    this.seenTitles.set(item.title, { recId, at: this.now() }); // Seen is per title (api.md §7.3)
  }

  async unmarkSeen(token: string, recId: string): Promise<void> {
    await this.wait();
    this.checkToken(token);
    const item = this.items.find((i) => i.id === recId);
    if (!item) throw new ApiFailure('gone', 'HTTP 404 (mock)', 404);
    this.seenTitles.delete(item.title);
  }

  async seenHistory(token: string, limit = 50): Promise<SeenItem[]> {
    await this.wait();
    this.checkToken(token);
    if (this.scenario === 'history-error') throw new ApiFailure('retryable', 'HTTP 500 (mock)', 500);
    const live = [...this.seenTitles.entries()]
      .sort((a, b) => b[1].at - a[1].at)
      .map(([, v]) => ({ ...this.items.find((i) => i.id === v.recId)!, seenAt: new Date(v.at).toISOString() }));
    return SeenHistoryResponse.parse({ items: live.slice(0, limit) }).items;
  }

  /** Test/dev helper: simulate a friend sending a rec. */
  addRec(item: FeedItem) {
    this.items = [FeedResponse.parse({ items: [item] }).items[0]!, ...this.items];
  }
}
