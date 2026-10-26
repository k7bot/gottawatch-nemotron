// Runtime wiring: config from EXPO_PUBLIC_* (inlined by Metro) + the chosen API client.
import { buildConfig, type WcConfig } from './config';
import { LiveApiClient, type ApiClient } from './api';
import { MockApiClient } from './mock';

declare const __DEV__: boolean;
declare const process: { env: Record<string, string | undefined> };

// Each variable is read by its full name so Metro's EXPO_PUBLIC_ inlining picks it up.
const env = {
  EXPO_PUBLIC_API_MODE: process.env.EXPO_PUBLIC_API_MODE,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_PWA_URL: process.env.EXPO_PUBLIC_PWA_URL,
  EXPO_PUBLIC_MOCK_SCENARIO: process.env.EXPO_PUBLIC_MOCK_SCENARIO,
  EXPO_PUBLIC_MOCK_LATENCY_MS: process.env.EXPO_PUBLIC_MOCK_LATENCY_MS,
  EXPO_PUBLIC_FEED_POLL_MS: process.env.EXPO_PUBLIC_FEED_POLL_MS,
  EXPO_PUBLIC_PAIR_POLL_MS: process.env.EXPO_PUBLIC_PAIR_POLL_MS,
  EXPO_PUBLIC_HANDOFF_TIP_MS: process.env.EXPO_PUBLIC_HANDOFF_TIP_MS,
  EXPO_PUBLIC_DEMO_MODE: process.env.EXPO_PUBLIC_DEMO_MODE,
  EXPO_PUBLIC_DEV_TAGS: process.env.EXPO_PUBLIC_DEV_TAGS,
};

export function createEnv(): { config: WcConfig; api: ApiClient } {
  // Dev build = Metro dev bundle only (embedded-bundle APKs, even debug ones, run with __DEV__ false → live only).
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
  const config = buildConfig(env, isDev, origin);
  if (config.apiMode === 'mock') {
    // Web preview only (dev bundles): ?scenario=<name> overrides the mock scenario for screenshots.
    const loc = (globalThis as { location?: { search?: string } }).location;
    const q = loc?.search ? new URLSearchParams(loc.search).get('scenario') : null;
    if (q) config.mockScenario = q;
    const ql = loc?.search ? new URLSearchParams(loc.search).get('latency') : null;
    const lat = Number(ql ?? env.EXPO_PUBLIC_MOCK_LATENCY_MS);
    return {
      config,
      api: new MockApiClient({ scenario: config.mockScenario, ...(Number.isFinite(lat) && (ql ?? env.EXPO_PUBLIC_MOCK_LATENCY_MS) ? { latencyMs: [lat, lat] } : {}) }),
    };
  }
  return { config, api: new LiveApiClient(config.apiBaseUrl) };
}
