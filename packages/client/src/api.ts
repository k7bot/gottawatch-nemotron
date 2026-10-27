// Phone API client: profile-token routes, every response validated against @gottawatch/contract.
import {
  CreateRecommendationResponse,
  AddEmailVerifyResponse,
  AuthConfigResponse,
  EmailSignInResponse,
  FeedResponse,
  FriendsResponse,
  OkResponse,
  HomeResponse,
  MeResponse,
  SeenHistoryResponse,
  SeenResponse,
  SentResponse,
  type FeedItem,
  type HomeResponse as HomeT,
  type SeenItem,
  type SentItem,
  PairCompleteResponse,
  AcceptInviteResponse,
  CreateInviteResponse,
  InvitePreviewResponse,
  InvitesResponse,
  type InviteItem,
  type InvitePreviewResponse as InvitePreviewT,
  type AcceptInviteResponse as AcceptT,
  TitleSearchResponse,
  TitleDetailsResponse,
  AskResponse,
  type AskChip,
  type AskResponse as AskT,
  type CreateRecommendationRequest,
  type FriendsResponse as FriendsT,
  type MeResponse as MeT,
  type TitleRef,
} from '@gottawatch/contract';

export type Friend = FriendsT['friends'][number];
export type Me = MeT;
export type { TitleRef, FeedItem, SeenItem, SentItem };
export type Home = HomeT;
export type { InviteItem };
export type InvitePreview = InvitePreviewT;
export type AcceptResult = AcceptT;
export type AskResult = AskT;
export type { AskChip };

export type FailureKind = 'unauthorized' | 'not_found' | 'expired' | 'conflict' | 'offline' | 'rate_limited' | 'server' | 'contract' | 'client';
export class ApiFailure extends Error {
  constructor(public kind: FailureKind, message: string, public status?: number) {
    super(message);
    this.name = 'ApiFailure';
  }
}
/** Kind of a thrown error; duck-typed so it survives duplicate module instances. Non-API errors count as offline. */
export function failureKind(e: unknown): FailureKind {
  return e instanceof Error && e.name === 'ApiFailure' && 'kind' in e ? (e as ApiFailure).kind : 'offline';
}

export function kindForStatus(s: number): FailureKind {
  if (s === 401 || s === 403) return 'unauthorized';
  if (s === 404) return 'not_found';
  if (s === 410) return 'expired';
  if (s === 409) return 'conflict';
  if (s === 429) return 'rate_limited';
  if (s >= 500) return 'server';
  return 'client';
}

export interface ApiClient {
  readonly mode: 'live' | 'mock';
  me(token: string): Promise<Me>;
  friends(token: string): Promise<Friend[]>;
  search(token: string, q: string, signal?: AbortSignal): Promise<TitleRef[]>;
  /** TMDB title details incl. providers; undefined when unavailable (never throws). */
  titleDetails(token: string, t: TitleRef): Promise<TitleRef | undefined>;
  recommend(token: string, req: CreateRecommendationRequest): Promise<string[]>;
  pairComplete(token: string, code: string): Promise<void>;
  // ADR-0013 phone-only routes
  inbox(token: string): Promise<FeedItem[]>;
  watched(token: string): Promise<SeenItem[]>;
  setSeen(token: string, recId: string, seen: boolean): Promise<void>;
  sent(token: string): Promise<SentItem[]>;
  home(token: string): Promise<Home>;
  forgetTv(token: string, tvId: string): Promise<{ ok: true }>;
  // Email sign-in (ADR-0013 amendment)
  authConfig(): Promise<{ email: boolean }>;
  emailStart(email: string, opts?: { invite?: string; name?: string }): Promise<void>;
  emailVerify(email: string, code: string): Promise<string>;
  addEmail(token: string, email: string): Promise<void>;
  verifyAddEmail(token: string, email: string, code: string): Promise<string>;
  // Friend invites (ADR-0015)
  createInvite(token: string, email?: string): Promise<{ invite: InviteItem; code: string }>;
  invites(token: string): Promise<InviteItem[]>;
  cancelInvite(token: string, id: string): Promise<void>;
  previewInvite(code: string): Promise<InvitePreview>;
  acceptInvite(token: string, code: string): Promise<AcceptResult>;
  removeFriend(token: string, id: string): Promise<void>;
  // Ask Gottawatch (Nemotron on Nebius): picks from friends' recs for a mood/question
  ask(token: string, query: string, chips: AskChip[], signal?: AbortSignal): Promise<AskResult>;
}

