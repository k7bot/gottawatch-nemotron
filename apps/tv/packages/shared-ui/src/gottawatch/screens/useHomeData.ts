// Home data: feed polled every FEED_POLL_MS while foregrounded; /tonight on enter, on foreground
// and after Seen (tv-app §3.2/§3.3). Keeps the last good data when offline (banner, not a wipe).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiFailure, type ApiClient, type FeedItem, type Tonight } from '../core/api';
import { saveSessionEnd } from '../core/storage';

export interface HomeData {
  status: 'loading' | 'ready' | 'error';
  items: FeedItem[];
  tonight: Tonight | null;
  offline: boolean;
  errorDetail?: string;
  lastFeedAt?: number;
}

export function useHomeData(api: ApiClient, token: string, pollMs: number, onUnauthorized: () => void) {
  const [d, setD] = useState<HomeData>({ status: 'loading', items: [], tonight: null, offline: false });
  const seenTitles = useRef(new Set<string>()); // optimistic hides until the server agrees
  const unauth = useRef(onUnauthorized);
  unauth.current = onUnauthorized;

  const handle = useCallback((e: unknown) => {
    if (e instanceof ApiFailure && e.kind === 'unauthorized') {
      unauth.current();
      return;
    }
    const detail = e instanceof ApiFailure ? `${e.kind}: ${e.message}` : String(e);
    setD((p) => (p.status === 'ready' ? { ...p, offline: true, errorDetail: detail } : { ...p, status: 'error', errorDetail: detail }));
  }, []);

  const loadFeed = useCallback(async () => {
    try {
      const items = await api.feed(token);
      for (const t of [...seenTitles.current]) if (!items.some((i) => i.title === t)) seenTitles.current.delete(t);
      setD((p) => ({ ...p, status: 'ready', items, offline: false, errorDetail: undefined, lastFeedAt: Date.now() }));
      void saveSessionEnd(Date.now()); // session-end marker for "n new" (also written on background)
    } catch (e) {
      handle(e);
    }
  }, [api, token, handle]);

  const loadTonight = useCallback(async () => {
    try {
      const tonight = await api.tonight(token);
      setD((p) => ({ ...p, tonight }));
    } catch (e) {
      if (e instanceof ApiFailure && e.kind === 'unauthorized') return unauth.current();
      setD((p) => ({ ...p, tonight: null })); // error → Spotlight shows the newest rec (ux §5.1)
    }
  }, [api, token]);

  const refreshAll = useCallback(async () => {
    setD((p) => (p.status === 'error' ? { ...p, status: 'loading' } : p));
    await Promise.all([loadTonight(), loadFeed()]);
  }, [loadFeed, loadTonight]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    let fg = AppState.currentState === 'active' || AppState.currentState == null;
    let t: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (!t) t = setInterval(() => void loadFeed(), pollMs);
    };
    const stop = () => {
      if (t) clearInterval(t);
      t = undefined;
    };
    if (fg) start();
    const sub = AppState.addEventListener('change', (st) => {
      const now = st === 'active';
      if (now && !fg) {
        void refreshAll();
        start();
      } else if (!now && fg) {
        stop();
        void saveSessionEnd(Date.now());
      }
      fg = now;
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [loadFeed, refreshAll, pollMs]);

  const markSeen = useCallback(
    async (recId: string, title: string) => {
      seenTitles.current.add(title);
      setD((p) => ({ ...p, items: p.items.filter((i) => i.title !== title), tonight: p.tonight?.title === title ? null : p.tonight }));
      try {
        await api.markSeen(token, recId);
      } catch (e) {
        if (!(e instanceof ApiFailure && e.kind === 'gone')) {
          seenTitles.current.delete(title); // roll back: the server didn't record it
          handle(e);
        }
      }
      await Promise.all([loadTonight(), loadFeed()]);
    },
    [api, token, loadFeed, loadTonight, handle],
  );

  /** Undo / Put back (ux §5.5a). Returns false if the server didn't take it. */
  const unmarkSeen = useCallback(
    async (recId: string, title: string) => {
      seenTitles.current.delete(title);
      try {
        await api.unmarkSeen(token, recId);
      } catch (e) {
        if (e instanceof ApiFailure && e.kind === 'unauthorized') unauth.current();
        return false;
      } finally {
        await Promise.all([loadTonight(), loadFeed()]);
      }
      return true;
    },
    [api, token, loadFeed, loadTonight],
  );

  const visible = d.items.filter((i) => !seenTitles.current.has(i.title));
  const tonight = d.tonight && !seenTitles.current.has(d.tonight.title) ? d.tonight : null;
  return { ...d, items: visible, tonight, refreshAll, markSeen, unmarkSeen };
}
