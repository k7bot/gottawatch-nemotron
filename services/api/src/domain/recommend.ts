// Friends, title search and creating recommendations (spec §7.3, flow C). Profile tokens only.
import { cleanCustomTitle, CUSTOM_YEAR_MIN, type CreateRecommendationRequest, FriendsResponse, TitleRef } from "@gottawatch/contract";
import { demoCatalog, type Catalog } from "../catalog/index.js";
import { ApiError } from "../lib/http.js";
import type { Store, User } from "../lib/store.js";
import type { Clock } from "../lib/time.js";
import { newRecId } from "../lib/tokens.js";

async function caller(store: Store, userId: string): Promise<User> {
  const user = await store.getUser(userId);
  if (!user) throw new ApiError("unauthorized", "Unknown profile");
  return user;
}

export async function listFriends(store: Store, userId: string): Promise<FriendsResponse["friends"]> {
  const ids = await store.listFriendIds(userId);
  const users = await Promise.all(ids.map((id) => store.getUser(id)));
  return users
    .filter((u): u is User => !!u)
    .map((u) => ({
      id: u.id,
      displayName: u.displayName,
      householdId: u.householdId,
      ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function searchTitles(q: string, catalog: Catalog = demoCatalog): Promise<TitleRef[]> {
  try {
    return await catalog.search(q);
  } catch {
    // TMDB down or rate-limited: the phone falls back to "recommend it anyway" (custom title).
    throw new ApiError("internal", "Search isn't available right now. You can still type the show or movie name.");
  }
}

/** Title details incl. US subscription providers (recommend sheet pre-selects a lone one). */
export async function titleDetails(catalog: Catalog = demoCatalog, id: string, mediaType: "movie" | "tv"): Promise<TitleRef> {
  if (catalog.mode !== "tmdb") throw new ApiError("not_found", "No details for this show or movie");
  let t: TitleRef | undefined;
  try {
    t = await catalog.get(id, mediaType);
  } catch {
    throw new ApiError("internal", "Couldn't load details for this show or movie right now.");
  }
  if (!t) throw new ApiError("not_found", "We couldn't find that show or movie");
  return t;
}

/** Title metadata always comes from the server-side catalog, never from the client. */
/** Stable id for a free-text title so Seen/grouping treat the same typed title as one (case-insensitive). */
export function customTitleId(title: string, year?: number): string {
  const slug = title.normalize("NFKD").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "title";
  return year ? `${slug}-${year}` : slug;
}

async function resolveTitle(ref: CreateRecommendationRequest["titleRef"], now: Date, catalog: Catalog): Promise<TitleRef> {
  if (ref.source === "custom") {
    const title = cleanCustomTitle(ref.title);
    if (!title) throw new ApiError("bad_request", "Type a title to recommend");
    const maxYear = now.getUTCFullYear() + 3;
    if (ref.year !== undefined && (ref.year < CUSTOM_YEAR_MIN || ref.year > maxYear)) throw new ApiError("bad_request", "That year doesn't look right");
    return { source: "custom", id: customTitleId(title, ref.year), title, ...(ref.year !== undefined ? { year: ref.year } : {}) };
  }
  if (ref.source !== catalog.mode) throw new ApiError("bad_request", `That show or movie isn't available right now`);
  const t = await catalog.get(ref.id, ref.source === "tmdb" ? ref.mediaType : undefined);
  if (!t) throw new ApiError("not_found", "Unknown title");
  return t;
}

export async function createRecommendation(
  store: Store,
  clock: Clock,
  userId: string,
  req: CreateRecommendationRequest,
  catalog: Catalog = demoCatalog,
): Promise<string[]> {
  const user = await caller(store, userId);
  const title = await resolveTitle(req.titleRef, clock(), catalog);
  const friends = await listFriends(store, userId);
  // Allowed recipients: friends' households, plus the sender's own household (spec §7.3, proposed).
  const allowed = new Set([user.householdId, ...friends.map((f) => f.householdId)]);
  const recipients = [...new Set(req.recipientHouseholdIds)];
  const denied = recipients.filter((h) => !allowed.has(h));
  if (denied.length) throw new ApiError("forbidden", "You can only recommend to your friends' households");

  const now = clock();
  const ids: string[] = [];
  for (const householdId of recipients) {
    const recId = newRecId(now);
    await store.putRec({
      householdId,
      recId,
      fromUserId: user.id,
      fromName: user.displayName,
      ...(user.avatarUrl ? { fromAvatarUrl: user.avatarUrl } : {}),
      ...(req.note ? { note: req.note } : {}),
      service: req.service ?? null,
      titleSource: title.source,
      titleId: title.id,
      ...(title.mediaType ? { mediaType: title.mediaType } : {}),
      title: title.title,
      ...(title.year !== undefined ? { year: title.year } : {}),
      ...(title.poster ? { poster: title.poster } : {}),
      ...(title.runtime !== undefined ? { runtime: title.runtime } : {}),
      ...(title.genres?.length ? { genres: title.genres } : {}),
      createdAt: now.toISOString(),
      seen: false,
    });
    ids.push(recId);
  }
  // Sent history (ADR-0013): one row per send, names captured now (review PT-6).
  const nameOf = (hh: string) =>
    hh === user.householdId ? [user.displayName] : friends.filter((f) => f.householdId === hh).map((f) => f.displayName);
  await store.putSent({
    userId: user.id,
    recId: ids[0]!,
    ...(req.note ? { note: req.note } : {}),
    service: req.service ?? null,
    titleSource: title.source,
    titleId: title.id,
    ...(title.mediaType ? { mediaType: title.mediaType } : {}),
    title: title.title,
    ...(title.year !== undefined ? { year: title.year } : {}),
    ...(title.poster ? { poster: title.poster } : {}),
    toNames: [...new Set(recipients.flatMap(nameOf))],
    createdAt: now.toISOString(),
  });
  return ids;
}
