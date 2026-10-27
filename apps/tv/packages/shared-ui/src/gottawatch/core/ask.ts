// Ask Gottawatch on the TV: one D-pad press per mood (no typing on a remote). Pure helpers, unit-tested.
import type * as C from '@gottawatch/contract';
import { ASK_QUERY_MAX } from '@gottawatch/contract';
import { ApiFailure } from './api';

export type AskChip = C.AskChip;
export type AskResult = C.AskResponse;

export { ASK_QUERY_MAX };

export const TV_ASK_CHIPS: { id: AskChip; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'funny', label: 'Funny' },
  { id: 'light', label: 'Light' },
  { id: 'intense', label: 'Intense' },
  { id: 'together', label: 'Together' },
  { id: 'movie', label: 'A movie' },
  { id: 'show', label: 'A show' },
];

export function askSourceLine(r: Pick<AskResult, 'source'> & { status?: AskResult['status'] }): string {
  if (r.source === 'nemotron-agent') return 'Nemotron 3 Super on Nebius';
  if (r.source === 'nemotron-fast') return 'Nemotron 3 Nano on Nebius';
  return r.status && r.status !== 'ok' ? 'Checked by Gottawatch' : 'Ranked by friend count';
}

/** Under a "nothing fits" answer: where to go next, without a keyboard. */
export const TV_NO_MATCH_HINT = 'Try another mood, or ask a friend to send you one from their phone.';
/** Under an off-topic answer (a typed question that isn't about what to watch). Focus stays on "Type your own…". */
export const TV_OFF_TOPIC_HINT = 'Press OK to rephrase, or pick a mood.';

/** What was asked: a mood chip, or the household's own words (sent as the query, no chips). */
export type AskInput = { chip: AskChip; query?: undefined } | { query: string; chip?: undefined };

/** Where remote focus rests once an answer arrives: on the control that asked (a typed question keeps the
 * "Type your own…" tile, whatever the status, so OK reopens the field to rephrase). */
export function askFocusAfter(input: AskInput): 'typed' | AskChip {
  return input.query ? 'typed' : input.chip!;
}

/** The typed question to send, or undefined when there is nothing to send (empty submit does nothing). */
export function typedQuery(draft: string): string | undefined {
  const q = draft.replace(/\s+/g, ' ').trim().slice(0, ASK_QUERY_MAX);
  return q ? q : undefined;
}

/** The hint under the text field. Web preview: keyboard keys; Fire TV: the on-screen keyboard's Done and the remote's Back. */
export function typingHint(platform: string, length: number): string {
  const keys = platform === 'web' ? 'Press Enter to ask · Esc to cancel' : 'Press Done to ask · Back to cancel';
  const left = ASK_QUERY_MAX - length;
  return left <= 50 ? `${keys} · ${left} left` : keys;
}

/** The line above a typed answer, so the room knows what was asked. Long questions are cut to one line. */
export function askedLine(input: AskInput | undefined, max = 90): string | undefined {
  if (!input?.query) return undefined;
  const q = input.query.length > max ? input.query.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : input.query;
  return `You asked “${q}”`;
}

/** The title behind the screen: the best bet, or nothing when nothing fits. */
export function askBackdropTitle(r: Pick<AskResult, 'picks'> & { status?: AskResult['status'] }): string | undefined {
  return !r.status || r.status === 'ok' ? r.picks[0]?.title : undefined;
}

/** One quiet line for the bottom of the screen: who answered, what it looked at, how long. */
export function askTraceLine(r: Pick<AskResult, 'source' | 'trace' | 'picks'> & { status?: AskResult['status'] }): string {
  const tools = new Set(r.trace.filter((t) => t.kind === 'tool').map((t) => t.label));
  const parts = [askSourceLine(r)];
  if (tools.has('get_friend_picks')) parts.push("read your circle's picks");
  if (tools.has('get_watch_history')) parts.push('skipped what you watched');
  const quotes = r.picks.reduce((n, p) => n + p.quotes.length, 0);
  if (r.status === 'no_match') parts.push('nothing fit, so it says so');
  else if (r.status === 'off_topic') parts.push('not a what-to-watch question');
  else if (r.trace.some((t) => t.label === 'grounding')) parts.push(quotes ? `checked ${quotes} quote${quotes === 1 ? '' : 's'} word for word` : 'checked every reason');
  const ms = r.trace.reduce((n, t) => n + (t.ms ?? 0), 0);
  if (ms > 0) parts.push(`${(ms / 1000).toFixed(1)}s`);
  return parts.join(' · ');
}

export function askErrorCopy(e: unknown): string {
  if (e instanceof ApiFailure && e.status === 429) return "That's a lot of asking. Try again in a few minutes.";
  if (e instanceof ApiFailure && e.kind === 'retryable' && !e.status) return "Can't reach Gottawatch right now. Check the TV's connection.";
  return "Couldn't get an answer just now. Try another mood or try again.";
}
