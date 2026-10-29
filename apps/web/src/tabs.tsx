// Phone tabs (ADR-0013): For you, Friends, Me + the bottom tab bar. Recommend lives in App.tsx (HomeView).
import { useCallback, useEffect, useState } from 'react';
import { failureKind, type ApiClient, type Friend, type InviteItem, type FeedItem, type Home, type Me, type SeenItem, type SentItem } from './api';
import { friendHue, groupInbox, initials, joinNames, posterAt, posterUrl, recommendLine, timeAgo, TMDB_NOTICE, JUSTWATCH_NOTICE, type HouseholdChoice, type InboxGroup } from './logic';
import { CONNECT_TV_LABEL, serviceName, summarizeService } from '@gottawatch/contract';
import { EmailSection, useEmailEnabled } from './email';
import { InviteSheet } from './invite';
import { AskPanel } from './ask';

const connectedOn = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export type Tab = 'foryou' | 'recommend' | 'friends' | 'me';
type Load<T> = { k: 'loading' } | { k: 'error'; offline: boolean } | { k: 'ok'; v: T };

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [s, set] = useState<Load<T>>({ k: 'loading' });
  const reload = useCallback(async () => {
    try {
      set({ k: 'ok', v: await fn() });
    } catch (e) {
      set({ k: 'error', offline: failureKind(e) === 'offline' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return [s, reload, set] as const;
}

function LoadError({ offline, retry }: { offline: boolean; retry: () => void }) {
  return (
    <div className="notice err" role="alert">
      <p style={{ margin: 0 }}>{offline ? "You're offline. We'll be ready when you're back." : "That didn't load. Try again in a moment."}</p>
      <button className="btn" style={{ marginTop: 12 }} onClick={retry}>Retry</button>
    </div>
  );
}
const Skeleton = () => (
  <div aria-busy aria-label="Loading">
    {[0, 1, 2].map((i) => <div key={i} className="skel" />)}
  </div>
);
const Avatar = ({ id, name, size = 30 }: { id: string; name: string; size?: number }) => (
  <span className="avatar" aria-hidden style={{ background: friendHue(id), width: size, height: size, borderRadius: size / 2, fontSize: size > 40 ? 18 : 13 }}>
    {initials(name)}
  </span>
);

export function TabBar({ tab, set, badge }: { tab: Tab; set: (t: Tab) => void; badge: number }) {
  const items: [Tab, string, string][] = [
    ['foryou', 'For you', 'M5.5 7h13A2.5 2.5 0 0121 9.5v7a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 16.5v-7A2.5 2.5 0 015.5 7zM9 3l3 4 3-4M10 11.5l4 2-4 2z'],
    ['recommend', 'Recommend', 'M21 3L10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z'],
    ['friends', 'Friends', 'M8 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M16 11a3 3 0 100-6M18 15c2 .5 4 2 4 5'],
    ['me', 'Me', 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6'],
  ];
  return (
    <nav className="tabbar" aria-label="Main">
      {items.map(([k, label, d]) => (
        <button key={k} className={`tab${tab === k ? ' on' : ''}`} aria-current={tab === k ? 'page' : undefined} onClick={() => set(k)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={d} />
          </svg>
          <span>{label}</span>
          {k === 'foryou' && badge > 0 && <span className="tabbadge" aria-label={`${badge} waiting`}>{badge > 9 ? '9+' : badge}</span>}
        </button>
      ))}
    </nav>
  );
}

// --- For you ------------------------------------------------------------------------------
export function ForYou({ api, token, inbox, reloadInbox, go }: { api: ApiClient; token: string; inbox: Load<FeedItem[]>; reloadInbox: () => Promise<void>; go: (t: Tab) => void }) {
  const [undo, setUndo] = useState<{ g: InboxGroup } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showWatched, setShowWatched] = useState(false);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  if (showWatched) return <Watched api={api} token={token} onBack={() => { setShowWatched(false); void reloadInbox(); }} />;
  if (inbox.k === 'loading') return <main><h1 className="display">For you</h1><Skeleton /></main>;
  if (inbox.k === 'error') return <main><h1 className="display">For you</h1><LoadError offline={inbox.offline} retry={reloadInbox} /></main>;

  const groups = groupInbox(inbox.v).filter((g) => !hidden.has(g.key));
  const markWatched = async (g: InboxGroup) => {
    setBusy(g.key);
    setErr(null);
    try {
      await api.setSeen(token, g.recs[0]!.id, true);
      setHidden((h) => new Set(h).add(g.key));
      setUndo({ g });
    } catch (e) {
      setErr(failureKind(e) === 'offline' ? "You're offline. Try again when you're back." : "Couldn't save that. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const doUndo = async () => {
    if (!undo) return;
    const g = undo.g;
    setUndo(null);
    try {
      await api.setSeen(token, g.recs[0]!.id, false);
      setHidden((h) => { const n = new Set(h); n.delete(g.key); return n; });
    } catch {
      setErr("Couldn't undo. Find it under Watched.");
    }
  };

  return (
    <main>
      <h1 className="display">For you</h1>
      <p className="sub">{groups.length ? 'What your friends think you should watch.' : ''}</p>
      {groups.length > 1 && (
        <AskPanel
          api={api}
          token={token}
          onWatched={(recId) => {
            const g = groups.find((x) => x.recs.some((r) => r.id === recId));
            if (g) void markWatched(g);
          }}
        />
      )}
      {err && <div className="notice err" role="alert"><p style={{ margin: 0 }}>{err}</p></div>}
      {groups.length === 0 && (
        <div className="notice">
          <h2>Nothing waiting right now</h2>
          <p style={{ margin: '0 0 12px', color: 'var(--text2)' }}>When a friend recommends something, it shows up here and on your TV.</p>
          <button className="btn primary" onClick={() => go('recommend')}>Recommend something</button>
        </div>
      )}
      <ul className="list cards">
        {groups.map((g) => {
          const svc = serviceName(summarizeService(g.recs));
          const notes = g.recs.filter((r) => r.note);
          return (
            <li key={g.key} className="card">
              <img className="thumb" src={posterUrl(g.title, posterAt(g.poster, 'w185'))} alt="" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="rowtitle">{g.title}</div>
                <div className="caption">
                  {[g.year, g.mediaType === 'tv' ? 'Series' : g.mediaType === 'movie' ? 'Movie' : '', svc ? `On ${svc}` : ''].filter(Boolean).join(' · ')}
                </div>
                <div className="from">
                  <span className="stack">{g.recs.slice(0, 3).map((r) => <Avatar key={r.id} id={r.from.id} name={r.from.displayName} size={24} />)}</span>
                  <span>{recommendLine(g.senders)} <span className="caption fromline">· {timeAgo(Date.parse(g.latest), Date.now())}</span></span>
                </div>
                {notes.map((r) => (
                  <p key={r.id} className="quote">“{r.note}” <span className="caption">{r.from.displayName}</span></p>
                ))}
                <button className="btn small" disabled={busy === g.key} onClick={() => void markWatched(g)}>
                  {busy === g.key ? 'Saving…' : 'Watched it'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button className="linkbtn" onClick={() => setShowWatched(true)}>Watched history ›</button>
      {undo && (
        <div className="toast" role="status">
          <span>Moved “{undo.g.title}” to Watched</span>
          <button className="linkbtn accent" onClick={() => void doUndo()}>Undo</button>
        </div>
      )}
    </main>
  );
}

function Watched({ api, token, onBack }: { api: ApiClient; token: string; onBack: () => void }) {
  const [s, reload] = useLoad(() => api.watched(token), [api, token]);
  const [busy, setBusy] = useState<string | null>(null);
  const putBack = async (i: SeenItem) => {
    setBusy(i.id);
    try {
      await api.setSeen(token, i.id, false);
      await reload();
    } finally {
      setBusy(null);
    }
  };
  return (
    <main>
      <button className="linkbtn" onClick={onBack}>‹ For you</button>
      <h1 className="display">Watched</h1>
      <p className="sub">Put something back and it returns to For you and your TV.</p>
      {s.k === 'loading' && <Skeleton />}
      {s.k === 'error' && <LoadError offline={s.offline} retry={reload} />}
      {s.k === 'ok' && s.v.length === 0 && <div className="notice"><p style={{ margin: 0 }}>Nothing here yet. Things you mark as watched show up here.</p></div>}
      {s.k === 'ok' && (
        <ul className="list">
          {s.v.map((i) => (
            <li key={i.id} className="recent" style={{ alignItems: 'center' }}>
              <span>
                <span className="rowtitle" style={{ fontSize: 16 }}>{i.title}</span>
                <br />
                <span className="caption">from {i.from.displayName} · watched {timeAgo(Date.parse(i.seenAt), Date.now())}</span>
              </span>
              <button className="btn small" disabled={busy === i.id} onClick={() => void putBack(i)}>Put back</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// --- Friends ------------------------------------------------------------------------------
const daysLeft = (iso: string) => Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 86400e3));
export function Friends({ api, token, go, onFriendsChanged }: { api: ApiClient; token: string; friends: HouseholdChoice[]; go: (t: Tab) => void; me: Extract<Me, { kind: 'profile' }>; onFriendsChanged: () => Promise<void> }) {
  const [list, reloadList] = useLoad<Friend[]>(() => api.friends(token), [api, token]);
  const [pending, reloadPending] = useLoad<InviteItem[]>(() => api.invites(token), [api, token]);
  const [inbox] = useLoad(() => api.inbox(token), [api, token]);
  const [sent] = useLoad(() => api.sent(token), [api, token]);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const people = list.k === 'ok' ? list.v : [];
  const fromCount = (n: string) => (inbox.k === 'ok' ? inbox.v.filter((i) => i.from.displayName === n).length : 0);
  const toCount = (n: string) => (sent.k === 'ok' ? sent.v.filter((i) => i.to.includes(n)).length : 0);
  const cancel = async (id: string) => {
    setBusy(id);
    try {
      await api.cancelInvite(token, id);
      await reloadPending();
      setToast('Invite cancelled. That link no longer works.');
    } catch {
      setToast("Couldn't cancel. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const remove = async (f: Friend) => {
    setBusy(f.id);
    try {
      await api.removeFriend(token, f.id);
      setConfirm(null);
      await Promise.all([reloadList(), onFriendsChanged()]);
      setToast(`No longer connected with ${f.displayName}`);
    } catch {
      setToast("Couldn't remove. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const pend = pending.k === 'ok' ? pending.v : [];
  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h1 className="display">Friends</h1>
      </div>
      <p className="sub">{people.length ? `You and ${joinNames(people.map((p) => p.displayName))} can send each other picks.` : 'Connect with friends to send each other picks for your TVs.'}</p>
      {list.k === 'loading' && <Skeleton />}
      {list.k === 'error' && <LoadError offline={list.offline} retry={reloadList} />}
      {list.k === 'ok' && people.length === 0 && (
        <div className="notice center">
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>No friends here yet</p>
          <p className="caption" style={{ margin: '0 0 12px' }}>Invite someone, and once they accept you're connected both ways.</p>
          <button className="btn primary block" onClick={() => setSheet(true)}>Invite a friend</button>
        </div>
      )}
      <ul className="list">
        {people.map((p) => {
          const parts = [fromCount(p.displayName) && `${fromCount(p.displayName)} waiting for you`, toCount(p.displayName) && `you sent ${toCount(p.displayName)}`].filter(Boolean);
          return (
            <li key={p.id} className="recent" style={{ flexDirection: 'column', gap: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                  <Avatar id={p.id} name={p.displayName} size={44} />
                  <span>
                    <span className="rowtitle" style={{ fontSize: 17 }}>{p.displayName}</span>
                    <br />
                    <span className="caption">{parts.length ? parts.join(' · ') : 'Connected'}</span>
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 'none' }}>
                  <button className="btn small" style={{ marginTop: 0 }} onClick={() => go('recommend')}>Recommend</button>
                  <button className="linkbtn" aria-label={`More for ${p.displayName}`} onClick={() => setConfirm(confirm === p.id ? null : p.id)}>•••</button>
                </span>
              </div>
              {confirm === p.id && (
                <div className="notice" style={{ marginTop: 10 }}>
                  <p className="rowtitle" style={{ margin: '0 0 6px', fontSize: 16 }}>Remove connection</p>
                  <p style={{ margin: '0 0 10px' }}>Stop sharing picks with {p.displayName}? You can connect again with a new invite anytime.</p>
                  <button className="btn small" onClick={() => setConfirm(null)}>Keep</button>{' '}
                  <button className="btn small" disabled={busy === p.id} onClick={() => void remove(p)}>{busy === p.id ? 'Removing…' : 'Remove'}</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {pend.length > 0 && (
        <section className="section">
          <div className="label">Waiting to accept</div>
          {pend.map((i) => (
            <div key={i.id} className="pendrow">
              <span>
                <span style={{ fontWeight: 600 }}>{i.to ?? 'Invite link'}</span>
                <br />
                <span className="caption">Sent {timeAgo(Date.parse(i.createdAt), Date.now())} · expires in {daysLeft(i.expiresAt)} {daysLeft(i.expiresAt) === 1 ? 'day' : 'days'}</span>
              </span>
              <button className="btn small" style={{ marginTop: 0 }} disabled={busy === i.id} onClick={() => void cancel(i.id)}>{busy === i.id ? 'Cancelling…' : 'Cancel'}</button>
            </div>
          ))}
        </section>
      )}
      {people.length > 0 && (
        <button className="btn primary block" style={{ marginTop: 24 }} onClick={() => setSheet(true)}>Invite a friend</button>
      )}
      {sheet && (
        <InviteSheet
          api={api}
          token={token}
          onClose={() => { setSheet(false); void reloadPending(); }}
          onCreated={(m) => { setSheet(false); setToast(m); void reloadPending(); }}
        />
      )}
      {toast && (
        <div className="toast" role="status" style={{ padding: '12px 16px' }}>
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}

// --- Me -----------------------------------------------------------------------------------
export function MeTab({ api, token, me, onPair, onSignOut, onEmailSaved }: { api: ApiClient; token: string; me: Extract<Me, { kind: 'profile' }>; onPair: () => void; onSignOut: () => void; onEmailSaved?: (email: string) => void }) {
  const [home, reloadHome] = useLoad<Home>(() => api.home(token), [api, token]);
  const [forgetId, setForgetId] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const emailOn = useEmailEnabled(api);
  const others = home.k === 'ok' ? home.v.members.filter((m) => m.id !== me.user.id).map((m) => m.displayName) : [];
  return (
    <main>
      <h1 className="display">Me</h1>
      <p className="sub">Signed in on this phone</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Avatar id={me.user.id} name={me.user.displayName} size={48} />
        <span className="rowtitle">{me.user.displayName}</span>
      </div>

      <section className="section">
        <div className="label">Your home</div>
        {home.k === 'loading' && <Skeleton />}
        {home.k === 'error' && <LoadError offline={home.offline} retry={reloadHome} />}
        {home.k === 'ok' && (
          <div className="notice" style={{ marginTop: 8 }}>
            <p style={{ margin: '0 0 8px' }}>{others.length ? `You and ${joinNames(others)}` : 'Just you'}</p>
            {home.v.tvs.length === 0 && (
              <p className="caption" style={{ margin: '0 0 8px' }}>No TV connected yet. Connect one to see recommendations on the big screen.</p>
            )}
            {home.v.tvs.map((t) => (
              <div key={t.id} className="tvrow">
                <div className="tvline">
                  <span className="tvicon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="12" rx="2.5" /><path d="M8.5 20.5h7" /></svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="rowtitle" style={{ fontSize: 16 }}>{t.label}</span>
                    <br />
                    <span className="caption">Connected {connectedOn(t.pairedAt)}</span>
                  </div>
                  <button className="linkbtn" aria-label={`More for ${t.label}`} aria-expanded={forgetId === t.id} onClick={() => setForgetId(forgetId === t.id ? null : t.id)}>•••</button>
                </div>
                {forgetId === t.id && (
                  <div className="confirm">
                    <p className="rowtitle" style={{ margin: '0 0 6px', fontSize: 16 }}>Forget this TV</p>
                    <p style={{ margin: '0 0 10px' }}>Stop showing picks on {t.label}? You can connect it again anytime.</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn small" onClick={() => setForgetId(null)}>Keep it</button>
                      <button
                        className="btn small"
                        disabled={forgetting}
                        onClick={async () => {
                          setForgetting(true);
                          try {
                            await api.forgetTv(token, t.id);
                            setForgetId(null);
                            await reloadHome();
                          } finally {
                            setForgetting(false);
                          }
                        }}
                      >
                        {forgetting ? 'Forgetting…' : 'Forget'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button className="btn small" onClick={onPair}>{home.v.tvs.length ? 'Connect another TV' : CONNECT_TV_LABEL}</button>
          </div>
        )}
      </section>


      {(emailOn || me.email) && (
        <section className="section">
          <div className="label">Sign-in email</div>
          <EmailSection api={api} token={token} current={me.email} onSaved={onEmailSaved} />
        </section>
      )}

      <section className="section">
        <div className="label">This phone</div>
        <p className="caption">{me.email ? 'You can sign in again with your email.' : "Your private Gottawatch link signs you in. Don't share it: anyone with it can recommend as you."}</p>
        {confirm ? (
          <div className="notice">
            <p style={{ margin: '0 0 12px' }}>Sign out on this phone? {me.email ? "You can sign back in with your email." : "You'll need your link to get back in."}</p>
            <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>{' '}
            <button className="btn primary" onClick={onSignOut}>Sign out</button>
          </div>
        ) : (
          <button className="linkbtn" onClick={() => setConfirm(true)}>Sign out on this phone</button>
        )}
      </section>
      <footer className="caption" style={{ marginTop: 32, textAlign: 'center' }}>
        <img src="/tmdb-logo.svg" alt="TMDB" style={{ height: 14, display: 'block', margin: '0 auto 8px' }} />
        Show and movie info from TMDB. {TMDB_NOTICE} {JUSTWATCH_NOTICE}
      </footer>
    </main>
  );
}

/** Your sent picks, newest first: the Recommend tab's list mode (ux §6.1). */
export function SentSection({ api, token, onSearch }: { api: ApiClient; token: string; onSearch: () => void }) {
  const [sent, reloadSent] = useLoad<SentItem[]>(() => api.sent(token), [api, token]);
  if (sent.k === 'ok' && sent.v.length === 0)
    return (
      <div className="notice" style={{ textAlign: 'center' }}>
        <p className="rowtitle" style={{ margin: 0 }}>Nothing recommended yet</p>
        <p className="caption">Know a show or movie a friend would love? Send it and it lands on their TV.</p>
        <button className="btn primary block" onClick={onSearch}>Recommend something</button>
      </div>
    );
  return (
      <section className="section">
        <div className="label">You recommended</div>
        {sent.k === 'loading' && <Skeleton />}
        {sent.k === 'error' && <LoadError offline={sent.offline} retry={reloadSent} />}
        {sent.k === 'ok' && sent.v.length === 0 && null}
        {sent.k === 'ok' &&
          sent.v.map((x) => (
            <div key={x.id} className="recent">
              <span>
                <span className="rowtitle" style={{ fontSize: 16 }}>{x.title}</span>
                <br />
                <span className="caption">to {joinNames(x.to)}{serviceName(x.service) ? ` · on ${serviceName(x.service)}` : ''}</span>
              </span>
              <span className="caption">{timeAgo(Date.parse(x.createdAt), Date.now())}</span>
            </div>
          ))}
      </section>
  );
}
