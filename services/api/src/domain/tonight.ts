// Tonight's pick (spec §7.4, ADR-0003, plan §5 steps 1-9).
import { REASON_MAX, type TonightResponse } from "@gottawatch/contract";
import type { Rec, Store } from "../lib/store.js";
import { DAY_MS, localDate, type Clock } from "../lib/time.js";
import { recIdLowerBound } from "../lib/tokens.js";

export const CANDIDATE_WINDOW_DAYS = 14;
export const FALLBACK_WINDOW_DAYS = 7;
export const PICK_TTL_MS = 36 * 60 * 60 * 1000;
export const ATTEMPT_GUARD_MS = 15 * 60 * 1000;
export const DEFAULT_TZ = "America/New_York";

/** One title, possibly recommended by several friends (grouped by title source + id). */
export interface Candidate {
  recId: string; // newest unseen rec of this title
  title: string;
  mediaType: Rec["mediaType"];
  runtime?: number;
  genres?: string[];
  poster?: string;
  senders: { name: string; note?: string }[];
  newestAt: string;
}

export function groupCandidates(recs: Rec[]): Candidate[] {
  const byTitle = new Map<string, Candidate>();
  // recs arrive newest first, so the first rec seen for a title is its newest.
  for (const r of recs) {
    const key = `${r.titleSource}:${r.titleId}`;
    let c = byTitle.get(key);
    if (!c) {
      c = {
        recId: r.recId,
        title: r.title,
        mediaType: r.mediaType,
        senders: [],
        newestAt: r.createdAt,
        ...(r.runtime !== undefined ? { runtime: r.runtime } : {}),
        ...(r.genres?.length ? { genres: r.genres } : {}),
        ...(r.poster ? { poster: r.poster } : {}),
      };
      byTitle.set(key, c);
    }
    if (!c.senders.some((s) => s.name === r.fromName)) {
      c.senders.push({ name: r.fromName, ...(r.note ? { note: r.note } : {}) });
    }
  }
  return [...byTitle.values()];
}

/** Most distinct senders; tie → most recent (plan §5 step 7). */
export function rankByPopularity(cands: Candidate[]): Candidate[] {
  return [...cands].sort(
    (a, b) => b.senders.length - a.senders.length || (a.newestAt < b.newestAt ? 1 : a.newestAt > b.newestAt ? -1 : 0),
  );
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export interface PickerInput {
  candidates: Candidate[];
  weekday: string; // e.g. "Sunday", household-local
}
export interface PickerOutput {
  recId: string;
  reason: string;
}
/** Returns undefined on any failure (caller falls back). */
export interface Picker {
  readonly source: "stub" | "bedrock" | "nebius";
  pick(input: PickerInput): Promise<PickerOutput | undefined>;
}

/** Deterministic, offline picker for PICK_MODE=stub. Reason uses only sender names + runtime. */
export const stubPicker: Picker = {
  source: "stub",
  async pick({ candidates }) {
    const top = rankByPopularity(candidates)[0];
    if (!top) return undefined;
    const names = top.senders.map((s) => s.name);
    let reason =
      names.length > 1 ? `${joinNames(names)} all recommended it.` : `${names[0]} recommended it.`;
    if (names.length === 2) reason = `${joinNames(names)} both recommended it.`;
    if (top.runtime) reason += ` It runs about ${top.runtime} minutes.`;
    return { recId: top.recId, reason };
  },
};

export function validatePick(out: PickerOutput | undefined, candidates: Candidate[]): PickerOutput | undefined {
  if (!out) return undefined;
  if (typeof out.recId !== "string" || typeof out.reason !== "string") return undefined;
  const reason = out.reason.trim();
  if (reason.length < 1 || reason.length > REASON_MAX) return undefined;
  if (!candidates.some((c) => c.recId === out.recId)) return undefined;
  return { recId: out.recId, reason };
}

export interface TonightDeps {
  store: Store;
  clock: Clock;
  picker: Picker;
}

function fallbackReason(c: Candidate): string {
  const n = c.senders.length;
  return n > 1 ? `Recommended by ${n} friends this week.` : `Recommended by ${c.senders[0]?.name ?? "a friend"} this week.`;
}

function respond(
  c: { recId: string; title: string; poster?: string },
  reason: string,
  source: TonightResponse["source"],
): TonightResponse {
  return { recId: c.recId, title: c.title, reason, source, ...(c.poster ? { poster: c.poster } : {}) };
}

/** Returns undefined when there is nothing to show (handler → 204). */
export async function getTonight(deps: TonightDeps, householdId: string): Promise<TonightResponse | undefined> {
  const now = deps.clock();
  const hh = await deps.store.getHousehold(householdId);
  const tz = hh?.timezone ?? DEFAULT_TZ;
  const date = localDate(now, tz);

  const recs = await deps.store.listRecs(householdId, {
    sinceRecId: recIdLowerBound(new Date(now.getTime() - CANDIDATE_WINDOW_DAYS * DAY_MS)),
  });
  const unseen = recs.filter((r) => !r.seen);

  const fallback = (): TonightResponse | undefined => {
    const weekAgo = new Date(now.getTime() - FALLBACK_WINDOW_DAYS * DAY_MS).toISOString();
    const top = rankByPopularity(groupCandidates(unseen.filter((r) => r.createdAt >= weekAgo)))[0];
    return top ? respond(top, fallbackReason(top), "fallback") : undefined;
  };

  // 1-2. Cached pick for this evening.
  const cached = await deps.store.getPick(householdId, date);
  if (cached) {
    const rec = recs.find((r) => r.recId === cached.recId) ?? (await deps.store.getRec(householdId, cached.recId));
    if (rec && !rec.seen) return respond(rec, cached.reason, cached.source);
    return fallback(); // 8. Picked rec was marked Seen: fallback, no second model call.
  }

  // 3-4. Candidates.
  const candidates = groupCandidates(unseen);
  if (candidates.length < 2) return fallback();

  // Model pickers: at most one attempt per household per guard window (spec §5 PICKTRY).
  if (deps.picker.source !== "stub") {
    const claimed = await deps.store.claimPickAttempt(householdId, date, new Date(now.getTime() + ATTEMPT_GUARD_MS));
    if (!claimed) return fallback();
  }

  // 5-7. Pick + validate.
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
  let out: PickerOutput | undefined;
  try {
    out = validatePick(await deps.picker.pick({ candidates, weekday }), candidates);
  } catch (e) {
    console.warn("picker failed", e);
    out = undefined;
  }
  if (!out) return fallback();

  const chosen = candidates.find((c) => c.recId === out.recId)!;
  await deps.store.putPick({
    householdId,
    date,
    recId: out.recId,
    reason: out.reason,
    source: deps.picker.source,
    createdAt: now.toISOString(),
  });
  return respond(chosen, out.reason, deps.picker.source);
}
