// Feed, Seen, /me (spec §7.3).
import type { FeedItem, MeResponse, SeenItem } from "@gottawatch/contract";
import { ApiError, type AuthContext } from "../lib/http.js";
import type { Rec, Store } from "../lib/store.js";
import type { Clock } from "../lib/time.js";

export function toFeedItem(r: Rec): FeedItem {
  const item: FeedItem = {
    id: r.recId,
    from: { id: r.fromUserId, displayName: r.fromName, ...(r.fromAvatarUrl ? { avatarUrl: r.fromAvatarUrl } : {}) },
    title: r.title,
    mediaType: r.mediaType,
    service: r.service,
    createdAt: r.createdAt,
  };
  if (r.year !== undefined) item.year = r.year;
  if (r.poster) item.poster = r.poster;
  if (r.note) item.note = r.note;
  if (r.runtime !== undefined) item.runtime = r.runtime;
  if (r.genres?.length) item.genres = r.genres;
  return item;
}

/** Newest first, Seen excluded. Reads a bounded window (limit * 3, max 300) to skip Seen items. */
export async function getFeed(store: Store, householdId: string, limit: number): Promise<FeedItem[]> {
  const recs = await store.listRecs(householdId, { limit: Math.min(limit * 3, 300) });
  return recs.filter((r) => !r.seen).slice(0, limit).map(toFeedItem);
}

/**
 * Seen is per TITLE across the household (review MF-5): marking one rec Seen also
 * marks every other unseen rec of the same title (same titleSource:titleId) that
 * other friends sent, so the title leaves the feed and Tonight's pick/fallback.
 * Returns the recIds marked in this call.
 */
export async function markSeen(store: Store, clock: Clock, householdId: string, recId: string): Promise<string[]> {
  const rec = await store.getRec(householdId, recId);
  if (!rec) throw new ApiError("not_found", "Unknown recommendation");
  const at = clock().toISOString();
  const siblings = (await store.listRecs(householdId)).filter(
    (r) => !r.seen && r.titleSource === rec.titleSource && r.titleId === rec.titleId,
  );
  const ids = new Set(siblings.map((r) => r.recId));
  if (!rec.seen) ids.add(rec.recId);
  for (const id of ids) await store.markSeen(householdId, id, at);
  return [...ids];
}

/** Undo of markSeen: un-sees every Seen rec of the same title in the household. Returns the recIds changed. */
export async function markUnseen(store: Store, householdId: string, recId: string): Promise<string[]> {
  const rec = await store.getRec(householdId, recId);
  if (!rec) throw new ApiError("not_found", "Unknown recommendation");
  const ids = (await store.listRecs(householdId))
    .filter((r) => r.seen && r.titleSource === rec.titleSource && r.titleId === rec.titleId)
    .map((r) => r.recId);
  for (const id of ids) await store.markUnseen(householdId, id);
  return ids;
}

/** Watched history: one item per title (its most recently seen rec), newest seenAt first. */
export async function getSeenHistory(store: Store, householdId: string, limit: number): Promise<SeenItem[]> {
  const byTitle = new Map<string, Rec>();
  for (const r of await store.listRecs(householdId)) {
    if (!r.seen || !r.seenAt) continue;
    const k = `${r.titleSource}:${r.titleId}`;
    const cur = byTitle.get(k);
    if (!cur || r.seenAt > cur.seenAt! || (r.seenAt === cur.seenAt && r.recId > cur.recId)) byTitle.set(k, r);
  }
  return [...byTitle.values()]
    .sort((a, b) => (a.seenAt! < b.seenAt! ? 1 : a.seenAt! > b.seenAt! ? -1 : 0))
    .slice(0, limit)
    .map((r) => ({ ...toFeedItem(r), seenAt: r.seenAt! }));
}

export async function getMe(store: Store, ctx: AuthContext): Promise<MeResponse> {
  if (ctx.kind === "device") {
    const hh = await store.getHousehold(ctx.householdId);
    return {
      kind: "device",
      device: { id: ctx.subjectId },
      householdId: ctx.householdId,
      ...(hh ? { householdName: hh.name, timezone: hh.timezone } : {}),
    };
  }
  const user = await store.getUser(ctx.subjectId);
  if (!user) throw new ApiError("unauthorized", "Unknown profile");
  return {
    kind: "profile",
    user: { id: user.id, displayName: user.displayName, ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}) },
    householdId: user.householdId,
    ...(user.email ? { email: user.email } : {}),
  };
}
