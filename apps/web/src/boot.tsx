import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { buildConfig } from './config';
import { LiveApiClient, MockApiClient, type ApiClient } from './api';

export function boot(captured: 'captured' | 'invalid-link' | 'none') {
  const root = createRoot(document.getElementById('root')!);
  let api: ApiClient;
  try {
    const cfg = buildConfig(import.meta.env as Record<string, string>, import.meta.env.DEV, typeof window !== 'undefined' ? window.location.origin : undefined);
    const q = new URLSearchParams(location.search);
    api = cfg.mode === 'mock' ? new MockApiClient(q.get('scenario') ?? 'default', Number(q.get('latency') ?? 300)) : new LiveApiClient(cfg.apiUrl);
    root.render(<App api={api} demoMode={cfg.demoMode} invalidLink={captured === 'invalid-link'} />);
  } catch (e) {
    root.render(<p style={{ padding: 20 }}>{e instanceof Error ? e.message : String(e)}</p>);
  }
}
