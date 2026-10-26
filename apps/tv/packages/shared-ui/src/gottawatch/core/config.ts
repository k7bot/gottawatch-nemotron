// Client configuration (tv-app.md §5, ADR-0007 guardrails). Values come from EXPO_PUBLIC_*
// variables inlined at build time. Pure TS (no React Native imports) so it can be unit-tested.

// No default backend or PWA: EXPO_PUBLIC_API_URL must be set at build time for live mode (the web
// export script refuses to run without it) and buildConfig throws without it.
// EXPO_PUBLIC_API_URL=same-origin uses the origin the browser TV page was served from.
function resolveUrl(name: string, raw: string | undefined, origin?: string): string {
  const v = (raw ?? '').trim();
  if (!v) throw new Error(`${name} is required for live mode (no default backend).`);
  if (v === 'same-origin') {
    if (!origin) throw new Error(`${name}=same-origin only works in a browser.`);
    return origin.replace(/\/+$/, '');
  }
  if (!/^https?:\/\//.test(v)) throw new Error(`${name} must be an http(s) URL or same-origin, got "${v}"`);
  return v.replace(/\/+$/, '');
}

export type ApiMode = 'live' | 'mock';

export interface WcConfig {
  apiBaseUrl: string;
  /** Phone PWA origin for the pairing QR/short URL. EXPO_PUBLIC_PWA_URL='none' hides the QR. */
  pwaBaseUrl?: string;
  apiMode: ApiMode;
  mockScenario: string;
  feedPollMs: number;
  pairPollMs: number;
  handoffTipMs: number;
  /** Hides service names everywhere (plan §7). */
  demoMode: boolean;
  /** Shows the dev-only Tonight's pick source tag (tv-app §3.3). */
  showDevTags: boolean;
  isDevBuild: boolean;
}

type Env = Record<string, string | undefined>;

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function buildConfig(env: Env, isDevBuild: boolean, origin?: string): WcConfig {
  const mode = (env.EXPO_PUBLIC_API_MODE ?? 'live').trim();
  if (mode !== 'live' && mode !== 'mock') throw new Error(`EXPO_PUBLIC_API_MODE must be live or mock, got "${mode}"`);
  // Guardrail 4 (ADR-0007): mock mode can never run in a release (non-dev) bundle.
  if (mode === 'mock' && !isDevBuild) {
    throw new Error('Mock API mode is not allowed in release builds (ADR-0007). Rebuild with EXPO_PUBLIC_API_MODE=live.');
  }
  return {
    apiBaseUrl: mode === 'mock' ? (env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '') : resolveUrl('EXPO_PUBLIC_API_URL', env.EXPO_PUBLIC_API_URL, origin),
    pwaBaseUrl: !env.EXPO_PUBLIC_PWA_URL || env.EXPO_PUBLIC_PWA_URL === 'none' ? undefined : resolveUrl('EXPO_PUBLIC_PWA_URL', env.EXPO_PUBLIC_PWA_URL, origin),
    apiMode: mode,
    mockScenario: env.EXPO_PUBLIC_MOCK_SCENARIO || 'default',
    feedPollMs: num(env.EXPO_PUBLIC_FEED_POLL_MS, 20000),
    pairPollMs: num(env.EXPO_PUBLIC_PAIR_POLL_MS, 3000),
    handoffTipMs: num(env.EXPO_PUBLIC_HANDOFF_TIP_MS, 4000),
    demoMode: env.EXPO_PUBLIC_DEMO_MODE !== '0',
    showDevTags: isDevBuild || env.EXPO_PUBLIC_DEV_TAGS === '1',
    isDevBuild,
  };
}
