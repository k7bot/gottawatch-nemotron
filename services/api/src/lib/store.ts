// Data access for the single DynamoDB table (spec §5). Two implementations:
// MemoryStore (tests, local dev) and DynamoStore (lib/dynamoStore.ts).
import type { MediaType } from "@gottawatch/contract";
import type { TokenKind } from "./tokens.js";

export interface Household { id: string; name: string; timezone: string }
export interface User {
  id: string;
  displayName: string;
  avatarUrl?: string;
  householdId: string;
  /** Hash of the user's current profile token (seed script), so a re-seed can revoke it. */
  tokenHash?: string;
  /** Confirmed sign-in email (ADR-0013 amendment). */
  email?: string;
}
export interface Device { id: string; householdId: string; tokenHash: string; createdAt: string }
export interface TokenRec { hash: string; kind: TokenKind; subjectId: string; householdId: string; /** ISO; email-minted tokens only (ES-4). */ expiresAt?: string }
export interface PairCodeRec {
  code: string;
  deviceId: string;
  status: "pending" | "approved";
  householdId?: string;
  approvedBy?: string;
  expiresAt: string; // ISO
}
export interface TitleFields {
  titleSource: "demo" | "tmdb" | "custom";
  titleId: string;
  mediaType?: MediaType;
  title: string;
  year?: number;
  poster?: string;
  runtime?: number;
  genres?: string[];
}
export interface Rec extends TitleFields {
  householdId: string; // recipient household
  recId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl?: string;
  note?: string;
  service: string | null;
  createdAt: string;
  seen: boolean;
  seenAt?: string;
}
export interface SentRec extends TitleFields {
  userId: string;
  recId: string;
  note?: string;
  service: string | null;
  toNames: string[];
  createdAt: string;
}
export interface OtpRec {
  emailHash: string;
  purpose: "signin" | "verify" | "signup";
  /** signup only (ADR-0015) */
  name?: string;
  codeHash: string;
  userId: string;
  email: string;
  attempts: number;
  sends: number;
  windowStart: string;
  expiresAt: string;
}
export interface InviteRec {
  id: string;
  codeHash: string;
  inviterId: string;
  /** Masked address (inviter-only display); never the full email. */
  to?: string;
  createdAt: string;
  expiresAt: string;
}
export interface HomeDevice { householdId: string; deviceId: string; pairedAt: string }
export interface Pick {
  householdId: string;
  date: string; // YYYY-MM-DD household-local
  recId: string;
  reason: string;
  source: "nebius" | "bedrock" | "stub";
  createdAt: string;
}

export interface CachedTitle {
  /** "<mediaType>-<tmdbId>" (movie and TV ids overlap on TMDB). */
  key: string;
  title: import("@gottawatch/contract").TitleRef;
  cachedAt: string;
}

export interface Store {
  /** TMDB metadata cache (TITLE#<mediaType>-<tmdbId>). */
  getTitle(key: string): Promise<CachedTitle | undefined>;
  putTitle(t: CachedTitle, expiresAt: Date): Promise<void>;
  /** Returns false if the code already exists. */
  putPairCode(c: PairCodeRec): Promise<boolean>;
  getPairCode(code: string): Promise<PairCodeRec | undefined>;
  /** Pending → approved. Returns false if the code is missing or not pending. */
  approvePairCode(code: string, householdId: string, userId: string): Promise<boolean>;
  /** Returns false if it was already gone (so only one caller collects the token). */
  deletePairCode(code: string): Promise<boolean>;

  getDevice(id: string): Promise<Device | undefined>;
  putDevice(d: Device): Promise<void>;
  getToken(hash: string): Promise<TokenRec | undefined>;
  putToken(t: TokenRec): Promise<void>;
  deleteToken(hash: string): Promise<void>;

  getHousehold(id: string): Promise<Household | undefined>;
  getUser(id: string): Promise<User | undefined>;
  listFriendIds(userId: string): Promise<string[]>;

