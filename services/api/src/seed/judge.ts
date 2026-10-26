// Hackathon judge account (docs/ops/judge-access.md). Same mechanism as the App Review account
// (REVIEW# row holds only the hash of a fixed code; sign-in only, normal send/attempt limits),
// with its own isolated households and real TMDB titles resolved at seed time.
import { codeHash, emailHash } from "../domain/email.js";
import type { Rec, Store } from "../lib/store.js";
import type { TitleRef } from "@gottawatch/contract";
import { newRecId } from "../lib/tokens.js";
import { applySeed, type SeedPlan } from "./seed.js";

export const JUDGE_EMAIL = "judge@example.com";
const HOUR = 3600e3;
const P = "judge-";

/** TMDB titles the judge feed uses (mediaType, id). Keep in sync with docs/ops/judge-access.md. */
export const JUDGE_TITLES: { key: string; mediaType: "movie" | "tv"; id: string }[] = [
  { key: "bear", mediaType: "tv", id: "136315" },
  { key: "severance", mediaType: "tv", id: "95396" },
  { key: "robot", mediaType: "movie", id: "1184918" },
  { key: "slowhorses", mediaType: "tv", id: "95480" },
  { key: "dune2", mediaType: "movie", id: "693134" },
  { key: "shogun", mediaType: "tv", id: "126308" },
];

const SENDS: { from: string; to: string; key: string; hoursAgo: number; note?: string; service: string | null }[] = [
  { from: "priya", to: "judge", key: "bear", hoursAgo: 2, note: "Start with season 1, it's short", service: "hulu" },
  { from: "sam", to: "judge", key: "severance", hoursAgo: 9, note: "Trust me on this one", service: "apple_tv" },
  { from: "maya", to: "judge", key: "robot", hoursAgo: 26, note: "Great family movie night", service: null },
  { from: "priya", to: "judge", key: "slowhorses", hoursAgo: 50, service: "apple_tv" },
  { from: "sam", to: "judge", key: "dune2", hoursAgo: 75, note: "Big screen if you can", service: null },
  { from: "judge", to: "priya", key: "shogun", hoursAgo: 20, note: "You'll love the costumes", service: "hulu" },
];

export function buildJudgeSeed(now: Date, titles: Record<string, TitleRef>, tz = "America/New_York"): SeedPlan {
  const hh = (k: string, name: string) => ({ id: `${P}hh-${k}`, name, timezone: tz });
  const households = [hh("judge", "Judge's home"), hh("priya", "Priya's home"), hh("sam", "Sam's home"), hh("maya", "Maya's home")];
  const users = [
    { id: `${P}u-judge`, displayName: "Hackathon Judge", householdId: `${P}hh-judge`, email: JUDGE_EMAIL },
    { id: `${P}u-priya`, displayName: "Priya", householdId: `${P}hh-priya` },
    { id: `${P}u-sam`, displayName: "Sam", householdId: `${P}hh-sam` },
    { id: `${P}u-maya`, displayName: "Maya", householdId: `${P}hh-maya` },
  ];
  const byId = new Map(users.map((u) => [u.id, u]));
  const recs: Rec[] = SENDS.map((d) => {
    const t = titles[d.key];
    if (!t) throw new Error(`missing title ${d.key}`);
    const s = byId.get(`${P}u-${d.from}`)!;
    const at = new Date(now.getTime() - d.hoursAgo * HOUR);
    return {
      householdId: `${P}hh-${d.to}`, recId: newRecId(at), fromUserId: s.id, fromName: s.displayName,
      ...(d.note ? { note: d.note } : {}), service: d.service, titleSource: t.source, titleId: t.id, mediaType: t.mediaType,
      title: t.title, ...(t.year !== undefined ? { year: t.year } : {}), ...(t.poster ? { poster: t.poster } : {}),
      ...(t.runtime !== undefined ? { runtime: t.runtime } : {}), ...(t.genres ? { genres: t.genres } : {}),
      createdAt: at.toISOString(), seen: false,
    };
  });
  return {
    households, users,
    friendships: [[`${P}u-judge`, `${P}u-priya`], [`${P}u-judge`, `${P}u-sam`], [`${P}u-judge`, `${P}u-maya`]],
    viewerHouseholdIds: households.map((h) => h.id), recs,
  };
}

/** Re-runnable (fresh dates, Seen reset). Paired TVs stay paired. */
export async function applyJudgeSeed(store: Store, code: string, titles: Record<string, TitleRef>, now = new Date()): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new Error("judge code must be 6 digits");
  await applySeed(store, buildJudgeSeed(now, titles));
  const h = emailHash(JUDGE_EMAIL);
  const owner = await store.getEmailOwner(h);
  if (owner && owner !== `${P}u-judge`) throw new Error("judge email already belongs to another user");
  await store.claimEmail(h, `${P}u-judge`);
  await store.putReviewCode(h, codeHash(JUDGE_EMAIL, code));
}
