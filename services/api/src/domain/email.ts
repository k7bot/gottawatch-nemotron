// Email sign-in with a one-time code (ADR-0013 amendment, review ES-1..9).
// Never log addresses or codes.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { cleanName, normalizeEmail } from "@gottawatch/contract";
import { liveInvite } from "./invites.js";
import type { AppDeps } from "../lib/deps.js";
import { ApiError } from "../lib/http.js";
import type { OtpRec } from "../lib/store.js";
import { hashToken, newRecId, newToken } from "../lib/tokens.js";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS = 3;
export const SEND_WINDOW_MS = 15 * 60 * 1000;
export const EMAIL_TOKEN_TTL_MS = 90 * 24 * 3600 * 1000;
const MIN_START_MS = 900; // ES-1: pad /auth/email/start so known vs unknown emails take about the same time

export const emailHash = (email: string) => createHash("sha256").update(`email:${email}`).digest("hex");
export const codeHash = (email: string, code: string) => createHash("sha256").update(`otp:${email}:${code}`).digest("hex");
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function cleanEmail(raw: string): string {
  const e = normalizeEmail(raw);
  if (!e) throw new ApiError("bad_request", "That doesn't look like an email address");
  return e;
}

/** Creates (or refreshes) a code and mails it. Returns false when the per-address send limit is hit. */
async function issueCode(deps: AppDeps, email: string, userId: string, purpose: OtpRec["purpose"], name?: string): Promise<boolean> {
  const h = emailHash(email);
  // App Review demo account: a seeded REVIEW# row holds the hash of a fixed code. Sign-in only,
  // never sign-up; same send/attempt limits; no email is sent.
  const review = purpose === "signin" ? await deps.store.getReviewCode(h) : undefined;
  if (!review && !deps.mailer) throw new ApiError("not_found", "Email sign-in isn't available yet");
  const now = deps.clock();
  const prev = await deps.store.getOtp(h, purpose);
  const inWindow = prev && now.getTime() - Date.parse(prev.windowStart) < SEND_WINDOW_MS;
  const sends = inWindow ? prev!.sends : 0;
  if (sends >= MAX_SENDS) return false; // ES-2
  const code = review ? "" : String(randomInt(0, 1_000_000)).padStart(6, "0");
  await deps.store.putOtp({
    emailHash: h,
    purpose,
    codeHash: review ?? codeHash(email, code),
    userId,
    email,
    ...(name ? { name } : {}),
    attempts: 0,
    sends: sends + 1,
    windowStart: inWindow ? prev!.windowStart : now.toISOString(),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
  });
  if (review) return true;
  const what = purpose === "signin" ? "sign in to Gottawatch" : purpose === "signup" ? "join Gottawatch" : "confirm your email for Gottawatch";
  await deps.mailer!.send(
    email,
    `Your Gottawatch code: ${code}`,
    `Your code to ${what} is ${code}.\n\nIt works once, for 10 minutes. If you didn't ask for it, you can ignore this email.\n\nGottawatch`,
  );
  return true;
}

/** Checks a code; burns it after MAX_ATTEMPTS wrong tries and on success (single use). */
async function checkCode(deps: AppDeps, email: string, code: string, purpose: OtpRec["purpose"]): Promise<OtpRec> {
  const bad = new ApiError("bad_request", "That code didn't work. Check it or ask for a new one.");
  if (!/^\d{6}$/.test(code)) throw bad;
  const h = emailHash(email);
  const o = await deps.store.getOtp(h, purpose);
  if (!o || o.attempts >= MAX_ATTEMPTS || Date.parse(o.expiresAt) <= deps.clock().getTime()) throw bad;
  const want = codeHash(email, code);
  if (!sameHash(o.codeHash, want)) {
    await deps.store.bumpOtpAttempts(h, purpose);
    throw bad;
  }
  if (!(await deps.store.consumeOtp(h, purpose, want))) throw bad; // ES-3: parallel verify loses
  return o;
}

