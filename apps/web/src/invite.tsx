// Friend invites (ADR-0015, docs/specs/invites.md): Invite sheet (Friends tab) and the /invite/<code> page.
// Connections are always two-way; the copy says so everywhere.
import { useEffect, useState } from 'react';
import { normalizeEmail, cleanName } from '@gottawatch/contract';
import { failureKind, type ApiClient, type Friend, type InvitePreview } from './api';
import { friendHue, initials } from './logic';
import { CodeStep } from './email';

export const INVITE_PATH_RE = /^\/invite\/([A-Za-z0-9_-]{20,64})\/?$/;
export const inviteUrl = (code: string) => `${location.origin}/invite/${code}`;

const Avatar = ({ id, name, size = 64 }: { id: string; name: string; size?: number }) => (
  <span className="avatar" aria-hidden style={{ background: friendHue(id), width: size, height: size, borderRadius: size / 2, fontSize: size > 40 ? 24 : 13 }}>
    {initials(name)}
  </span>
);

function useSheetLock() {
  useEffect(() => {
    document.body.classList.add('sheet-open');
    return () => document.body.classList.remove('sheet-open');
  }, []);
}

/** Bottom sheet: invite by email, or copy/share a link. */
export function InviteSheet({ api, token, onClose, onCreated }: { api: ApiClient; token: string; onClose: () => void; onCreated: (msg: string) => void }) {
  useSheetLock();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState<'email' | 'link' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const email = normalizeEmail(raw);
  const fail = (x: unknown) =>
    setErr(failureKind(x) === 'offline' ? "You're offline. Try again when you're back." : failureKind(x) === 'conflict' ? "You've sent a lot of invites. Try again tomorrow, or cancel some you don't need." : "Couldn't create the invite. Try again in a moment.");

  const sendEmail = async () => {
    if (!email || busy) return;
    setBusy('email');
    setErr(null);
    try {
      await api.createInvite(token, email);
      onCreated(`Invite sent to ${email}`);
    } catch (x) {
      fail(x);
    } finally {
      setBusy(null);
    }
  };
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false); // the link stays visible to copy by hand
    }
  };
  const makeLink = async () => {
    if (busy) return;
    setBusy('link');
    setErr(null);
    try {
      const { code } = await api.createInvite(token);
      const url = inviteUrl(code);
      setLink(url);
      if (typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches) {
        try {
          await navigator.share({ title: 'Gottawatch', text: "Let's share shows and movies on Gottawatch", url });
          return;
        } catch {
          /* cancelled share: fall through to copy */
        }
      }
      await copy(url);
    } catch (x) {
      fail(x);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Invite a friend">
        <div className="sheet-head" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, font: '600 22px/28px Fraunces, serif' }}>Invite a friend</h2>
          <button className="linkbtn" onClick={onClose}>Close</button>
        </div>
        <p className="sub" style={{ margin: '6px 0 0' }}>When they accept, you're connected both ways: you can send each other picks for your TVs.</p>

        {link ? (
          <div className="field">
            <div className="label">{copied ? 'Link copied' : 'Your invite link'}</div>
            <input className="note" readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 15 }} />
            <p className="caption" style={{ margin: '6px 0 0' }}>Paste it in a text or chat. It works once, for 7 days. Anyone with it can connect with you.</p>
            <div className="sendbar">
              <button className="btn primary block" onClick={() => void copy(link)}>{copied ? 'Copied ✓' : 'Copy link'}</button>
              <button className="linkbtn" style={{ width: '100%' }} onClick={() => onCreated('Invite link ready')}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <form className="field" onSubmit={(e) => { e.preventDefault(); void sendEmail(); }}>
              <label className="label" htmlFor="invite-email">Their email</label>
              <input id="invite-email" className="note" type="email" inputMode="email" autoComplete="off" placeholder="friend@example.com" value={raw} onChange={(e) => setRaw(e.target.value)} enterKeyHint="send" />
              <p className="caption" style={{ margin: '6px 0 0' }}>We'll email them a link from Gottawatch. It doesn't need to be the email they sign in with.</p>
              <button className="btn primary block" style={{ marginTop: 12 }} disabled={!email || !!busy}>{busy === 'email' ? 'Sending…' : 'Send invite'}</button>
            </form>
            <div className="ordivider" aria-hidden><span>or</span></div>
            <div className="sendbar" style={{ marginTop: 0 }}>
              {err && <p role="alert" style={{ color: 'var(--danger)', margin: '0 0 8px' }}>{err}</p>}
              <button className="btn block" disabled={!!busy} onClick={() => void makeLink()}>{busy === 'link' ? 'Making a link…' : 'Copy invite link'}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

