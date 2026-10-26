// Profile token capture (web-app.md §3, review nice-to-have #3). Runs before the first render and
// before any network call: /u/<token> → localStorage, then replaceState so the token leaves the
// visible URL, the history entry and any later Referer. The token is never logged.
export const TOKEN_KEY = 'wc.profileToken';
const TOKEN_RE = /^wcp_[A-Za-z0-9_-]{16,200}$/;

export interface Loc {
  pathname: string;
  search: string;
  hash: string;
}
export interface Deps {
  location: Loc;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  replaceState: (url: string) => void;
}

/** Returns 'captured' | 'invalid-link' | 'none'. Always strips a /u/... path from the URL. */
export function captureToken({ location, storage, replaceState }: Deps): 'captured' | 'invalid-link' | 'none' {
  const m = /^\/u\/([^/?#]*)\/?$/.exec(location.pathname);
  if (!m) return 'none';
  let raw = '';
  try {
    raw = decodeURIComponent(m[1] ?? '');
  } catch {
    raw = '';
  }
  replaceState('/' + location.search + location.hash);
  if (!TOKEN_RE.test(raw)) return 'invalid-link';
  storage.setItem(TOKEN_KEY, raw);
  return 'captured';
}

export const readToken = (s: Pick<Storage, 'getItem'>) => {
  const t = s.getItem(TOKEN_KEY);
  return t && TOKEN_RE.test(t) ? t : null;
};
export const clearToken = (s: Pick<Storage, 'removeItem'>) => s.removeItem(TOKEN_KEY);