export async function startEmailSignIn(deps: AppDeps, raw: string, invite?: string, rawName?: string): Promise<{ ok: true }> {
  const t0 = Date.now();
  if (!deps.mailer) throw new ApiError("not_found", "Email sign-in isn't available yet");
  const email = cleanEmail(raw);
  const userId = await deps.store.getEmailOwner(emailHash(email));
  const user = userId ? await deps.store.getUser(userId) : undefined;
  if (user && user.email === email) {
    try {
      await issueCode(deps, email, user.id, "signin");
    } catch (e) {
      console.error("email start send failed", { name: (e as Error)?.name });
    }
  } else if (!user) {
    // ADR-0015: a live invite lets a new person join. Same answer as every other case (ES-1).
    const name = cleanName(rawName ?? "");
    try {
      if (name && (await liveInvite(deps, invite))) await issueCode(deps, email, "", "signup", name);
    } catch (e) {
      console.error("email signup send failed", { name: (e as Error)?.name });
    }
  }
  const wait = MIN_START_MS - (Date.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return { ok: true }; // ES-1: same answer for every address, known or not, limited or not
}

export async function verifyEmailSignIn(deps: AppDeps, raw: string, code: string): Promise<{ profileToken: string }> {
  const email = cleanEmail(raw);
  const h = emailHash(email);
  const signup = !(await deps.store.getOtp(h, "signin")) && !!(await deps.store.getOtp(h, "signup"));
  const o = await checkCode(deps, email, code, signup ? "signup" : "signin");
  const user = signup ? await joinUser(deps, email, o.name ?? "") : await deps.store.getUser(o.userId);
  if (!user || user.email !== email) throw new ApiError("bad_request", "That code didn't work. Check it or ask for a new one.");
  const token = newToken("profile");
  await deps.store.putToken({
    hash: hashToken(token),
    kind: "profile",
    subjectId: user.id,
    householdId: user.householdId,
    expiresAt: new Date(deps.clock().getTime() + EMAIL_TOKEN_TTL_MS).toISOString(), // ES-4
  });
  return { profileToken: token };
}

/** Sign-up (ADR-0015): new person + their own home. If the address got claimed meanwhile, sign in as its owner. */
async function joinUser(deps: AppDeps, email: string, rawName: string) {
  const h = emailHash(email);
  const owner = await deps.store.getEmailOwner(h);
  if (owner) return deps.store.getUser(owner);
  const name = cleanName(rawName) || "Friend";
  const now = deps.clock();
  const id = `u-${newRecId(now)}`;
  const householdId = `hh-${newRecId(now)}`;
  if (!(await deps.store.claimEmail(h, id))) return deps.store.getUser((await deps.store.getEmailOwner(h))!);
  await deps.store.putHousehold({ id: householdId, name: `${name}'s home`, timezone: "America/New_York" });
  const user = { id, displayName: name, householdId, email };
  await deps.store.putUser(user);
  return user;
}

export async function startAddEmail(deps: AppDeps, userId: string, raw: string): Promise<{ ok: true }> {
  const email = cleanEmail(raw);
  const owner = await deps.store.getEmailOwner(emailHash(email));
  if (owner && owner !== userId) throw new ApiError("conflict", "That email can't be used. Try another one."); // ES-5
  if (!(await issueCode(deps, email, userId, "verify"))) throw new ApiError("conflict", "Too many codes. Wait 15 minutes and try again.");
  return { ok: true };
}

export async function verifyAddEmail(deps: AppDeps, userId: string, raw: string, code: string): Promise<{ ok: true; email: string }> {
  const email = cleanEmail(raw);
  const o = await checkCode(deps, email, code, "verify");
  if (o.userId !== userId) throw new ApiError("bad_request", "That code didn't work. Check it or ask for a new one.");
  if (!(await deps.store.claimEmail(emailHash(email), userId))) throw new ApiError("conflict", "That email can't be used. Try another one.");
  const user = await deps.store.getUser(userId);
  if (!user) throw new ApiError("unauthorized", "Unknown profile");
  if (user.email && user.email !== email) await deps.store.releaseEmail(emailHash(user.email), userId);
  await deps.store.putUser({ ...user, email });
  return { ok: true, email };
}