type View =
  | { k: 'loading' }
  | { k: 'offline' }
  | { k: 'gone' }
  | { k: 'prompt'; inviter: InvitePreview['inviter'] & {} }
  | { k: 'busy'; inviter: InvitePreview['inviter'] & {} }
  | { k: 'done'; name: string; already: boolean };

/** /invite/<code>. Signed in: Connect / Not now. Signed out: name + email → code → the same prompt. */
export function InvitePage({ api, code, token, meId, emailOn, onSignedIn, onConnected, go }: {
  api: ApiClient;
  code: string;
  token: string | null;
  meId: string | null;
  emailOn: boolean;
  onSignedIn: (t: string) => void;
  onConnected: () => Promise<void>;
  go: (tab: 'recommend' | 'friends' | 'foryou') => void;
}) {
  const [v, setV] = useState<View>({ k: 'loading' });
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.previewInvite(code).then(
      (p) => live && setV(p.status === 'valid' && p.inviter ? { k: 'prompt', inviter: p.inviter } : { k: 'gone' }),
      (e) => live && setV(failureKind(e) === 'offline' ? { k: 'offline' } : { k: 'gone' }),
    );
    return () => void (live = false);
  }, [api, code]);
  useEffect(() => {
    if (token) api.friends(token).then(setFriends, () => setFriends([]));
  }, [api, token]);

  if (v.k === 'loading' || (token && !friends && v.k === 'prompt'))
    return <div aria-busy><div className="skel" style={{ height: 64, width: 64, borderRadius: 32, margin: '40px auto 0' }} /><div className="skel" style={{ height: 38 }} /></div>;
  if (v.k === 'offline')
    return <div className="notice err" role="alert"><h2>You're offline.</h2><p className="sub" style={{ margin: 0 }}>Open the invite again when you're back.</p></div>;
  if (v.k === 'gone')
    return (
      <section className="center" style={{ marginTop: 40 }}>
        <h1 className="display">This invite doesn't work anymore</h1>
        <p className="sub">It may have been used, cancelled, or it's more than 7 days old. Ask your friend to send a new one.</p>
        <button className="btn" onClick={() => go('foryou')}>Open Gottawatch</button>
      </section>
    );
  if (v.k === 'done')
    return (
      <section className="center" style={{ marginTop: 24 }}>
        <div className="check" aria-hidden>✓</div>
        <h1 className="display" style={{ marginTop: 20 }}>{v.already ? `You and ${v.name} are already connected` : `You and ${v.name} are connected`}</h1>
        <p className="sub">You can send each other picks. {v.name}'s picks show up on your TV, and yours on theirs.</p>
        <button className="btn primary block" onClick={() => go('recommend')}>Recommend something to {v.name}</button>
        <button className="linkbtn" style={{ width: '100%' }} onClick={() => go('friends')}>See your friends</button>
      </section>
    );

  const inviter = v.inviter;
  const head = (
    <div className="center" style={{ marginTop: 32 }}>
      <Avatar id={inviter.id} name={inviter.displayName} />
      <h1 className="display" style={{ marginTop: 16, marginBottom: 6 }}>{token ? `Connect with ${inviter.displayName}?` : `${inviter.displayName} invited you to Gottawatch`}</h1>
      <p className="sub">You'll both be able to send each other the shows and movies you've gotta watch, right to your TVs.</p>
    </div>
  );
  if (token && meId === inviter.id)
    return (
      <>
        {head}
        <div className="notice"><p style={{ margin: 0 }}>This is your own invite. Send the link to a friend, and they'll see this screen.</p></div>
        <button className="btn block" style={{ marginTop: 16 }} onClick={() => go('friends')}>Back to Friends</button>
      </>
    );
  if (token && friends?.some((f) => f.id === inviter.id))
    return (
      <>
        {head}
        <div className="notice"><p style={{ margin: 0 }}>You and {inviter.displayName} are already connected.</p></div>
        <button className="btn primary block" style={{ marginTop: 16 }} onClick={() => go('recommend')}>Recommend something to {inviter.displayName}</button>
      </>
    );
  if (token) {
    const accept = async () => {
      setV({ k: 'busy', inviter });
      setErr(null);
      try {
        const r = await api.acceptInvite(token, code);
        await onConnected();
        setV({ k: 'done', name: r.friend.displayName, already: r.already });
      } catch (x) {
        const kind = failureKind(x);
        if (kind === 'expired' || kind === 'not_found') return setV({ k: 'gone' });
        setV({ k: 'prompt', inviter });
        setErr(kind === 'offline' ? "You're offline. Try again when you're back." : kind === 'conflict' ? 'This is your own invite.' : "Couldn't connect. Try again in a moment.");
      }
    };
    return (
      <>
        {head}
        {err && <p role="alert" style={{ color: 'var(--danger)', textAlign: 'center' }}>{err}</p>}
        <button className="btn primary block" disabled={v.k === 'busy'} onClick={() => void accept()}>{v.k === 'busy' ? 'Connecting…' : `Connect with ${inviter.displayName}`}</button>
        <button className="linkbtn" style={{ width: '100%' }} onClick={() => go('foryou')}>Not now</button>
      </>
    );
  }
  return (
    <>
      {head}
      {emailOn ? <JoinForm api={api} code={code} inviterName={inviter.displayName} onToken={onSignedIn} /> : <div className="notice"><p style={{ margin: 0 }}>Sign-in is down for a moment. Try this link again soon.</p></div>}
    </>
  );
}

