// No default backend: the API URL must be supplied at build time (VITE_API_URL). A build without it
// fails (vite.config.ts) and so does boot, so a copy can never silently talk to some other deployment.
// VITE_API_URL=same-origin means "the origin this page was served from" (API + web in one container).
export function resolveApiUrl(raw: string | boolean | undefined, origin?: string): string {
  const v = String(raw ?? '').trim();
  if (!v) throw new Error('VITE_API_URL is required (set it at build time; no default backend).');
  if (v === 'same-origin') {
    if (!origin) throw new Error('VITE_API_URL=same-origin needs a browser origin.');
    return origin.replace(/\/+$/, '');
  }
  if (!/^https?:\/\//.test(v)) throw new Error(`VITE_API_URL must be an http(s) URL or same-origin, got "${v}"`);
  return v.replace(/\/+$/, '');
}

export interface WebConfig {
  apiUrl: string;
  mode: 'live' | 'mock';
  demoMode: boolean;
}

export function buildConfig(env: Record<string, string | boolean | undefined>, isDev: boolean, origin?: string): WebConfig {
  const mode = String(env.VITE_API_MODE ?? 'live');
  if (mode !== 'live' && mode !== 'mock') throw new Error(`VITE_API_MODE must be live or mock, got "${mode}"`);
  // ADR-0007 guardrail: mock data can never ship in a production build.
  if (mode === 'mock' && !isDev) throw new Error('Mock API mode is not allowed in production builds (ADR-0007).');
  return {
    apiUrl: mode === 'mock' ? String(env.VITE_API_URL ?? '') : resolveApiUrl(env.VITE_API_URL, origin),
    mode,
    demoMode: env.VITE_DEMO_MODE !== '0',
  };
}
