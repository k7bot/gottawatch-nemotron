// Phone PWA (web-app.md, ux-design §6). Views: Home/search (+ Compose sheet, Sent), Connect a TV (/pair).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiFailure, type ApiClient, type Me, type TitleRef } from './api';
import { clearToken, readToken } from './token';
import {
  addRecent,
  customTitleRef,
  parseYear,
  titleCaption,
  titleSelector,
  defaultRecipients,
  friendHue,
  householdsFromFriends,
  initials,
  isFullCode,
  normalizeCode,
  posterUrl,
  posterAt,
  sendLabel,
  sentTo,
  serviceOptions,
  orderServiceOptions,
  preselectService,
  providerHint,
  JUSTWATCH_NOTICE,
  timeAgo,
  type HouseholdChoice,
  type RecentSend,
} from './logic';
import { CONNECT_TV_LABEL, NOTE_MAX } from '@gottawatch/contract';
import { BrandLockup } from './brand';
import { EmailSignIn, useEmailEnabled } from './email';
import { TOKEN_KEY } from './token';
import { signedOutCopy, withSavedEmail } from './logic';
import { ForYou, Friends, MeTab, SentSection, TabBar, type Tab } from './tabs';
import { INVITE_PATH_RE, InvitePage } from './invite';
import type { FeedItem } from './api';

type Session =
  | { k: 'loading' }
  | { k: 'nolink' }
  | { k: 'invalid' }
  | { k: 'offline' }
  | { k: 'ready'; token: string; me: Extract<Me, { kind: 'profile' }>; households: HouseholdChoice[] };

const RECENT_KEY = 'wc.recentSends';
const LAST_KEY = 'wc.lastRecipients';
const readJson = <T,>(k: string, d: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) ?? 'null') as T) ?? d;
  } catch {
    return d;
  }
};