function JoinForm({ api, code, inviterName, onToken }: { api: ApiClient; code: string; inviterName: string; onToken: (t: string) => void }) {
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = !!normalizeEmail(raw) && !!cleanName(name);
  const start = async (e: string) => {
    setBusy(true);
    setErr(null);
    try {
      await api.emailStart(e, { invite: code, name: cleanName(name) });
      setEmail(e);
    } catch (x) {
      setErr(failureKind(x) === 'offline' ? "You're offline. Try again when you're back." : "Couldn't send a code. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="notice" style={{ marginTop: 8 }}>
      <h2>{email ? 'Check your email' : 'Sign in or join'}</h2>
      {email ? (
        <CodeStep
          email={email}
          busy={busy}
          err={err}
          onBack={() => setEmail(null)}
          onResend={() => void start(email)}
          onCode={async (c) => {
            setBusy(true);
            setErr(null);
            try {
              onToken(await api.emailVerify(email, c));
            } catch (x) {
              setErr(failureKind(x) === 'offline' ? "You're offline. Try again when you're back." : "That code didn't work. Check it or ask for a new one.");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (ok) void start(normalizeEmail(raw)!); }}>
          <label className="label" htmlFor="join-name">Your first name</label>
          <input id="join-name" className="note" autoComplete="given-name" maxLength={40} placeholder="e.g. Alex" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="caption" style={{ margin: '4px 0 12px' }}>So {inviterName} knows it's you.</p>
          <label className="label" htmlFor="join-email">Your email</label>
          <input id="join-email" className="note" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={raw} onChange={(e) => setRaw(e.target.value)} />
          <p className="caption" style={{ margin: '4px 0 0' }}>Already on Gottawatch? Use the email you sign in with.</p>
          {err && <p role="alert" style={{ color: 'var(--danger)', margin: '8px 0 0' }}>{err}</p>}
          <button className="btn primary block" style={{ marginTop: 14 }} disabled={busy || !ok}>{busy ? 'Sending…' : 'Email me a code'}</button>
        </form>
      )}
    </section>
  );
}
