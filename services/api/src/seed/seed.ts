// Demo seed (API-12, spec §7.5, review MF-6). Pure plan + an apply step over `Store`,
// shared by the CLI (scripts/seed.ts) and the live smoke test (throwaway id prefix).
//
// PROVISIONAL PERSONAS (OQ-18 proposal, NOT yet confirmed by Kiran):
//   Kiran's household (America/New_York); Priya, Sam, Maya each in their own household,
//   each friends with Kiran only (not with each other). Judge households: OQ-20 open,
//   default 1; each judge user is friends with Priya, Sam and Maya.
import { findDemoTitle } from "../catalog/demo.js";
import type { Household, Rec, Store, User } from "../lib/store.js";
import { hashToken, newRecId, newToken } from "../lib/tokens.js";

const HOUR = 60 * 60 * 1000;

export interface SeedOptions {
  /** Prepended to every id (e.g. "smoke-ab12-") so a throwaway seed can't touch real data. */
  idPrefix?: string;
  /** Number of judge households (OQ-20 open; default 1, proposed). */
  judges?: number;
  timezone?: string;
}

export interface SeedPlan {
  households: Household[];
  users: User[];
  friendships: [string, string][];
  /** Households whose activity (recs, picks) is reset and re-seeded on every run. */
  viewerHouseholdIds: string[];
  recs: Rec[];
}

export interface SeedLink {
  userId: string;
  displayName: string;
  householdId: string;
  /** Plaintext profile token. Only ever written to the git-ignored links file or kept in memory. */
  token: string;
  rotated: boolean;
}

// Demo recs sent to every viewer household, relative to "now" so they stay inside the
// 7-day fallback and 14-day candidate windows (MF-6). Priya's Kestrel Bay note is from the plan
// (§7 video script); every other note is DEMO FILLER written for the Ask Gottawatch demo, so the
// agent has real friend quotes to ground "short", "funny", "intense", "together" etc. in.
// Kestrel Bay stays the only title whose newest send is the most recent 2-sender one, so the stub
// pick (most senders, then newest) is still Kestrel Bay. `seenHoursAgo` = already watched (history).
// Seed services use the generic demo ids only (ADR-0012): no real brand in demo data or the video.
type DemoRec = { from: "priya" | "sam" | "maya"; titleId: string; hoursAgo: number; note?: string; service: "app_a" | "app_b" | null; seenHoursAgo?: number };
export const DEMO_RECS: readonly DemoRec[] = [
  { from: "priya", titleId: "kestrel-bay", hoursAgo: 3, note: "40-min episodes, start at ep 2", service: "app_a" },
  { from: "sam", titleId: "kestrel-bay", hoursAgo: 26, service: "app_a" },
  { from: "maya", titleId: "the-quiet-orchard", hoursAgo: 50, note: "Bring tissues. The last twenty minutes wrecked me.", service: "app_b" },
  { from: "sam", titleId: "small-hours-bakery", hoursAgo: 5, note: "22-minute episodes, perfect when you're wiped out", service: "app_b" },
  { from: "maya", titleId: "small-hours-bakery", hoursAgo: 30, note: "I laughed out loud on the train", service: "app_b" },
  { from: "priya", titleId: "lanternfish-and-co", hoursAgo: 8, note: "The otter subplot is the funniest thing on TV", service: "app_a" },
  { from: "sam", titleId: "ninety-seconds-to-orbit", hoursAgo: 20, note: "Edge-of-your-seat. Big screen, sound up.", service: null },
  { from: "maya", titleId: "the-paper-comet", hoursAgo: 28, note: "Great one to watch together, kids or not", service: "app_b" },
  { from: "priya", titleId: "night-desk-at-hollow-pines", hoursAgo: 44, note: "Creepy but cozy. Maybe not alone after midnight.", service: "app_a" },
  { from: "sam", titleId: "copper-and-thistle", hoursAgo: 60, note: "Slow first episode, then it's brilliant", service: "app_b" },
  { from: "maya", titleId: "the-marigold-line", hoursAgo: 72, note: "Light and silly, exactly what a Friday needs", service: null },
  { from: "priya", titleId: "fjordlight", hoursAgo: 96, note: "The calmest thing I've watched all year", service: "app_a" },
  { from: "sam", titleId: "the-birdie-rule", hoursAgo: 120, service: null },
  // Already watched (Watched history; the Ask agent reads it for taste).
  { from: "priya", titleId: "below-quarry-lake", hoursAgo: 140, note: "You'll guess the twist and still love it", service: "app_a", seenHoursAgo: 48 },
  { from: "maya", titleId: "the-lighthouse-supper-club", hoursAgo: 150, service: "app_b", seenHoursAgo: 96 },
  // Saltwater Static is deliberately NOT seeded: it is the live send in shot 2 of the demo video
  // (docs/design/demo-video-shot-list.md), so it must arrive on the TV as a new card.
];