interface Schema<T> {
  safeParse(v: unknown): { success: true; data: T } | { success: false };
}
type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export class LiveApiClient implements ApiClient {
  readonly mode = 'live' as const;
  constructor(private base: string, private fetchFn: FetchFn = (u, i) => fetch(u, i), private timeoutMs = 10000) {}

  private async call<T>(method: string, path: string, token: string, schema: Schema<T>, body?: unknown, signal?: AbortSignal, timeoutMs = this.timeoutMs): Promise<T> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    signal?.addEventListener('abort', () => ctl.abort());
    let res: Response;
    try {
      res = await this.fetchFn(this.base + path, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
        referrerPolicy: 'no-referrer',
      });
    } catch {
      if (signal?.aborted) throw new ApiFailure('client', 'aborted');
      throw new ApiFailure('offline', 'Network error');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new ApiFailure(kindForStatus(res.status), `HTTP ${res.status}`, res.status);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiFailure('contract', 'Response was not JSON', res.status);
    }
    const p = schema.safeParse(json);
    if (!p.success) throw new ApiFailure('contract', `Unexpected response from ${path}`, res.status);
    return p.data;
  }

  me(t: string) {
    return this.call('GET', '/me', t, MeResponse);
  }
  async friends(t: string) {
    return (await this.call('GET', '/friends', t, FriendsResponse)).friends;
  }
  async search(t: string, q: string, signal?: AbortSignal) {
    return (await this.call('GET', `/titles/search?q=${encodeURIComponent(q)}`, t, TitleSearchResponse, undefined, signal)).results;
  }
  async titleDetails(t: string, ref: TitleRef) {
    if (ref.source !== 'tmdb' || !ref.mediaType) return undefined;
    try {
      return (await this.call('GET', `/titles/${ref.mediaType}/${encodeURIComponent(ref.id)}`, t, TitleDetailsResponse)).title;
    } catch {
      return undefined;
    }
  }
  async recommend(t: string, req: CreateRecommendationRequest) {
    return (await this.call('POST', '/recommendations', t, CreateRecommendationResponse, req)).ids;
  }
  async pairComplete(t: string, code: string) {
    await this.call('POST', '/pair/complete', t, PairCompleteResponse, { code });
  }
  async inbox(t: string) {
    return (await this.call('GET', '/me/feed?limit=100', t, FeedResponse)).items;
  }
  async watched(t: string) {
    return (await this.call('GET', '/me/seen?limit=50', t, SeenHistoryResponse)).items;
  }
  async setSeen(t: string, recId: string, seen: boolean) {
    await this.call(seen ? 'POST' : 'DELETE', `/me/seen/${encodeURIComponent(recId)}`, t, SeenResponse);
  }
  async sent(t: string) {
    return (await this.call('GET', '/me/sent?limit=50', t, SentResponse)).items;
  }
  home(t: string) {
    return this.call('GET', '/me/home', t, HomeResponse);
  }
  forgetTv(t: string, tvId: string) {
    return this.call('DELETE', `/me/home/tvs/${encodeURIComponent(tvId)}`, t, OkResponse);
  }
  authConfig() {
    return this.call('GET', '/auth/config', '', AuthConfigResponse);
  }
  async emailStart(email: string, opts: { invite?: string; name?: string } = {}) {
    await this.call('POST', '/auth/email/start', '', OkResponse, { email, ...opts });
  }
  createInvite(t: string, email?: string) {
    return this.call('POST', '/invites', t, CreateInviteResponse, email ? { email } : {});
  }
  async invites(t: string) {
    return (await this.call('GET', '/invites', t, InvitesResponse)).invites;
  }
  async cancelInvite(t: string, id: string) {
    await this.call('DELETE', `/invites/${encodeURIComponent(id)}`, t, OkResponse);
  }
  previewInvite(code: string) {
    return this.call('POST', '/invites/preview', '', InvitePreviewResponse, { code });
  }
  acceptInvite(t: string, code: string) {
    return this.call('POST', '/invites/accept', t, AcceptInviteResponse, { code });
  }
  async removeFriend(t: string, id: string) {
    await this.call('DELETE', `/friends/${encodeURIComponent(id)}`, t, OkResponse);
  }
  /** The agent has a 12s server budget (tool calls + grounding), so allow 20s here. */
  ask(t: string, query: string, chips: AskChip[], signal?: AbortSignal) {
    return this.call('POST', '/ask', t, AskResponse, { query, chips }, signal, Math.max(this.timeoutMs, 20000));
  }
  async emailVerify(email: string, code: string) {
    return (await this.call('POST', '/auth/email/verify', '', EmailSignInResponse, { email, code })).profileToken;
  }
  async addEmail(t: string, email: string) {
    await this.call('POST', '/me/email', t, OkResponse, { email });
  }
  async verifyAddEmail(t: string, email: string, code: string) {
    return (await this.call('POST', '/me/email/verify', t, AddEmailVerifyResponse, { email, code })).email;
  }
}

