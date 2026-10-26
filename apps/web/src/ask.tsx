// Ask Gottawatch (phone): a mood box + chips on For you. Nemotron (on Nebius) reads only your
// friends' picks and your watch history, so every answer comes back with who sent it and their words.
import { useEffect, useRef, useState } from 'react';
import { failureKind, type ApiClient, type AskChip, type AskResult } from './api';
import { ASK_CHIPS, ASK_EXAMPLES, askErrorCopy, askSourceLabel, askTraceRows, posterUrl, toggleChip } from './logic';

type State = { k: 'idle' } | { k: 'asking'; slow: boolean } | { k: 'error'; msg: string } | { k: 'ok'; r: AskResult; asked: string };

const describeAsk = (q: string, chips: AskChip[]) =>
  q.trim() || ASK_CHIPS.filter((c) => chips.includes(c.id)).map((c) => c.label.toLowerCase()).join(', ');

export function AskPanel({ api, token, onWatched }: { api: ApiClient; token: string; onWatched?: (recId: string) => void }) {
  const [q, setQ] = useState('');
  const [chips, setChips] = useState<AskChip[]>([]);
  const [s, set] = useState<State>({ k: 'idle' });
  const [hint] = useState(() => ASK_EXAMPLES[Math.floor(Math.random() * ASK_EXAMPLES.length)]!);
  const ctl = useRef<AbortController | null>(null);
  const chipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => () => { ctl.current?.abort(); clearTimeout(chipTimer.current); }, []);

  const canAsk = (q.trim().length > 0 || chips.length > 0) && s.k !== 'asking';
  const ask = async (query = q, on = chips) => {
    clearTimeout(chipTimer.current);
    if (!query.trim() && !on.length) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    set({ k: 'asking', slow: false });
    const slow = setTimeout(() => set((x) => (x.k === 'asking' ? { k: 'asking', slow: true } : x)), 4000);
    try {
      const r = await api.ask(token, query.trim(), on, c.signal);
      set({ k: 'ok', r, asked: describeAsk(query, on) });
      requestAnimationFrame(() => result.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    } catch (e) {
      if (c.signal.aborted) return;
      set({ k: 'error', msg: askErrorCopy(failureKind(e)) });
    } finally {
      clearTimeout(slow);
    }
  };
  const reset = () => {
    ctl.current?.abort();
    setQ('');
    setChips([]);
    set({ k: 'idle' });
  };

  return (
    <section className="ask" aria-labelledby="ask-h">
      <h2 id="ask-h" className="ask-h">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
        </svg>
        What are you in the mood for?
      </h2>
      <form
        className="ask-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAsk) void ask();
        }}
      >
        <input
          className="ask-input"
          value={q}
          maxLength={300}
          onChange={(e) => setQ(e.target.value)}
          placeholder={hint}
          aria-label="Ask Gottawatch what to watch"
          enterKeyHint="go"
        />
        <button className="btn primary ask-go" type="submit" disabled={!canAsk} aria-label="Ask">
          {s.k === 'asking' ? <span className="spinner" aria-hidden /> : 'Ask'}
        </button>
      </form>
      <div className="chips" role="group" aria-label="Moods">
        {ASK_CHIPS.map((c) => {
          const on = chips.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`chip${on ? ' on' : ''}`}
              aria-pressed={on}
              onClick={() => {
                const next = toggleChip(chips, c.id);
                setChips(next);
                // Chips alone are a complete question: with no typed text, a short pause after the last
                // tap asks (no typing on the couch, and stacking chips costs one ask, not three).
                clearTimeout(chipTimer.current);
                if (q.trim()) return;
                if (next.length) chipTimer.current = setTimeout(() => void ask('', next), 700);
                else set({ k: 'idle' });
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div ref={result} aria-live="polite">
        {s.k === 'asking' && (
          <div className="ask-thinking" aria-busy>
            <div className="dots" aria-hidden><i /><i /><i /></div>
            <span>{s.slow ? 'Still reading your friends\u2019 notes\u2026' : 'Reading your friends\u2019 picks\u2026'}</span>
          </div>
        )}
        {s.k === 'error' && (
          <div className="notice err" role="alert">
            <p style={{ margin: 0 }}>{s.msg}</p>
            <button className="btn small" onClick={() => void ask()} disabled={!q.trim() && !chips.length}>Try again</button>
          </div>
        )}
        {s.k === 'ok' && <AskAnswer r={s.r} asked={s.asked} onClear={reset} onWatched={onWatched} />}
      </div>
    </section>
  );
}

function AskAnswer({ r, asked, onClear, onWatched }: { r: AskResult; asked: string; onClear: () => void; onWatched?: (recId: string) => void }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const rows = askTraceRows(r.trace);
  return (
    <div className="ask-answer">
      <p className="ask-for caption">For “{asked}”</p>
      <p className="ask-text">{r.answer}</p>
      {r.picks.length > 0 && (
        <ol className="ask-picks">
          {r.picks.map((p, i) => (
            <li key={p.recId} className="ask-pick">
              <img className="thumb" src={posterUrl(p.title, p.poster)} alt="" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ask-rank caption">{i === 0 ? 'Best bet' : `Also good`}</div>
                <div className="rowtitle">{p.title}</div>
                <div className="caption">{[p.runtime ? `${p.runtime} min` : '', p.from.length ? `From ${p.from.join(' and ')}` : ''].filter(Boolean).join(' · ')}</div>
                <p className="ask-reason">{p.reason}</p>
                {p.quotes.map((qt) => <p key={qt} className="quote">“{qt}”</p>)}
                {onWatched && (
                  <button className="btn small" disabled={done.has(p.recId)} onClick={() => { setDone((d) => new Set(d).add(p.recId)); onWatched(p.recId); }}>
                    {done.has(p.recId) ? 'Moved to Watched' : 'Watched it'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <details className="ask-how">
        <summary>How I picked this</summary>
        <ul>
          {rows.map((row, i) => (
            <li key={i}><span>{row.text}</span>{row.meta && <span className="caption">{row.meta}</span>}</li>
          ))}
        </ul>
        <p className="caption" style={{ margin: '8px 0 0' }}>Only your friends' picks and your watch history are used. Quotes are their exact words.</p>
      </details>
      <div className="ask-foot">
        <span className="caption">{askSourceLabel(r.source)}</span>
        <button className="linkbtn" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}
