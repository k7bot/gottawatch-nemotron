// Email sign-in UI (ADR-0013 amendment). Hidden entirely when the API says email is off.
import { useEffect, useState } from 'react';
import { failureKind, type ApiClient } from './api';
import { normalizeEmail } from '@gottawatch/contract';

export function useEmailEnabled(api: ApiClient) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    api.authConfig().then((c) => setOn(c.email), () => setOn(false));
  }, [api]);
  return on;
}

const msg = (e: unknown, fallback: string) =>
  failureKind(e) === 'offline' ? "You're offline. Try again when you're back." : failureKind(e) === 'conflict' ? "That email can't be used. Try another one, or wait a few minutes." : fallback;

export function CodeStep({ email, onCode, onResend, onBack, busy, err }: { email: string; onCode: (c: string) => void; onResend: () => void; onBack: () => void; busy: boolean; err: string | null }) {
  const [code, setCode] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (code.length === 6) onCode(code); }}>
      <p style={{ margin: '0 0 12px' }}>We sent a 6-digit code to <b>{email}</b>. It works for 10 minutes.</p>
      <input
        className="search"
        style={{ backgroundImage: 'none', paddingLeft: 16, letterSpacing: '.3em', fontSize: 22 }}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="6-digit code"
        placeholder="123456"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
      {err && <p role="alert" style={{ color: 'var(--danger)', margin: '8px 0 0' }}>{err}</p>}
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Continue'}</button>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button type="button" className="linkbtn" onClick={onBack}>Use another email</button>
        <button type="button" className="linkbtn" onClick={onResend}>Send a new code</button>
      </div>
    </form>
  );
}

function EmailStep({ onEmail, busy, err, cta }: { onEmail: (e: string) => void; busy: boolean; err: string | null; cta: string }) {
  const [raw, setRaw] = useState('');
  const ok = !!normalizeEmail(raw);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ok) onEmail(normalizeEmail(raw)!); }}>
      <input
        className="search"
        style={{ backgroundImage: 'none', paddingLeft: 16 }}
        type="email"
        inputMode="email"
        autoComplete="email"
        aria-label="Email address"
        placeholder="you@example.com"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      {err && <p role="alert" style={{ color: 'var(--danger)', margin: '8px 0 0' }}>{err}</p>}
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy || !ok}>{busy ? 'Sending…' : cta}</button>
    </form>
  );
}

/** Signed-out screen: email → code → token. */
export function EmailSignIn({ api, onToken }: { api: ApiClient; onToken: (t: string) => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const start = async (e: string) => {
    setBusy(true);
    setErr(null);
    try {
      await api.emailStart(e);
      setEmail(e);
    } catch (x) {
      setErr(msg(x, "Couldn't send a code. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="notice" style={{ marginTop: 16 }}>
      <h2>Sign in with email</h2>
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
              setErr(msg(x, "That code didn't work. Check it or ask for a new one."));
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <>
          <p className="caption" style={{ margin: '0 0 12px' }}>Works if you've added your email in Gottawatch before.</p>
          <EmailStep onEmail={(e) => void start(e)} busy={busy} err={err} cta="Email me a code" />
        </>
      )}
    </section>
  );
}

/** Me tab: add / show the sign-in email. */
// The saved email must also go up to the session (onSaved): this component remounts every time
// the Me tab is reopened, and `current` comes from the /me response loaded once at startup.
export function EmailSection({ api, token, current, onSaved }: { api: ApiClient; token: string; current?: string; onSaved?: (email: string) => void }) {
  const [saved, setSaved] = useState(current);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const start = async (e: string) => {
    setBusy(true);
    setErr(null);
    try {
      await api.addEmail(token, e);
      setEmail(e);
    } catch (x) {
      setErr(msg(x, "Couldn't send a code. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  };
  if (saved && !editing)
    return (
      <div className="notice" style={{ marginTop: 8 }}>
        <p style={{ margin: 0 }}>{saved}</p>
        <p className="caption" style={{ margin: '4px 0 0' }}>Use it to sign in on another phone.</p>
        <button className="linkbtn" onClick={() => setEditing(true)}>Change email</button>
      </div>
    );
  return (
    <div className="notice" style={{ marginTop: 8 }}>
      {!email && <p style={{ margin: '0 0 12px' }}>Add your email so you can sign in on another phone, or get back in if you lose this one.</p>}
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
              const v = await api.verifyAddEmail(token, email, c);
              setSaved(v);
              onSaved?.(v);
              setEditing(false);
              setEmail(null);
            } catch (x) {
              setErr(msg(x, "That code didn't work. Check it or ask for a new one."));
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <EmailStep onEmail={(e) => void start(e)} busy={busy} err={err} cta="Send me a code" />
      )}
    </div>
  );
}