// --- Mock (vite dev only, ADR-0007) -------------------------------------------------------
const MOCK_TITLES: TitleRef[] = [
  { source: 'demo', id: 'kestrel-bay', mediaType: 'tv', title: 'Kestrel Bay', runtime: 40 },
  { source: 'demo', id: 'the-quiet-orchard', mediaType: 'movie', title: 'The Quiet Orchard' },
  { source: 'demo', id: 'saltwater-static', mediaType: 'movie', title: 'Saltwater Static' },
];
export class MockApiClient implements ApiClient {
  readonly mode = 'mock' as const;
  constructor(private scenario = 'default', private latencyMs = 300) {}
  private async wait() {
    await new Promise((r) => setTimeout(r, this.latencyMs));
    if (this.scenario === 'offline') throw new ApiFailure('offline', 'Network error (mock)');
  }
  async me(t: string): Promise<Me> {
    await this.wait();
    if (this.scenario === 'invalid') throw new ApiFailure('unauthorized', 'HTTP 403 (mock)', 403);
    void t;
    return MeResponse.parse({ kind: 'profile', user: { id: 'u-priya', displayName: 'Priya' }, householdId: 'hh-priya' });
  }
  async friends(): Promise<Friend[]> {
    await this.wait();
    return FriendsResponse.parse({ friends: this.mockFriends }).friends;
  }
  async titleDetails(): Promise<TitleRef | undefined> {
    return undefined;
  }
  async search(_t: string, q: string): Promise<TitleRef[]> {
    await this.wait();
    if (this.scenario === 'search-error') throw new ApiFailure('server', 'HTTP 500 (mock)', 500);
    const n = q.trim().toLowerCase();
    return MOCK_TITLES.filter((x) => x.title.toLowerCase().includes(n));
  }
  async recommend(): Promise<string[]> {
    await this.wait();
    if (this.scenario === 'send-error') throw new ApiFailure('offline', 'Network error (mock)');
    return ['mock-rec'];
  }
  async pairComplete(_t: string, code: string): Promise<void> {
    await this.wait();
    if (code === 'EXPRED') throw new ApiFailure('expired', 'HTTP 410 (mock)', 410);
    if (code !== 'K7Q4ZP') throw new ApiFailure('not_found', 'HTTP 404 (mock)', 404);
  }
  private seen = new Set<string>();
  private mockFeed(): (FeedItem & { seenAt?: string })[] {
    const h = (n: number) => new Date(Date.now() - n * 3600e3).toISOString();
    return [
      { id: 'm1', from: { id: 'u-sam', displayName: 'Sam' }, title: 'Kestrel Bay', mediaType: 'tv', runtime: 40, service: 'app_a', createdAt: h(3), note: 'Start at ep 2' },
      { id: 'm2', from: { id: 'u-kiran', displayName: 'Kiran' }, title: 'Kestrel Bay', mediaType: 'tv', runtime: 40, service: 'app_a', createdAt: h(26) },
      { id: 'm3', from: { id: 'u-maya', displayName: 'Maya' }, title: 'The Quiet Orchard', mediaType: 'movie', service: 'app_b', createdAt: h(50) },
      { id: 'm4', from: { id: 'u-sam', displayName: 'Sam' }, title: 'Saltwater Static', mediaType: 'movie', service: null, createdAt: h(96) },
    ];
  }
  async inbox(): Promise<FeedItem[]> {
    await this.wait();
    if (this.scenario === 'empty') return [];
    const all = this.mockFeed();
    const seenTitles = new Set(all.filter((i) => this.seen.has(i.id)).map((i) => i.title));
    return all.filter((i) => !seenTitles.has(i.title));
  }
  async watched(): Promise<SeenItem[]> {
    await this.wait();
    const at = new Date().toISOString();
    const out: SeenItem[] = [];
    for (const i of this.mockFeed()) if (this.seen.has(i.id) && !out.some((o) => o.title === i.title)) out.push({ ...i, seenAt: at });
    return out;
  }
  async setSeen(_t: string, recId: string, seen: boolean) {
    await this.wait();
    const title = this.mockFeed().find((i) => i.id === recId)?.title;
    for (const i of this.mockFeed()) if (i.title === title) {
      if (seen) this.seen.add(i.id);
      else this.seen.delete(i.id);
    }
  }
  async sent(): Promise<SentItem[]> {
    await this.wait();
    if (this.scenario === 'empty') return [];
    return [{ id: 's1', title: 'Kestrel Bay', mediaType: 'tv', service: 'app_a', note: '40-min episodes, start at ep 2', to: ['Kiran'], createdAt: new Date(Date.now() - 3 * 3600e3).toISOString() }];
  }
  async authConfig() {
    await this.wait();
    return { email: this.scenario !== 'no-email' };
  }
  async emailStart() {
    await this.wait();
  }
  async emailVerify(_e: string, code: string) {
    await this.wait();
    if (code !== '123456') throw new ApiFailure('client', 'HTTP 400 (mock)', 400);
    return 'wcp_mock_email_signin';
  }
  async addEmail() {
    await this.wait();
  }
  async verifyAddEmail(_t: string, email: string, code: string) {
    await this.wait();
    if (code !== '123456') throw new ApiFailure('client', 'HTTP 400 (mock)', 400);
    return email.trim().toLowerCase();
  }
  private pending: InviteItem[] = [];
  private mockFriends = [{ id: 'u-kiran', displayName: 'Kiran', householdId: 'hh-kiran' }];
  async createInvite(_t: string, email?: string) {
    await this.wait();
    const now = Date.now();
    const to = email ? `${email.slice(0, 2)}•••@${email.split('@')[1] ?? ''}` : undefined;
    const invite: InviteItem = { id: `i${now}`, ...(to ? { to } : {}), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 7 * 86400e3).toISOString() };
    this.pending.unshift(invite);
    return { invite, code: 'MockInviteCode000000000' };
  }
  async invites() {
    await this.wait();
    return [...this.pending];
  }
  async cancelInvite(_t: string, id: string) {
    await this.wait();
    this.pending = this.pending.filter((i) => i.id !== id);
  }
  async previewInvite(code: string): Promise<InvitePreview> {
    await this.wait();
    return code.startsWith('Gone') ? { status: 'gone' } : { status: 'valid', inviter: { id: 'u-sam', displayName: 'Sam' } };
  }
  async acceptInvite(): Promise<AcceptResult> {
    await this.wait();
    this.mockFriends.push({ id: 'u-sam', displayName: 'Sam', householdId: 'hh-sam' });
    return { friend: { id: 'u-sam', displayName: 'Sam', householdId: 'hh-sam' }, already: false };
  }
  async removeFriend(_t: string, id: string) {
    await this.wait();
    this.mockFriends = this.mockFriends.filter((f) => f.id !== id);
  }
  async ask(_t: string, query: string, chips: AskChip[]): Promise<AskResult> {
    await new Promise((r) => setTimeout(r, this.latencyMs * 4)); // the agent is slower than a list call
    if (this.scenario === 'offline') throw new ApiFailure('offline', 'Network error (mock)');
    if (this.scenario === 'ask-limit') throw new ApiFailure('rate_limited', 'HTTP 429 (mock)', 429);
    if (this.scenario === 'ask-error') throw new ApiFailure('server', 'HTTP 500 (mock)', 500);
    const trace = (label: string, detail: string) => [
      { kind: 'model', label: 'nemotron-3-super-120b-a12b', detail: '1 tool call(s)', ms: 900 },
      { kind: 'tool', label: 'get_friend_picks', detail: '{}', ms: 2 },
      { kind: 'model', label: 'nemotron-3-super-120b-a12b', detail: 'answer', ms: 800 },
      { kind: 'check', label: 'grounding', detail: `status ${label.replace(' ', '_')}` },
      { kind: 'check', label, detail },
    ];
    const base = { source: 'nemotron-agent', model: 'nvidia/nemotron-3-super-120b-a12b' };
    if (/capital|weather|asdf|\?\?\?/i.test(query)) {
      return AskResponse.parse({ ...base, status: 'off_topic', answer: "I can only help pick something to watch from your friends' recommendations. Try one of the questions below, or tap a mood.", picks: [], trace: trace('off topic', 'not a what-to-watch question; no picks') });
    }
    if (/horror|korean|western|tom hanks/i.test(query)) {
      return AskResponse.parse({
        ...base, status: 'no_match', answer: "None of your friends' picks are a horror movie yet.", picks: [],
        closest: { recId: 'm3', title: 'The Quiet Orchard', reason: 'The one movie your friends sent. It is a slow, sad one, not scary.', quotes: [], from: ['Maya'] },
        trace: trace('no match', 'closest: The Quiet Orchard'),
      });
    }
    const short = chips.includes('short') || /short|quick|tired/i.test(query);
    const picks = short
      ? [{ recId: 'm1', title: 'Kestrel Bay', reason: '40-minute episodes, and Sam says to start at episode 2.', quotes: ['Start at ep 2'], from: ['Sam'], runtime: 40 }]
      : [
          { recId: 'm1', title: 'Kestrel Bay', reason: 'Two friends picked it this week, and Sam left you a tip.', quotes: ['Start at ep 2'], from: ['Sam', 'Kiran'], runtime: 40 },
          { recId: 'm3', title: 'The Quiet Orchard', reason: 'Maya sent it and it is a full movie for a slower night.', quotes: [], from: ['Maya'] },
        ];
    return AskResponse.parse({
      answer: short ? 'Short and easy tonight: start Kestrel Bay.' : 'Kestrel Bay is the one your friends agree on. The Quiet Orchard if you want a movie.',
      picks,
      source: 'nemotron-agent',
      model: 'nvidia/nemotron-3-super-120b-a12b',
      trace: [
        { kind: 'model', label: 'nemotron-3-super-120b-a12b', detail: '2 tool call(s)', ms: 1400 },
        { kind: 'tool', label: 'get_friend_picks', detail: '{}', ms: 3 },
        { kind: 'tool', label: 'get_watch_history', detail: '{}', ms: 2 },
        { kind: 'model', label: 'nemotron-3-super-120b-a12b', detail: 'answer', ms: 1900 },
        { kind: 'check', label: 'grounding', detail: `${picks.length} pick(s) grounded` },
      ],
    });
  }
  async home(): Promise<Home> {
    await this.wait();
    return { home: { id: 'hh-priya', name: "Priya's home" }, members: [{ id: 'u-priya', displayName: 'Priya' }], tvs: this.scenario === 'empty' ? [] : [{ id: 'dev-tv1', label: 'TV', pairedAt: new Date(Date.now() - 86400e3).toISOString() }] };
  }
  async forgetTv(_t: string, tvId: string) {
    await this.wait();
    if (this.scenario === 'offline') throw new ApiFailure('offline', 'Network error (mock)');
    if (!tvId) throw new ApiFailure('client', 'Missing TV');
    return { ok: true as const };
  }
}