  putRec(r: Rec): Promise<void>;
  getRec(householdId: string, recId: string): Promise<Rec | undefined>;
  /** Newest first. `sinceRecId` = inclusive lower bound on recId. */
  listRecs(householdId: string, opts?: { sinceRecId?: string; limit?: number }): Promise<Rec[]>;
  markSeen(householdId: string, recId: string, at: string): Promise<void>;
  /** Undo: seen = false, seenAt removed. No-op if missing. */
  markUnseen(householdId: string, recId: string): Promise<void>;

  getPick(householdId: string, date: string): Promise<Pick | undefined>;
  // --- phone (ADR-0013) ---
  putSent(s: SentRec): Promise<void>;
  /** Newest first. */
  listSent(userId: string, limit: number): Promise<SentRec[]>;
  /** Deletes all SENT# rows of the user (seed reset). */
  clearSent(userId: string): Promise<number>;
  listMemberIds(householdId: string): Promise<string[]>;
  listHomeDevices(householdId: string): Promise<HomeDevice[]>;
  putHomeDevice(d: HomeDevice): Promise<void>;
  /** Soft-unlink: drops the HH↔device index row only. */
  deleteHomeDevice(householdId: string, deviceId: string): Promise<void>;
  // --- email sign-in ---
  getEmailOwner(emailHash: string): Promise<string | undefined>;
  /** Conditional: false if another user owns it. */
  claimEmail(emailHash: string, userId: string): Promise<boolean>;
  releaseEmail(emailHash: string, userId: string): Promise<void>;
  getOtp(emailHash: string, purpose: OtpRec["purpose"]): Promise<OtpRec | undefined>;
  putOtp(o: OtpRec): Promise<void>;
  /** Conditional delete on codeHash: true only for the one caller that consumed it (ES-3). */
  consumeOtp(emailHash: string, purpose: OtpRec["purpose"], codeHash: string): Promise<boolean>;
  bumpOtpAttempts(emailHash: string, purpose: OtpRec["purpose"]): Promise<void>;
  /** App Review demo account (auth spec §App Review): hashed fixed code for one seeded address. */
  getReviewCode(emailHash: string): Promise<string | undefined>;
  putReviewCode(emailHash: string, codeHash: string): Promise<void>;
  // --- invites (ADR-0015) ---
  putInvite(i: InviteRec): Promise<void>;
  getInvite(codeHash: string): Promise<InviteRec | undefined>;
  listInvites(userId: string): Promise<InviteRec[]>;
  /** Conditional delete of the lookup row: true only for the one caller that consumed it. Also drops the inviter's index row. */
  consumeInvite(i: InviteRec): Promise<boolean>;
  /** Inviter's index row by id (for cancel). */
  getInviteById(userId: string, id: string): Promise<InviteRec | undefined>;
  /** Atomic per-user per-day counter; false when it would exceed max. */
  bumpInviteEmails(userId: string, day: string, max: number): Promise<boolean>;
  deleteFriendship(a: string, b: string): Promise<void>;
  // --- seed (API-12) ---
  putHousehold(h: Household): Promise<void>;
  putUser(u: User): Promise<void>;
  /** Writes the friendship in both directions (idempotent). */
  putFriendship(a: string, b: string): Promise<void>;
  /** Deletes every REC#, PICK# and PICKTRY# item of the household (keeps META). Returns the count. */
  clearHouseholdActivity(householdId: string): Promise<number>;
  putPick(p: Pick): Promise<void>;
  /** Returns true if this call claimed the (household, date) Bedrock attempt slot. */
  claimPickAttempt(householdId: string, date: string, expiresAt: Date): Promise<boolean>;
}

