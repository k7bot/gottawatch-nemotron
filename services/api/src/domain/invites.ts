// Friend invites (ADR-0015, docs/specs/invites.md). Bearer links; connections are always mutual.
// Never log addresses or codes.
import { createHash, randomBytes } from "node:crypto";
import { INVITE_TTL_DAYS, maskEmail, normalizeEmail, type AcceptInviteResponse, type InviteItem, type InvitePreviewResponse } from "@gottawatch/contract";
import type { AppDeps } from "../lib/deps.js";
import { ApiError } from "../lib/http.js";
import type { InviteRec, Store, User } from "../lib/store.js";

export const INVITE_TTL_MS = INVITE_TTL_DAYS * 86400e3;
export const MAX_INVITE_EMAILS_PER_DAY = 20;
export const MAX_PENDING_INVITES = 20;

export const inviteHash = (code: string) => createHash("sha256").update(`invite:${code}`).digest("hex");
const toItem = (i: InviteRec): InviteItem => ({ id: i.id, ...(i.to ? { to: i.to } : {}), createdAt: i.createdAt, expiresAt: i.expiresAt });
const live = (i: InviteRec | undefined, now: Date): i is InviteRec => !!i && Date.parse(i.expiresAt) > now.getTime();

async function me(store: Store, userId: string): Promise<User> {
  const u = await store.getUser(userId);
  if (!u) throw new ApiError("unauthorized", "Unknown profile");
  return u;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function inviteEmail(name: string, url: string) {
  const subject = `${name} sent you a Gottawatch invitation`;
  const text =
    `${name} invited you to Gottawatch, so you can send each other the shows you've gotta watch, right to your TVs.\n\n` +
    `Accept the invitation:\n${url}\n\n` +
    `The link works once and expires in ${INVITE_TTL_DAYS} days. If you weren't expecting this, you can ignore this email.\n\nGottawatch`;
  const n = esc(name);
  const html = `<!doctype html><html><body style="margin:0;background:#0E1020;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#F4F1EA">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0E1020"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:440px;background:#171A2E;border-radius:16px" cellpadding="0" cellspacing="0"><tr><td style="padding:28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#F4F1EA">
<p style="margin:0 0 20px;font-weight:700;font-size:15px;color:#F2B45A">&#9679; Gottawatch</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#F4F1EA">${n} invited you to connect on Gottawatch</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#BFC2D6">Connect on Gottawatch and you can send each other the shows you've gotta watch, right to your TVs.</p>
<a href="${esc(url)}" style="display:inline-block;background:#F2B45A;color:#0E1020;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:12px">Accept invitation</a>
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#9A9EB8">The link works once and expires in ${INVITE_TTL_DAYS} days. If you weren't expecting this, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function createInvite(deps: AppDeps, userId: string, rawEmail?: string): Promise<{ invite: InviteItem; code: string }> {
  const user = await me(deps.store, userId);
  const now = deps.clock();
  let email: string | undefined;
  if (rawEmail !== undefined && rawEmail.trim() !== "") {
    email = normalizeEmail(rawEmail) ?? undefined;
    if (!email) throw new ApiError("bad_request", "That doesn't look like an email address");
    if (!deps.mailer) throw new ApiError("not_found", "Email invites aren't available yet. Copy the link instead.");
  }
  const pending = (await deps.store.listInvites(userId)).filter((i) => live(i, now));
  if (pending.length >= MAX_PENDING_INVITES) throw new ApiError("conflict", "You have a lot of invites waiting. Cancel some first.");
  if (email && !(await deps.store.bumpInviteEmails(userId, now.toISOString().slice(0, 10), MAX_INVITE_EMAILS_PER_DAY)))
    throw new ApiError("conflict", "You've sent a lot of invites today. Try again tomorrow, or copy the link.");
  const code = randomBytes(16).toString("base64url"); // 128-bit bearer secret; only the hash is stored
  const rec: InviteRec = {
    id: randomBytes(6).toString("hex"),
    codeHash: inviteHash(code),
    inviterId: userId,
    ...(email ? { to: maskEmail(email) } : {}),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
  };
  await deps.store.putInvite(rec);
  if (email) {
    const origin = deps.webOrigin ?? "";
    const m = inviteEmail(user.displayName, `${origin}/invite/${code}`);
    try {
      await deps.mailer!.send(email, m.subject, m.text, m.html);
    } catch (e) {
      console.error("invite send failed", { name: (e as Error)?.name });
      await deps.store.consumeInvite(rec);
      throw new ApiError("internal", "Couldn't send the invite. Try again, or copy the link.");
    }
  }
  return { invite: toItem(rec), code };
}

export async function listInvites(deps: AppDeps, userId: string): Promise<InviteItem[]> {
  const now = deps.clock();
  return (await deps.store.listInvites(userId)).filter((i) => live(i, now)).map(toItem);
}

export async function cancelInvite(deps: AppDeps, userId: string, id: string): Promise<void> {
  const i = await deps.store.getInviteById(userId, id);
  if (i) await deps.store.consumeInvite(i); // idempotent: cancelling twice is fine
}

export async function previewInvite(deps: AppDeps, code: string): Promise<InvitePreviewResponse> {
  const i = await deps.store.getInvite(inviteHash(code));
  if (!live(i, deps.clock())) return { status: "gone" };
  const u = await deps.store.getUser(i.inviterId);
  if (!u) return { status: "gone" };
  return { status: "valid", inviter: { id: u.id, displayName: u.displayName, ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}) } };
}

/** Live invite for a code, or undefined (used by sign-up). */
export async function liveInvite(deps: AppDeps, code: string | undefined) {
  if (!code) return undefined;
  const i = await deps.store.getInvite(inviteHash(code));
  return live(i, deps.clock()) ? i : undefined;
}

export async function acceptInvite(deps: AppDeps, userId: string, code: string): Promise<AcceptInviteResponse> {
  const user = await me(deps.store, userId);
  const i = await liveInvite(deps, code);
  if (!i) throw new ApiError("expired", "This invite doesn't work anymore. Ask for a new one.");
  if (i.inviterId === user.id) throw new ApiError("conflict", "This is your own invite. Send it to a friend.");
  const inviter = await deps.store.getUser(i.inviterId);
  if (!inviter) throw new ApiError("expired", "This invite doesn't work anymore. Ask for a new one.");
  const friend = { id: inviter.id, displayName: inviter.displayName, householdId: inviter.householdId, ...(inviter.avatarUrl ? { avatarUrl: inviter.avatarUrl } : {}) };
  // Already connected: say so, and leave the invite for someone else.
  if ((await deps.store.listFriendIds(user.id)).includes(inviter.id)) return { friend, already: true };
  if (!(await deps.store.consumeInvite(i))) throw new ApiError("expired", "This invite doesn't work anymore. Ask for a new one.");
  await deps.store.putFriendship(user.id, inviter.id); // always mutual (ADR-0015)
  return { friend, already: false };
}

export async function removeFriend(deps: AppDeps, userId: string, friendId: string): Promise<void> {
  await me(deps.store, userId);
  await deps.store.deleteFriendship(userId, friendId);
}
