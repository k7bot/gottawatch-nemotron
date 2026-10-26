import type { AppDeps } from "../src/lib/deps.js";
import type { ApiEvent, AuthContext } from "../src/lib/http.js";
import { MemoryStore, type Rec } from "../src/lib/store.js";
import { stubPicker, type Picker } from "../src/domain/tonight.js";
import { hashToken, newRecId, newToken } from "../src/lib/tokens.js";

export class FakeClock {
  constructor(public t = new Date("2026-10-11T23:00:00.000Z")) {} // Sun 7pm ET
  now = () => new Date(this.t);
  advance(ms: number) {
    this.t = new Date(this.t.getTime() + ms);
  }
}

export function world(picker: Picker = stubPicker) {
  const clock = new FakeClock();
  const store = new MemoryStore(clock.now);
  store.households.set("hh-kiran", { id: "hh-kiran", name: "Kiran's household", timezone: "America/New_York" });
  store.households.set("hh-priya", { id: "hh-priya", name: "Priya's household", timezone: "America/New_York" });
  store.users.set("u-kiran", { id: "u-kiran", displayName: "Kiran", householdId: "hh-kiran" });
  store.users.set("u-priya", { id: "u-priya", displayName: "Priya", householdId: "hh-priya" });
  store.users.set("u-sam", { id: "u-sam", displayName: "Sam", householdId: "hh-sam" });
  store.addFriendship("u-kiran", "u-priya");
  store.addFriendship("u-kiran", "u-sam");
  const deps: AppDeps = { store, clock: clock.now, picker };
  return { clock, store, deps };
}

export async function profileToken(store: MemoryStore, userId: string) {
  const token = newToken("profile");
  const user = (await store.getUser(userId))!;
  await store.putToken({ hash: hashToken(token), kind: "profile", subjectId: userId, householdId: user.householdId });
  return token;
}

let seq = 0;
export function rec(
  store: MemoryStore,
  at: Date,
  over: Partial<Rec> & { title: string; fromName: string },
): Rec {
  const r: Rec = {
    householdId: "hh-kiran",
    recId: newRecId(at) + String(seq++).padStart(3, "0"),
    fromUserId: `u-${over.fromName.toLowerCase()}`,
    titleSource: "demo",
    titleId: over.title.toLowerCase().replace(/\s+/g, "-"),
    mediaType: "tv",
    service: null,
    createdAt: at.toISOString(),
    seen: false,
    ...over,
  };
  store.recs.set(`${r.householdId}|${r.recId}`, r);
  return r;
}

export function event(
  routeKey: string,
  opts: { body?: unknown; query?: Record<string, string>; path?: Record<string, string>; auth?: AuthContext } = {},
): ApiEvent {
  return {
    routeKey,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    isBase64Encoded: false,
    queryStringParameters: opts.query,
    pathParameters: opts.path,
    requestContext: { authorizer: opts.auth ? { lambda: opts.auth } : undefined },
  } as unknown as ApiEvent;
}

export const deviceAuth = (deviceId = "tvA1b2C3d4E5f6G7h8I9j0K1", householdId = "hh-kiran"): AuthContext => ({
  kind: "device",
  subjectId: deviceId,
  householdId,
});
export const profileAuth = (userId = "u-kiran", householdId = "hh-kiran"): AuthContext => ({
  kind: "profile",
  subjectId: userId,
  householdId,
});
export const body = (r: { body?: string }) => (r.body ? JSON.parse(r.body) : undefined);
