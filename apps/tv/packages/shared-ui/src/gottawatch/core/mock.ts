// In-app fake API (ADR-0007): same ApiClient interface, fixtures validated against the contract,
// realistic latency + real-timestamp pairing expiry, scenario-based error injection.
// Fixtures use only the made-up demo catalog and personas (plan §7). DEV BUILDS ONLY (config.ts).
import { AskResponse, FeedResponse, PAIR_CODE_ALPHABET, SeenHistoryResponse, TonightResponse } from '@gottawatch/contract';
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
  | 'history-error' // GET /seen fails
  | 'ask-limit' // POST /ask 429
  | 'ask-error' // POST /ask 500
  | 'ask-nomatch' // POST /ask: nothing in the circle fits (with a closest pick)
  | 'ask-offtopic'; // POST /ask: off topic (phone free text; previews the TV state)

export const MOCK_SCENARIOS: MockScenario[] = ['default', 'stub', 'fallback', 'nopick', 'empty', 'offline', 'unpaired', 'server-error', 'handoff', 'history', 'history-error', 'ask-limit', 'ask-error', 'ask-nomatch', 'ask-offtopic'];

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

  async ask(token: string, chips: string[]): Promise<AskResponse> {
    await this.wait();
    await new Promise((r) => setTimeout(r, this.latency[0] * 2)); // the agent is slower than a list call
    this.checkToken(token);
    if (this.scenario === 'ask-limit') throw new ApiFailure('retryable', 'HTTP 429 (mock)', 429);
    if (this.scenario === 'ask-error') throw new ApiFailure('retryable', 'HTTP 500 (mock)', 500);
    const left = this.items.filter((i) => !this.seenTitles.has(i.title));
    const has = (t: string) => left.find((i) => i.title === t);
    const kb = has('Kestrel Bay'), qo = has('The Quiet Orchard');
    const picks = chips.includes('movie')
      ? qo ? [{ recId: qo.id, title: qo.title, reason: 'Maya sent it, and it is the one movie in your list.', quotes: [], from: ['Maya'] }] : []
      : [
          ...(kb ? [{ recId: kb.id, title: kb.title, reason: 'Priya and Sam both sent it, and the episodes are only 40 minutes.', quotes: ['start at ep 2'], from: ['Priya', 'Sam'], runtime: 40 }] : []),
          ...(qo ? [{ recId: qo.id, title: qo.title, reason: 'If you want one long story instead, Maya says this is it.', quotes: [], from: ['Maya'] }] : []),
        ];
    const trace = [
      { kind: 'model', label: 'nemotron-3-super-120b-a12b', detail: '2 tool call(s)', ms: 1300 },
      { kind: 'tool', label: 'get_friend_picks', detail: '{}', ms: 2 },
      { kind: 'tool', label: 'get_watch_history', detail: '{}', ms: 1 },
      { kind: 'model', label: 'nemotron-3-super-120b-a12b', detail: 'answer', ms: 1700 },
    ];
    if (this.scenario === 'ask-offtopic') {
      return AskResponse.parse({
        status: 'off_topic',
        answer: "I can only help pick something to watch from your friends' recommendations. Try one of the questions below, or tap a mood.",
        picks: [], source: 'nemotron-agent', model: 'nvidia/nemotron-3-super-120b-a12b',
        trace: [...trace.slice(0, 1), { kind: 'check', label: 'off topic', detail: 'not a what-to-watch question; no picks' }],
      });
    }
    if (this.scenario === 'ask-nomatch' || !picks.length) {
      const near = this.scenario === 'ask-nomatch' ? qo ?? kb : kb;
      return AskResponse.parse({
        status: 'no_match',
        answer: chips.includes('movie') ? "None of your circle's picks are a movie you haven't seen yet." : "Nothing your circle sent fits that yet.",
        picks: [],
        ...(near ? { closest: { recId: near.id, title: near.title, reason: near === kb ? 'A show, not a movie, but the episodes are only 40 minutes.' : 'The nearest thing in your list, though not quite what you asked for.', quotes: [], from: near === kb ? ['Priya', 'Sam'] : ['Maya'] } } : {}),
        source: 'nemotron-agent', model: 'nvidia/nemotron-3-super-120b-a12b',
        trace: [...trace, { kind: 'check', label: 'no match', detail: near ? `closest: ${near.title}` : 'nothing close' }],
      });
    }
    return AskResponse.parse({
      status: 'ok',
      answer: `${picks[0]!.title} is your best bet tonight.`,
      picks,
      source: 'nemotron-agent',
      model: 'nvidia/nemotron-3-super-120b-a12b',
      trace: [...trace, { kind: 'check', label: 'grounding', detail: `${picks.length} pick(s) grounded` }],
    });
  }

  /** Test/dev helper: simulate a friend sending a rec. */
  addRec(item: FeedItem) {
    this.items = [FeedResponse.parse({ items: [item] }).items[0]!, ...this.items];
  }
}