export class MemoryStore implements Store {
  titles = new Map<string, CachedTitle>();
  async getTitle(k: string) {
    const t = this.titles.get(k);
    return t && structuredClone(t);
  }
  async putTitle(t: CachedTitle) {
    this.titles.set(t.key, structuredClone(t));
  }
  pairCodes = new Map<string, PairCodeRec>();
  devices = new Map<string, Device>();
  tokens = new Map<string, TokenRec>();
  households = new Map<string, Household>();
  users = new Map<string, User>();
  friends = new Map<string, Set<string>>();
  recs = new Map<string, Rec>(); // key hh|recId
  picks = new Map<string, Pick>();
  attempts = new Map<string, Date>();
  sent = new Map<string, SentRec>(); // key user|recId
  homeDevices = new Map<string, HomeDevice>(); // key hh|deviceId
  emails = new Map<string, string>();
  invites = new Map<string, InviteRec>(); // codeHash
  inviteIdx = new Map<string, InviteRec>(); // user|id
  inviteRate = new Map<string, number>();
  async putInvite(i: InviteRec) {
    this.invites.set(i.codeHash, { ...i });
    this.inviteIdx.set(`${i.inviterId}|${i.id}`, { ...i });
  }
  async getInvite(h: string) {
    const i = this.invites.get(h);
    return i && { ...i };
  }
  async listInvites(userId: string) {
    return [...this.inviteIdx.values()].filter((i) => i.inviterId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((i) => ({ ...i }));
  }
  async getInviteById(userId: string, id: string) {
    const i = this.inviteIdx.get(`${userId}|${id}`);
    return i && { ...i };
  }
  async consumeInvite(i: InviteRec) {
    this.inviteIdx.delete(`${i.inviterId}|${i.id}`);
    return this.invites.delete(i.codeHash);
  }
  async bumpInviteEmails(userId: string, day: string, max: number) {
    const k = `${userId}|${day}`;
    const n = this.inviteRate.get(k) ?? 0;
    if (n >= max) return false;
    this.inviteRate.set(k, n + 1);
    return true;
  }
  async deleteFriendship(a: string, b: string) {
    this.friends.get(a)?.delete(b);
    this.friends.get(b)?.delete(a);
  }
  otps = new Map<string, OtpRec>();
  async getEmailOwner(h: string) {
    return this.emails.get(h);
  }
  async claimEmail(h: string, userId: string) {
    const cur = this.emails.get(h);
    if (cur && cur !== userId) return false;
    this.emails.set(h, userId);
    return true;
  }
  async releaseEmail(h: string, userId: string) {
    if (this.emails.get(h) === userId) this.emails.delete(h);
  }
  async getOtp(h: string, p: OtpRec["purpose"]) {
    const o = this.otps.get(`${h}|${p}`);
    return o && { ...o };
  }
  async putOtp(o: OtpRec) {
    this.otps.set(`${o.emailHash}|${o.purpose}`, { ...o });
  }
  async consumeOtp(h: string, p: OtpRec["purpose"], codeHash: string) {
    const o = this.otps.get(`${h}|${p}`);
    if (!o || o.codeHash !== codeHash) return false;
    this.otps.delete(`${h}|${p}`);
    return true;
  }
  reviewCodes = new Map<string, string>();
  async getReviewCode(h: string) {
    return this.reviewCodes.get(h);
  }
  async putReviewCode(h: string, codeHash: string) {
    this.reviewCodes.set(h, codeHash);
  }
  async bumpOtpAttempts(h: string, p: OtpRec["purpose"]) {
    const o = this.otps.get(`${h}|${p}`);
    if (o) o.attempts++;
  }
  constructor(private now: () => Date = () => new Date()) {}

  async putPairCode(c: PairCodeRec) {
    if (this.pairCodes.has(c.code)) return false;
    this.pairCodes.set(c.code, { ...c });
    return true;
  }
  async getPairCode(code: string) {
    const c = this.pairCodes.get(code);
    return c && { ...c };
  }
  async approvePairCode(code: string, householdId: string, userId: string) {
    const c = this.pairCodes.get(code);
    if (!c || c.status !== "pending") return false;
    Object.assign(c, { status: "approved", householdId, approvedBy: userId });
    return true;
  }
  async deletePairCode(code: string) {
    return this.pairCodes.delete(code);
  }
  async getDevice(id: string) {
    const d = this.devices.get(id);
    return d && { ...d };
  }
  async putDevice(d: Device) {
    this.devices.set(d.id, { ...d });
  }
  async putHomeDevice(d: HomeDevice) {
    this.homeDevices.set(`${d.householdId}|${d.deviceId}`, { ...d });
  }
  async listHomeDevices(householdId: string) {
    return [...this.homeDevices.values()].filter((d) => d.householdId === householdId).map((d) => ({ ...d }));
  }
  async deleteHomeDevice(householdId: string, deviceId: string) {
    this.homeDevices.delete(`${householdId}|${deviceId}`);
  }
  async listMemberIds(householdId: string) {
    return [...this.users.values()].filter((u) => u.householdId === householdId).map((u) => u.id);
  }
  async putSent(x: SentRec) {
    this.sent.set(`${x.userId}|${x.recId}`, { ...x });
  }
  async listSent(userId: string, limit: number) {
    return [...this.sent.values()].filter((x) => x.userId === userId).sort((a, b) => (a.recId < b.recId ? 1 : -1)).slice(0, limit).map((x) => ({ ...x }));
  }
  async clearSent(userId: string) {
    let n = 0;
    for (const [k, x] of this.sent) if (x.userId === userId) { this.sent.delete(k); n++; }
    return n;
  }
  async getToken(hash: string) {
    const t = this.tokens.get(hash);
    return t && { ...t };
  }
  async putToken(t: TokenRec) {
    this.tokens.set(t.hash, { ...t });
  }
  async deleteToken(hash: string) {
    this.tokens.delete(hash);
  }
  async getHousehold(id: string) {
    return this.households.get(id);
  }
  async getUser(id: string) {
    return this.users.get(id);
  }
  async listFriendIds(userId: string) {
    return [...(this.friends.get(userId) ?? [])];
  }
  async putRec(r: Rec) {
    this.recs.set(`${r.householdId}|${r.recId}`, { ...r });
  }
  async getRec(householdId: string, recId: string) {
    const r = this.recs.get(`${householdId}|${recId}`);
    return r && { ...r };
  }
  async listRecs(householdId: string, opts: { sinceRecId?: string; limit?: number } = {}) {
    const all = [...this.recs.values()]
      .filter((r) => r.householdId === householdId)
      .filter((r) => !opts.sinceRecId || r.recId >= opts.sinceRecId)
      .sort((a, b) => (a.recId < b.recId ? 1 : -1))
      .map((r) => ({ ...r }));
    return opts.limit ? all.slice(0, opts.limit) : all;
  }
  async markSeen(householdId: string, recId: string, at: string) {
    const r = this.recs.get(`${householdId}|${recId}`);
    if (r && !r.seen) Object.assign(r, { seen: true, seenAt: at });
  }
  async markUnseen(householdId: string, recId: string) {
    const r = this.recs.get(`${householdId}|${recId}`);
    if (r) {
      r.seen = false;
      delete r.seenAt;
    }
  }
  async getPick(householdId: string, date: string) {
    return this.picks.get(`${householdId}|${date}`);
  }
  async putPick(p: Pick) {
    this.picks.set(`${p.householdId}|${p.date}`, { ...p });
  }
  async claimPickAttempt(householdId: string, date: string, expiresAt: Date) {
    const key = `${householdId}|${date}`;
    const existing = this.attempts.get(key);
    if (existing && existing > this.now()) return false;
    this.attempts.set(key, expiresAt);
    return true;
  }

  async putHousehold(h: Household) {
    this.households.set(h.id, { ...h });
  }
  async putUser(u: User) {
    this.users.set(u.id, { ...u });
  }
  async putFriendship(a: string, b: string) {
    this.addFriendship(a, b);
  }
  async clearHouseholdActivity(householdId: string) {
    let n = 0;
    for (const [k, r] of this.recs) if (r.householdId === householdId) { this.recs.delete(k); n++; }
    for (const k of [...this.picks.keys()]) if (k.startsWith(`${householdId}|`)) { this.picks.delete(k); n++; }
    for (const k of [...this.attempts.keys()]) if (k.startsWith(`${householdId}|`)) { this.attempts.delete(k); n++; }
    return n;
  }

  // test helpers
  addFriendship(a: string, b: string) {
    if (!this.friends.has(a)) this.friends.set(a, new Set());
    if (!this.friends.has(b)) this.friends.set(b, new Set());
    this.friends.get(a)!.add(b);
    this.friends.get(b)!.add(a);
  }
}
