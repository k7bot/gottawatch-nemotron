// One ApiClient interface, two implementations (ADR-0007 guardrail 1). Every response is
// validated against @gottawatch/contract (guardrail 2), so contract drift shows up as an error.
import {
  FeedResponse,
  MeResponse,
  PairStartResponse,
  PairStatusResponse,
  SeenHistoryResponse,
  SeenResponse,
  TonightResponse,
} from '@gottawatch/contract';
import type * as C from '@gottawatch/contract';

export type FeedItem = C.FeedItem;
export type SeenItem = C.SeenItem;
export type Tonight = C.TonightResponse;
export type Me = C.MeResponse;
export type PairStart = C.PairStartResponse;
export type PairStatus = C.PairStatusResponse;

/** Minimal schema shape we need (keeps this file free of a direct zod import). */
interface Schema<T> {
  safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

/**
 * How the UI should react (tv-app §3.7):
 * - unauthorized: 401/403 → clear token, re-pair
 * - gone: 404/410 (dead pairing code / unknown rec) → get a new code / drop the item
 * - retryable: network, timeout, 429, 5xx → keep data, banner, retry; never clear the token
 * - contract: response didn't match the contract (a bug; shown as an error)
 * - client: other 4xx (a bug)
 */
export type FailureKind = 'unauthorized' | 'gone' | 'retryable' | 'contract' | 'client';

export class ApiFailure extends Error {
  constructor(public kind: FailureKind, message: string, public status?: number) {
    super(message);
    this.name = 'ApiFailure';
  }
}

export function kindForStatus(status: number): FailureKind {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404 || status === 410) return 'gone';
  if (status === 429 || status >= 500) return 'retryable';
  return 'client';
}

export interface ApiClient {
  readonly mode: 'live' | 'mock';
  pairStart(deviceId: string): Promise<PairStart>;
  pairStatus(code: string, deviceId: string): Promise<PairStatus>;
  me(token: string): Promise<Me>;
  feed(token: string, limit?: number): Promise<FeedItem[]>;
  /** null = 204, no pick tonight. */
  tonight(token: string): Promise<Tonight | null>;
  markSeen(token: string, recId: string): Promise<void>;
  /** Undo / Put back (ux §5.5a): un-sees the whole title. */
  unmarkSeen(token: string, recId: string): Promise<void>;
  /** Watched history, newest first, one per title. */
  seenHistory(token: string, limit?: number): Promise<SeenItem[]>;
}

type FetchFn = typeof fetch;

export class LiveApiClient implements ApiClient {
  readonly mode = 'live' as const;
  // Default wraps the global: browsers throw "Illegal invocation" when fetch is called as a method
  // of another object (this.fetchFn(...)), which broke the web TV view (judges' /tv/).
  constructor(private baseUrl: string, private fetchFn: FetchFn = (input, init) => fetch(input, init), private timeoutMs = 10000) {}

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    schema: Schema<T> | null,
    opts: { token?: string; body?: unknown } = {},
  ): Promise<T | null> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.timeoutMs) : undefined;
    let res: Response;
    try {
      res = await this.fetchFn(this.baseUrl + path, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: ctrl?.signal,
      });
    } catch (e) {
      throw new ApiFailure('retryable', `Network error: ${(e as Error)?.message ?? 'unknown'}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
    // 204 has an empty body and no content-type: check the status before parsing (tv-app §3.3).
    if (res.status === 204) return null;
    if (!res.ok) {
      // Gateway errors (401/403/429) aren't ErrorBody; never assume error.code exists.
      throw new ApiFailure(kindForStatus(res.status), `HTTP ${res.status} on ${method} ${path.split('?')[0]}`, res.status);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiFailure('contract', `Body of ${method} ${path.split('?')[0]} is not JSON`, res.status);
    }
    if (!schema) return null;
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiFailure(
        'contract',
        `Contract mismatch on ${method} ${path.split('?')[0]}: ${issue?.path.join('.') || '(root)'} ${issue?.message ?? ''}`,
        res.status,
      );
    }
    return parsed.data;
  }

  private must<T>(v: T | null, what: string): T {
    if (v === null) throw new ApiFailure('contract', `${what} returned 204`);
    return v;
  }

  async pairStart(deviceId: string) {
    return this.must(await this.request('POST', '/pair/start', PairStartResponse, { body: { deviceId } }), 'pair/start');
  }
  async pairStatus(code: string, deviceId: string) {
    const q = `code=${encodeURIComponent(code)}&deviceId=${encodeURIComponent(deviceId)}`;
    return this.must(await this.request('GET', `/pair/status?${q}`, PairStatusResponse), 'pair/status');
  }
  async me(token: string) {
    return this.must(await this.request('GET', '/me', MeResponse, { token }), 'me');
  }
  async feed(token: string, limit = 50) {
    return this.must(await this.request('GET', `/feed?limit=${limit}`, FeedResponse, { token }), 'feed').items;
  }
  async tonight(token: string) {
    return this.request('GET', '/tonight', TonightResponse, { token });
  }
  async markSeen(token: string, recId: string) {
    await this.request('POST', `/recommendations/${encodeURIComponent(recId)}/seen`, SeenResponse, { token });
  }
  async unmarkSeen(token: string, recId: string) {
    await this.request('DELETE', `/recommendations/${encodeURIComponent(recId)}/seen`, SeenResponse, { token });
  }
  async seenHistory(token: string, limit = 50) {
    return this.must(await this.request('GET', `/seen?limit=${limit}`, SeenHistoryResponse, { token }), 'seen').items;
  }
}