function usePath() {
  const [path, setPath] = useState(() => location.pathname + location.search);
  useEffect(() => {
    const on = () => setPath(location.pathname + location.search);
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  const go = useCallback((p: string) => {
    history.pushState(null, '', p);
    setPath(p);
    scrollTo(0, 0);
  }, []);
  return { path, go };
}

export function App({ api, demoMode, invalidLink }: { api: ApiClient; demoMode: boolean; invalidLink: boolean }) {
  const [session, setSession] = useState<Session>({ k: 'loading' });
  const { path, go } = usePath();

  const load = useCallback(async () => {
    if (invalidLink) return setSession({ k: 'invalid' });
    const token = readToken(localStorage);
    if (!token) return setSession({ k: 'nolink' });
    setSession({ k: 'loading' });
    try {
      const me = await api.me(token);
      if (me.kind !== 'profile') throw new ApiFailure('unauthorized', 'not a profile token');
      const households = householdsFromFriends(await api.friends(token));
      setSession({ k: 'ready', token, me, households });
    } catch (e) {
      if (e instanceof ApiFailure && e.kind === 'unauthorized') {
        clearToken(localStorage);
        setSession({ k: 'invalid' });
      } else setSession({ k: 'offline' });
    }
  }, [api, invalidLink]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const on = () => session.k === 'offline' && void load();
    addEventListener('online', on);
    return () => removeEventListener('online', on);
  }, [session.k, load]);

  const url = new URL(path, 'https://x');
  const onPair = url.pathname === '/pair';
  const inviteCode = INVITE_PATH_RE.exec(url.pathname)?.[1] ?? null;
  const emailOn = useEmailEnabled(api);
  const refreshFriends = useCallback(async () => {
    if (session.k !== 'ready') return;
    const households = householdsFromFriends(await api.friends(session.token));
    setSession((cur) => (cur.k === 'ready' ? { ...cur, households } : cur));
  }, [api, session]);
  const goTab = (t: Tab) => {
    sessionStorage.setItem('wc.tab', t);
    go('/');
  };

  return (
    <div className="page">
      <header className="topbar">
        {/* Signed-out welcome shows the big lockup itself; avoid two marks on one screen. */}
        {session.k === 'nolink' && !inviteCode && !onPair ? <span /> : <BrandLockup />}
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {api.mode === 'mock' && <span className="pill demo">DEMO DATA</span>}
          {session.k === 'ready' && onPair && (
            <button className="linkbtn" onClick={() => go('/')}>
              Done
            </button>
          )}
        </span>
      </header>
      {inviteCode && session.k !== 'loading' && session.k !== 'offline' ? (
        <InvitePage
          key={session.k}
          api={api}
          code={inviteCode}
          token={session.k === 'ready' ? session.token : null}
          meId={session.k === 'ready' ? session.me.user.id : null}
          emailOn={emailOn}
          onSignedIn={(t) => {
            localStorage.setItem(TOKEN_KEY, t);
            void load();
          }}
          onConnected={refreshFriends}
          go={goTab}
        />
      ) : onPair ? (
        <PairView api={api} session={session} initialCode={url.searchParams.get('code')} go={go} />
      ) : session.k === 'ready' ? (
        <Tabs api={api} s={session} demoMode={demoMode} onPair={() => go('/pair')} onFriendsChanged={refreshFriends} onEmailSaved={(email) => setSession((cur) => withSavedEmail(cur, email))} />
      ) : (
        <SessionNotice s={session} retry={load} api={api} />
      )}
    </div>
  );
}

function Tabs({ api, s, demoMode, onPair, onEmailSaved, onFriendsChanged }: { api: ApiClient; s: Extract<Session, { k: 'ready' }>; demoMode: boolean; onPair: () => void; onEmailSaved: (email: string) => void; onFriendsChanged: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab | null>(() => (sessionStorage.getItem('wc.tab') as Tab | null) ?? null);
  const [inbox, setInbox] = useState<{ k: 'loading' } | { k: 'error'; offline: boolean } | { k: 'ok'; v: FeedItem[] }>({ k: 'loading' });
  const reloadInbox = useCallback(async () => {
    try {
      setInbox({ k: 'ok', v: await api.inbox(s.token) });
    } catch (e) {
      setInbox({ k: 'error', offline: e instanceof ApiFailure ? e.kind === 'offline' : true });
    }
  }, [api, s.token]);
  useEffect(() => {
    void reloadInbox();
    const on = () => document.visibilityState === 'visible' && void reloadInbox();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [reloadInbox]);
  // Default tab (ADR-0013): For you when something is waiting, else Recommend.
  const current: Tab = tab ?? (inbox.k === 'ok' && inbox.v.length === 0 ? 'recommend' : 'foryou');
  const set = (t: Tab) => {
    setTab(t);
    sessionStorage.setItem('wc.tab', t);
    scrollTo(0, 0);
    if (t === 'foryou') void reloadInbox();
  };
  const titles = inbox.k === 'ok' ? new Set(inbox.v.map((i) => i.title)).size : 0;
  return (
    <>
      {current === 'foryou' && <ForYou api={api} token={s.token} inbox={inbox} reloadInbox={reloadInbox} go={set} />}
      {current === 'recommend' && <HomeView api={api} s={s} demoMode={demoMode} />}
      {current === 'friends' && <Friends api={api} token={s.token} friends={s.households} me={s.me} go={set} onFriendsChanged={onFriendsChanged} />}
      {current === 'me' && (
        <MeTab
          api={api}
          token={s.token}
          me={s.me}
          onPair={onPair}
          onEmailSaved={onEmailSaved}
          onSignOut={() => {
            clearToken(localStorage);
            localStorage.removeItem(RECENT_KEY);
            location.replace('/');
          }}
        />
      )}
      <TabBar tab={current} set={set} badge={titles} />
    </>
  );
}

function SessionNotice({ s, retry, api }: { s: Session; retry: () => void; api: ApiClient }) {
  const emailOn = useEmailEnabled(api);
  if (s.k === 'loading')
    return (
      <div aria-busy>
        <div className="skel" style={{ height: 38, width: '50%', marginTop: 24 }} />
        <div className="skel" style={{ height: 56 }} />
      </div>
    );
  if (s.k === 'offline')
    return (
      <div className="notice err" role="alert">
        <h2>You're offline.</h2>
        <p className="sub" style={{ margin: 0 }}>We'll be ready when you're back.</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={retry}>
          Try again
        </button>
      </div>
    );
  const c = signedOutCopy({ emailOn, invalid: s.k === 'invalid' });
  return (
    <>
      {c.title === 'Gottawatch' ? (
        <h1 style={{ margin: '24px 0 8px' }}>
          <BrandLockup size={32} />
        </h1>
      ) : (
        <h1 className="display" style={{ marginTop: 24, marginBottom: 4 }}>{c.title}</h1>
      )}
      <p className="sub" style={{ marginTop: 0 }}>{c.value}</p>
      {c.notice && (
        <div className="notice err" role="alert">
          <p style={{ margin: 0 }}>{c.notice}</p>
        </div>
      )}
      {emailOn && (
        <EmailSignIn
          api={api}
          onToken={(t) => {
            localStorage.setItem(TOKEN_KEY, t);
            retry();
          }}
        />
      )}
      <p className="caption" style={{ marginTop: 16 }}>{c.linkLine}</p>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
function HomeView({ api, s, demoMode }: { api: ApiClient; s: Extract<Session, { k: 'ready' }>; demoMode: boolean }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<{ k: 'idle' } | { k: 'searching' } | { k: 'results'; items: TitleRef[]; q: string } | { k: 'error' } | { k: 'offline' }>({ k: 'idle' });
  const [picked, setPicked] = useState<TitleRef | null>(null);
  const [sent, setSent] = useState<{ title: TitleRef; to: string; note?: string } | null>(null);
  const [recent, setRecent] = useState<RecentSend[]>(() => readJson(RECENT_KEY, []));
  const [nonce, setNonce] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setState({ k: 'idle' });
    setState({ k: 'searching' });
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const items = await api.search(s.token, term, ctl.signal);
        setState({ k: 'results', items, q: term });
      } catch (e) {
        if (ctl.signal.aborted) return;
        if (e instanceof ApiFailure && e.kind === 'offline') setState({ k: 'offline' });
        else setState({ k: 'error' });
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, api, s.token, nonce]);

  if (sent)
    return (
      <SentView
        sent={sent}
        me={s.me}
        onDone={() => {
          setSent(null);
          setQ('');
          setSearching(false);
        }}
        onAnother={() => {
          setSent(null);
          setQ('');
          setSearching(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      />
    );

  const one = s.households.length === 1 ? s.households[0] : undefined;
  if (!searching)
    return (
      <main>
        <h1 className="display">Recommend</h1>
        <p className="sub">Send a show or movie to a friend's TV.</p>
        <button className="search searchcta" onClick={() => setSearching(true)} aria-label="Search a show or movie to recommend">
          Search a show or movie
        </button>
        <SentSection api={api} token={s.token} onSearch={() => setSearching(true)} />
      </main>
    );
  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 className="display">Recommend</h1>
        <button className="linkbtn" onClick={() => { setQ(''); setSearching(false); }}>Cancel</button>
      </div>
      <p className="sub">{one ? `What should ${one.label} watch?` : 'What should your friends watch?'}</p>
      <input
        ref={inputRef}
        className="search"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        placeholder="Search a show or movie"
        aria-label="Search a show or movie"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {state.k === 'searching' && (
        <div aria-busy aria-label="Searching">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel" />
          ))}
        </div>
      )}
      {state.k === 'results' &&
        (state.items.length ? (
          <ul className="list">
            {state.items.map((t) => (
              <li key={`${t.source}:${t.id}`}>
                <button className="row" onClick={() => setPicked(t)}>
                  <img className="thumb" src={posterUrl(t.title, posterAt(t.poster, 'w185'))} alt="" />
                  <span>
                    <span className="rowtitle">{t.title}</span>
                    <br />
                    <span className="caption">{titleCaption(t)}</span>
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button className="linkbtn" style={{ marginTop: 8 }} onClick={() => setPicked(customTitleRef(state.q))}>
                Not listed? Recommend “{state.q}” anyway
              </button>
            </li>
          </ul>
        ) : (
          <div className="notice">
            <p style={{ margin: 0 }}>We couldn't find “{state.q}” in our list yet.</p>
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => setPicked(customTitleRef(state.q))}>
              Recommend “{state.q}” anyway
            </button>
            <p className="caption" style={{ margin: '8px 0 0' }}>Their TV shows the title as you typed it. Check the spelling first.</p>
          </div>
        ))}
      {state.k === 'error' && (
        <div className="notice err" role="alert">
          <p style={{ margin: 0 }}>Search isn't working right now. Try again in a moment.</p>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => setNonce((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {state.k === 'offline' && (
        <div className="notice err" role="alert">
          <p style={{ margin: 0 }}>You're offline. We'll be ready when you're back.</p>
        </div>
      )}
      {picked && (
        <Compose
          api={api}
          s={s}
          title={picked}
          onClose={() => setPicked(null)}
          onSent={(to, note) => {
            const next = addRecent(recent, { title: picked.title, to, at: Date.now() });
            setRecent(next);
            localStorage.setItem(RECENT_KEY, JSON.stringify(next));
            setSent({ title: picked, to, note });
            setPicked(null);
          }}
        />
      )}
    </main>
  );
}

/** Keeps the sheet (and its Send button) above the on-screen keyboard on iOS (visualViewport). */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => {
      vv.removeEventListener('resize', on);
      vv.removeEventListener('scroll', on);
    };
  }, []);
  return inset;
}

function Compose({ api, s, title, onClose, onSent }: { api: ApiClient; s: Extract<Session, { k: 'ready' }>; title: TitleRef; onClose: () => void; onSent: (to: string, note?: string) => void }) {
  const [note, setNote] = useState('');
  const [sel, setSel] = useState<string[]>(() => defaultRecipients(s.households, readJson<string[] | null>(LAST_KEY, null)));
  const [service, setService] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [providers, setProviders] = useState<string[] | undefined>(title.providers);
  useEffect(() => {
    let live = true;
    void api.titleDetails(s.token, title).then((d) => {
      if (!live || !d?.providers) return;
      setProviders(d.providers);
      const one = preselectService(d.providers);
      if (one) setService((cur) => (touched || cur !== null ? cur : one));
    });
    return () => void (live = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title.source, title.id]);
  const hint = providerHint(providers);
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const custom = title.source === 'custom';
  const [yearText, setYearText] = useState('');
  const year = custom ? parseYear(yearText) : undefined;
  const inset = useKeyboardInset();
  // Lock the page behind the sheet so iOS scrolls the sheet, not the body.
  useEffect(() => {
    document.body.classList.add('sheet-open');
    return () => document.body.classList.remove('sheet-open');
  }, []);
  const toggle = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const all = s.households.map((h) => h.householdId);

  const send = async () => {
    if (!sel.length || status === 'sending' || year === null) return;
    setStatus('sending');
    try {
      const trimmed = note.trim();
      await api.recommend(s.token, {
        titleRef: titleSelector(custom ? { ...title, ...(year !== undefined ? { year } : {}) } : title),
        ...(trimmed ? { note: trimmed } : {}),
        service,
        recipientHouseholdIds: sel,
      });
      localStorage.setItem(LAST_KEY, JSON.stringify(sel));
      onSent(sentTo(s.households, sel), trimmed || undefined);
    } catch {
      setStatus('error');
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Recommend ${title.title}`} style={{ bottom: inset, ['--kb' as string]: `${inset}px` }}>
        <div className="sheet-head">
          <img className="thumb" src={posterUrl(title.title, title.poster)} alt="" />
          <div style={{ flex: 1 }}>
            <div className="rowtitle" style={{ fontSize: 20 }}>{title.title}</div>
            <div className="caption">{custom ? 'Typed by you · no poster yet' : titleCaption(title)}</div>
          </div>
          <button className="linkbtn" onClick={onClose} aria-label="Close">
            Cancel
          </button>
        </div>

        {custom && (
          <div className="field">
            <label className="label" htmlFor="year">Year (optional)</label>
            <input id="year" className="note" inputMode="numeric" maxLength={4} value={yearText} onChange={(e) => setYearText(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 2019" aria-invalid={year === null} />
            {year === null && <div className="caption" style={{ color: 'var(--danger)' }}>Use a 4-digit year, or leave it empty.</div>}
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="note">Add a note (optional)</label>
          <input id="note" className="note" maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why they'll love it, or where to start" enterKeyHint="send" onKeyDown={(e) => e.key === 'Enter' && void send()} />
          {note.length >= 100 && <div className="caption" style={{ textAlign: 'right' }}>{note.length}/{NOTE_MAX}</div>}
        </div>

        <div className="field">
          <div className="label">To</div>
          <div className="chips">
            {s.households.length > 1 && (
              <button className={`chip${sel.length === all.length ? ' on' : ''}`} aria-pressed={sel.length === all.length} onClick={() => setSel(sel.length === all.length ? [] : all)}>
                Everyone
              </button>
            )}
            {s.households.map((h) => (
              <button key={h.householdId} className={`chip${sel.includes(h.householdId) ? ' on' : ''}`} aria-pressed={sel.includes(h.householdId)} onClick={() => toggle(h.householdId)}>
                {h.label}
              </button>
            ))}
          </div>
          {s.households.length === 0 && <p className="caption">You don't have anyone to send to yet.</p>}
        </div>

        <div className="field">
          <span className="label" id="where">Where can they watch it?</span>
          <div className="chips" role="radiogroup" aria-labelledby="where">
            {orderServiceOptions(serviceOptions(api.mode, title.source), providers).map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={service === o.value}
                className={'chip' + (service === o.value ? ' on' : '')}
                onClick={() => {
                  setTouched(true);
                  setService(o.value);
                }}
              >
                {o.color && <span className="svc-dot" style={{ background: o.color }} aria-hidden="true" />}
                {o.label}
              </button>
            ))}
          </div>
          {hint ? (
            <p className="caption" data-testid="provider-hint">
              {hint}
              <br />
              <span style={{ opacity: 0.75 }}>{JUSTWATCH_NOTICE}</span>
            </p>
          ) : (
            <p className="caption">Their TV will say which app to open. Not sure is fine.</p>
          )}
        </div>

        <div className="sendbar">
          {status === 'error' && (
            <p role="alert" style={{ color: 'var(--danger)', margin: '0 0 8px' }}>
              Didn't send. Check your connection and try again.
            </p>
          )}
          {!sel.length && <p className="caption" style={{ margin: '0 0 8px' }}>Pick who it's for</p>}
          <button className="btn primary block" disabled={!sel.length || status === 'sending' || year === null} onClick={() => void send()}>
            {status === 'sending' ? 'Sending…' : sendLabel(s.households, sel)}
          </button>
        </div>
      </div>
    </>
  );
}

function SentView({ sent, me, onAnother, onDone }: { sent: { title: TitleRef; to: string; note?: string }; me: Extract<Me, { kind: 'profile' }>; onAnother: () => void; onDone: () => void }) {
  return (
    <main className="center">
      <div className="check" aria-hidden>✓</div>
      <h1 className="display" style={{ fontSize: 28 }}>Sent to {sent.to}</h1>
      <p className="sub">It'll show up on their TV within a minute.</p>
      <div className="label" style={{ marginTop: 24 }}>How it'll look on their TV</div>
      <div className="tvframe" aria-label="Preview of the TV card">
        <span className="newpill">New</span>
        <div className="tvcard">
          <div style={{ position: 'relative' }}>
            <img className="tvposter" src={posterUrl(sent.title.title, sent.title.poster)} alt="" />
            <span className="avatar" style={{ position: 'absolute', left: -6, bottom: -8, background: friendHue(me.user.id) }}>
              {initials(me.user.displayName)}
            </span>
          </div>
          <div className="tvtext" style={{ textAlign: 'left' }}>
            <div className="tvover">From {me.user.displayName} · just now</div>
            <div className="tvtitle">{sent.title.title}</div>
            {sent.note && <div className="tvquote">“{sent.note}”</div>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
        <button className="btn primary block" onClick={onAnother}>
          Recommend another
        </button>
      </div>
      <button className="linkbtn" style={{ marginTop: 8 }} onClick={onDone}>
        Done
      </button>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------
function PairView({ api, session, initialCode, go }: { api: ApiClient; session: Session; initialCode: string | null; go: (p: string) => void }) {
  const fromQr = initialCode ? normalizeCode(initialCode) : '';
  const [mode, setMode] = useState<'confirm' | 'manual'>(isFullCode(fromQr) ? 'confirm' : 'manual');
  const [code, setCode] = useState(isFullCode(fromQr) ? fromQr : '');
  const [status, setStatus] = useState<{ k: 'idle' } | { k: 'busy' } | { k: 'done' } | { k: 'err'; msg: string }>({ k: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  if (session.k === 'loading') return <SessionNotice s={session} retry={() => {}} api={api} />;
  if (session.k !== 'ready') {
    // Cold QR scan without a profile on this browser (ux §6.4, MF-6).
    return (
      <main>
        <h1 className="display">Open your Gottawatch link first, then scan again.</h1>
        {isFullCode(fromQr) && <div className="bigcode" aria-label={`Code ${fromQr.split('').join(' ')}`}>{fromQr.slice(0, 3)} {fromQr.slice(3)}</div>}
        <p className="sub">
          {session.k === 'invalid' ? "Your link doesn't work anymore. Ask the person who sent it for a new one." : 'Your personal link signs you in on this phone.'} After opening it, tap “{CONNECT_TV_LABEL}” and type the code from your TV.
        </p>
      </main>
    );
  }

  const submit = async (c: string) => {
    if (!isFullCode(c)) return;
    setStatus({ k: 'busy' });
    try {
      await api.pairComplete(session.token, c);
      setStatus({ k: 'done' });
    } catch (e) {
      const k = e instanceof ApiFailure ? e.kind : 'offline';
      const msg =
        k === 'not_found'
          ? "That code didn't match. Check the TV and try again."
          : k === 'expired'
            ? 'That code expired. Your TV shows a new one.'
            : k === 'conflict'
              ? 'That code was already used. Your TV shows a new one.'
              : "Couldn't connect. Check your connection and try again.";
      setStatus({ k: 'err', msg });
      if (mode === 'confirm' && (k === 'not_found' || k === 'expired' || k === 'conflict')) {
        setMode('manual');
        setCode('');
      }
    }
  };

  if (status.k === 'done')
    return (
      <main className="center">
        <div className="check" aria-hidden>✓</div>
        <h1 className="display">Connected! Look at your TV.</h1>
        <button className="btn primary block" style={{ marginTop: 24 }} onClick={() => go('/')}>
          Recommend something
        </button>
      </main>
    );

  if (mode === 'confirm')
    return (
      <main>
        <h1 className="display">Is this the code on your TV?</h1>
        <div className="bigcode" aria-label={`Code ${code.split('').join(' ')}`}>{code.slice(0, 3)} {code.slice(3)}</div>
        <button className="btn primary block" disabled={status.k === 'busy'} onClick={() => void submit(code)}>
          {status.k === 'busy' ? 'Connecting…' : 'Yes, connect this TV'}
        </button>
        <button
          className="linkbtn"
          style={{ display: 'block', margin: '12px auto 0' }}
          onClick={() => {
            setMode('manual');
            setCode('');
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          No, that's not it
        </button>
      </main>
    );

  return (
    <main>
      <h1 className="display">{CONNECT_TV_LABEL}</h1>
      <p className="sub">The code is on your TV screen.</p>
      <div className="codeboxes" onClick={() => inputRef.current?.focus()}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`codebox${i === 3 ? ' gap' : ''}${i === code.length ? ' cur' : ''}`} aria-hidden>
            {code[i] ?? ''}
          </div>
        ))}
        <input
          ref={inputRef}
          className="codeinput"
          aria-label="Code on your TV"
          autoFocus
          autoCapitalize="characters"
          autoComplete="one-time-code"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          onChange={(e) => {
            const c = normalizeCode(e.target.value);
            setCode(c);
            if (status.k === 'err') setStatus({ k: 'idle' });
          }}
          onKeyDown={(e) => e.key === 'Enter' && void submit(code)}
        />
      </div>
      {status.k === 'err' && (
        <p role="alert" style={{ color: 'var(--danger)', textAlign: 'center' }}>
          {status.msg}
        </p>
      )}
      <button className="btn primary block" style={{ marginTop: 16 }} disabled={!isFullCode(code) || status.k === 'busy'} onClick={() => void submit(code)}>
        {status.k === 'busy' ? 'Connecting…' : 'Connect this TV'}
      </button>
    </main>
  );
}

