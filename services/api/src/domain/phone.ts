// Phone-only routes (ADR-0013): inbox, watched, sent, home. Profile tokens only.
import type { HomeResponse, SentItem } from "@gottawatch/contract";
import { ApiError, type AuthContext } from "../lib/http.js";
import type { Store, User } from "../lib/store.js";

/** Review PT-2: the home comes from the user record, not the token context; fail closed. */
export async function homeOf(store: Store, ctx: AuthContext): Promise<User> {
  const user = await store.getUser(ctx.subjectId);
  if (!user) throw new ApiError("unauthorized", "Unknown profile");
  return user;
}

export async function getSent(store: Store, userId: string, limit: number): Promise<SentItem[]> {
  return (await store.listSent(userId, limit)).map((x) => ({
    id: x.recId,
    title: x.title,
    ...(x.year !== undefined ? { year: x.year } : {}),
    ...(x.mediaType ? { mediaType: x.mediaType } : {}),
    ...(x.poster ? { poster: x.poster } : {}),
    ...(x.note ? { note: x.note } : {}),
    service: x.service,
    to: x.toNames,
    createdAt: x.createdAt,
  }));
}

export async function getHome(store: Store, user: User): Promise<HomeResponse> {
  const hh = await store.getHousehold(user.householdId);
  const memberIds = new Set([user.id, ...(await store.listMemberIds(user.householdId))]);
  const members = (await Promise.all([...memberIds].map((id) => store.getUser(id))))
    .filter((u): u is User => !!u && u.householdId === user.householdId)
    .map((u) => ({ id: u.id, displayName: u.displayName, ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}) }))
    .sort((a, b) => (a.id === user.id ? -1 : b.id === user.id ? 1 : a.displayName.localeCompare(b.displayName)));
  const devs = await store.listHomeDevices(user.householdId);
  // A TV re-paired to another home keeps a stale index row here; only list TVs still bound to this home.
  const live = [];
  for (const d of devs) {
    const dev = await store.getDevice(d.deviceId);
    if (dev && dev.householdId === user.householdId) live.push(d);
  }
  live.sort((a, b) => (a.pairedAt < b.pairedAt ? -1 : 1));
  return {
    home: { id: user.householdId, name: hh?.name ?? `${user.displayName}'s home` },
    members,
    tvs: live.map((d, i) => ({ id: d.deviceId, label: live.length > 1 ? `TV ${i + 1}` : "TV", pairedAt: d.pairedAt })),
  };
}

/**
 * Soft-unlink a TV from this home (Me → Forget this TV).
 * Drops the HH↔device index and revokes the device token so picks stop.
 * Keeps DEVICE#META so the same stick can pair again.
 */
export async function forgetTv(store: Store, user: User, deviceId: string): Promise<{ ok: true }> {
  if (!deviceId || deviceId.length > 128) throw new ApiError("bad_request", "Missing TV");
  const linked = (await store.listHomeDevices(user.householdId)).some((d) => d.deviceId === deviceId);
  const dev = await store.getDevice(deviceId);
  if (!linked && !(dev && dev.householdId === user.householdId)) throw new ApiError("not_found", "That TV isn't connected to your home");
  await store.deleteHomeDevice(user.householdId, deviceId);
  if (dev && dev.householdId === user.householdId) {
    await store.deleteToken(dev.tokenHash);
    await store.putDevice({ ...dev, householdId: "", tokenHash: "" });
  }
  return { ok: true };
}
