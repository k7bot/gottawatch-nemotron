import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AskResponse } from '@gottawatch/contract';
import { AskAnswer } from '../ask';
import { MockApiClient } from '../api';
import { ASK_NO_MATCH_HINT, ASK_TRY, askSourceLabel, askTraceRows } from '../logic';

const TOKEN = 'p_test';
const render = (r: AskResponse, asked = 'x') =>
  renderToStaticMarkup(createElement(AskAnswer, { r, asked, onClear: () => {}, onTry: () => {}, onWatched: () => {} }));

describe('Ask: off topic and nothing fits', () => {
  it('an older answer with no status still reads as ok', () => {
    expect(AskResponse.parse({ answer: 'Try X.', picks: [], source: 'fallback', trace: [] }).status).toBe('ok');
  });

  it('off topic: the redirect, one-tap questions, no pick cards, no "Picked by"', async () => {
    const r = await new MockApiClient('default', 0).ask(TOKEN, "What's the capital of France?", []);
    expect(r).toMatchObject({ status: 'off_topic', picks: [] });
    const html = render(r, "What's the capital of France?");
    expect(html).toContain('I can only help pick something to watch');
    expect(html).toContain('Try asking');
    for (const t of ASK_TRY) expect(html).toContain(t.replace("'", '&#x27;'));
    expect(html).not.toContain('ask-pick');
    expect(html).not.toContain('Best bet');
    expect(html).toContain('How I checked this');
    expect(html).toContain('Checked by Nemotron 3 Super on Nebius');
  });

  it('nothing fits: honest answer, the closest pick labeled as not a match, a nudge to ask a friend', async () => {
    const r = await new MockApiClient('default', 0).ask(TOKEN, 'A Korean horror movie from the 1980s', []);
    expect(r).toMatchObject({ status: 'no_match', picks: [], closest: { title: 'The Quiet Orchard' } });
    const html = render(r);
    expect(html).toContain('None of your friends&#x27; picks are a horror movie yet.');
    expect(html).toContain('Closest, not an exact match');
    expect(html).toContain('ask-closest');
    expect(html).not.toContain('Best bet');
    expect(html).toContain(ASK_NO_MATCH_HINT.replace("'", '&#x27;'));
    expect(html).toContain('Or try');
    // No closest: still honest, still a way forward.
    const bare = render({ ...r, closest: undefined });
    expect(bare).not.toContain('ask-closest');
    expect(bare).toContain('Or try');
  });

  it('ok answers keep their pick cards and no suggestions', async () => {
    const r = await new MockApiClient('default', 0).ask(TOKEN, 'something short', []);
    const html = render(r);
    expect(html).toContain('Best bet');
    expect(html).not.toContain('Try asking');
    expect(html).toContain('How I picked this');
  });

  it('labels and trace rows speak plainly for the new outcomes', () => {
    expect(askSourceLabel('nemotron-fast', 'no_match')).toBe('Checked by Nemotron 3 Nano on Nebius');
    expect(askSourceLabel('fallback', 'off_topic')).toBe('Checked by Gottawatch');
    expect(askSourceLabel('fallback', 'no_match')).toMatch(/AI was busy/);
    expect(askSourceLabel('fallback')).toMatch(/friend count/);
    const rows = askTraceRows([
      { kind: 'check', label: 'grounding', detail: 'status off_topic' },
      { kind: 'check', label: 'off topic', detail: 'not a what-to-watch question; no picks' },
      { kind: 'check', label: 'no match', detail: 'closest: X' },
    ]);
    expect(rows.map((x) => x.text)).toEqual(["Checked the answer against your friends' picks", 'Not a what-to-watch question, so no picks', 'Nothing your friends sent fits, so it says so']);
  });
});