export function buildSeed(opts: SeedOptions, now: Date): SeedPlan {
  const p = opts.idPrefix ?? "";
  const tz = opts.timezone ?? "America/New_York";
  const judges = opts.judges ?? 1;
  if (!Number.isInteger(judges) || judges < 0 || judges > 20) throw new Error("judges must be 0..20");

  const households: Household[] = [];
  const users: User[] = [];
  const person = (key: string, name: string, hhName: string) => {
    households.push({ id: `${p}hh-${key}`, name: hhName, timezone: tz });
    users.push({ id: `${p}u-${key}`, displayName: name, householdId: `${p}hh-${key}` });
  };
  person("kiran", "Kiran", "Kiran's household");
  person("priya", "Priya", "Priya's household");
  person("sam", "Sam", "Sam's household");
  person("maya", "Maya", "Maya's household");
  for (let j = 1; j <= judges; j++) person(`judge-${j}`, `Judge ${j}`, `Judge household ${j}`);

  const friendsOfViewers = ["priya", "sam", "maya"].map((k) => `${p}u-${k}`);
  const viewers = ["kiran", ...Array.from({ length: judges }, (_, i) => `judge-${i + 1}`)];
  const friendships: [string, string][] = [];
  for (const v of viewers) for (const f of friendsOfViewers) friendships.push([`${p}u-${v}`, f]);

  const byKey = new Map(users.map((u) => [u.id, u]));
  const recs: Rec[] = [];
  for (const v of viewers) {
    const householdId = `${p}hh-${v}`;
    for (const d of DEMO_RECS) {
      const title = findDemoTitle(d.titleId);
      if (!title) throw new Error(`seed references unknown demo title ${d.titleId}`);
      const sender = byKey.get(`${p}u-${d.from}`)!;
      const createdAt = new Date(now.getTime() - d.hoursAgo * HOUR);
      recs.push({
        householdId,
        recId: newRecId(createdAt), // derived from createdAt (MF-6 #2)
        fromUserId: sender.id,
        fromName: sender.displayName,
        ...(d.note ? { note: d.note } : {}),
        service: d.service,
        titleSource: title.source,
        titleId: title.id,
        mediaType: title.mediaType,
        title: title.title,
        ...(title.year !== undefined ? { year: title.year } : {}),
        ...(title.runtime !== undefined ? { runtime: title.runtime } : {}),
        ...(title.genres?.length ? { genres: title.genres } : {}),
        createdAt: createdAt.toISOString(),
        seen: d.seenHoursAgo !== undefined,
        ...(d.seenHoursAgo !== undefined ? { seenAt: new Date(now.getTime() - d.seenHoursAgo * HOUR).toISOString() } : {}),
      });
    }
  }
  return { households, users, friendships, viewerHouseholdIds: viewers.map((v) => `${p}hh-${v}`), recs };
}

/** Default demo refresh interval (hours). Short enough that judge Watched marks don't linger. */
export const DEFAULT_REFRESH_HOURS = 24;

/** True when the newest seeded rec is at least `hours` old (or there is none). `hours` <= 0 turns refresh off. */
export function refreshDue(newestIso: string, nowMs: number, hours: number): boolean {
  if (!(hours > 0)) return false;
  if (!newestIso) return true;
  return nowMs - Date.parse(newestIso) >= hours * 3600e3;
}

/**
 * Writes the plan. Re-runnable: households/users/friendships are upserts; viewer households'
 * recs + picks are cleared and rewritten (fresh dates, Seen reset). Profile tokens rotate
 * (old hash deleted) unless `keepTokens[userId]` matches the stored hash, or `preserveTokens` is set
 * (scheduled demo refresh: every existing token stays valid and only new users get a link). Paired TVs stay paired.
 */
export async function applySeed(
  store: Store,
  plan: SeedPlan,
  opts: { keepTokens?: Record<string, string>; preserveTokens?: boolean } = {},
): Promise<{ links: SeedLink[]; cleared: number }> {
  // Merge over what's stored so a reseed never drops fields the plan doesn't set (e.g. Kiran's sign-in email).
  for (const h of plan.households) await store.putHousehold({ ...(await store.getHousehold(h.id)), ...h });

  const links: SeedLink[] = [];
  for (const u of plan.users) {
    const existing = await store.getUser(u.id);
    if (opts.preserveTokens && existing?.tokenHash) {
      await store.putUser({ ...existing, ...u, tokenHash: existing.tokenHash });
      continue;
    }
    const kept = opts.keepTokens?.[u.id];
    const keep = !!kept && !!existing?.tokenHash && hashToken(kept) === existing.tokenHash;
    const token = keep ? kept! : newToken("profile");
    const hash = hashToken(token);
    await store.putToken({ hash, kind: "profile", subjectId: u.id, householdId: u.householdId });
    if (existing?.tokenHash && existing.tokenHash !== hash) await store.deleteToken(existing.tokenHash);
    await store.putUser({ ...existing, ...u, tokenHash: hash });
    links.push({ userId: u.id, displayName: u.displayName, householdId: u.householdId, token, rotated: !keep });
  }

  for (const [a, b] of plan.friendships) await store.putFriendship(a, b);

  let cleared = 0;
  for (const h of plan.viewerHouseholdIds) cleared += await store.clearHouseholdActivity(h);
  for (const r of plan.recs) await store.putRec(r);
  // Demo Sent history (ADR-0013): one row per (sender, title send), naming every viewer it went to.
  const senders = new Set(plan.recs.map((r) => r.fromUserId));
  for (const s of senders) cleared += await store.clearSent(s);
  const names = new Map(plan.users.map((u) => [u.householdId, u.displayName]));
  const bySend = new Map<string, Rec[]>();
  for (const r of plan.recs) {
    const k = `${r.fromUserId}|${r.titleId}|${r.createdAt}`;
    bySend.set(k, [...(bySend.get(k) ?? []), r]);
  }
  for (const group of bySend.values()) {
    const r = group[0]!;
    const { householdId: _h, fromUserId, fromName: _f, fromAvatarUrl: _a, seen: _s, seenAt: _sa, ...rest } = r;
    await store.putSent({ ...rest, userId: fromUserId, toNames: group.map((g) => names.get(g.householdId) ?? "") .filter(Boolean) });
  }
  return { links, cleared };
}
