// Ask Gottawatch on the TV: one D-pad press per mood (no typing on a remote). Pure helpers, unit-tested.
import type * as C from '@gottawatch/contract';
import { ApiFailure } from './api';

export type AskChip = C.AskChip;
export type AskResult = C.AskResponse;

export const TV_ASK_CHIPS: { id: AskChip; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'funny', label: 'Funny' },
  { id: 'light', label: 'Light' },
  { id: 'intense', label: 'Intense' },
  { id: 'together', label: 'Together' },
  { id: 'movie', label: 'A movie' },
  { id: 'show', label: 'A show' },
];

export function askSourceLine(r: Pick<AskResult, 'source'>): string {
  if (r.source === 'nemotron-agent') return 'Nemotron 3 Super on Nebius';
  if (r.source === 'nemotron-fast') return 'Nemotron 3 Nano on Nebius';
  return 'Ranked by friend count';
}

/** One quiet line for the bottom of the screen: who answered, what it looked at, how long. */
export function askTraceLine(r: Pick<AskResult, 'source' | 'trace' | 'picks'>): string {
  const tools = new Set(r.trace.filter((t) => t.kind === 'tool').map((t) => t.label));
  const parts = [askSourceLine(r)];
  if (tools.has('get_friend_picks')) parts.push("read your circle's picks");
  if (tools.has('get_watch_history')) parts.push('skipped what you watched');
  const quotes = r.picks.reduce((n, p) => n + p.quotes.length, 0);
  if (r.trace.some((t) => t.label === 'grounding')) parts.push(quotes ? `checked ${quotes} quote${quotes === 1 ? '' : 's'} word for word` : 'checked every reason');
  const ms = r.trace.reduce((n, t) => n + (t.ms ?? 0), 0);
  if (ms > 0) parts.push(`${(ms / 1000).toFixed(1)}s`);
  return parts.join(' · ');
}

export function askErrorCopy(e: unknown): string {
  if (e instanceof ApiFailure && e.status === 429) return "That's a lot of asking. Try again in a few minutes.";
  if (e instanceof ApiFailure && e.kind === 'retryable' && !e.status) return "Can't reach Gottawatch right now. Check the TV's connection.";
  return "Couldn't get an answer just now. Try another mood or try again.";
}
