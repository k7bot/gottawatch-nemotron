// App Review demo account (docs/specs/api.md §App Review demo account).
// A fixed reviewer address that signs in with a fixed code (hash stored in REVIEW#, never the code),
// plus its own isolated demo data: one household, two friends, a few recs and one sent pick.
import { codeHash, emailHash } from "../domain/email.js";
import type { Store } from "../lib/store.js";
import { applySeed, type SeedPlan } from "./seed.js";
import { findDemoTitle } from "../catalog/demo.js";
import { newRecId } from "../lib/tokens.js";
import type { Rec } from "../lib/store.js";

export const REVIEW_EMAIL = "appreview@example.com";
const HOUR = 3600e3;
const P = "appreview-";

export function buildReviewSeed(now: Date, tz = "America/New_York"): SeedPlan {
  const hh = (k: string, name: string) => ({ id: `${P}hh-${k}`, name, timezone: tz });
  const households = [hh("reviewer", "Reviewer's home"), hh("alex", "Alex's home"), hh("jordan", "Jordan's home")];
  const users = [
    { id: `${P}u-reviewer`, displayName: "App Reviewer", householdId: `${P}hh-reviewer`, email: REVIEW_EMAIL },
    { id: `${P}u-alex`, displayName: "Alex", householdId: `${P}hh-alex` },
    { id: `${P}u-jordan`, displayName: "Jordan", householdId: `${P}hh-jordan` },
  ];
  const sends: { from: string; to: string; titleId: string; hoursAgo: number; note?: string; service: string | null }[] = [
    { from: "alex", to: "reviewer", titleId: "kestrel-bay", hoursAgo: 3, note: "40-min episodes, start at ep 2", service: "netflix" },
    { from: "jordan", to: "reviewer", titleId: "the-quiet-orchard", hoursAgo: 28, service: "prime_video" },
    { from: "alex", to: "reviewer", titleId: "saltwater-static", hoursAgo: 60, service: null },
    { from: "reviewer", to: "alex", titleId: "the-quiet-orchard", hoursAgo: 20, note: "Loved this one", service: "hulu" },
  ];
  const byKey = new Map(users.map((u) => [u.id, u]));
  const recs: Rec[] = sends.map((d) => {
    const t = findDemoTitle(d.titleId);
    if (!t) throw new Error(`unknown demo title ${d.titleId}`);
    const s = byKey.get(`${P}u-${d.from}`)!;
    const at = new Date(now.getTime() - d.hoursAgo * HOUR);
    return {
      householdId: `${P}hh-${d.to}`, recId: newRecId(at), fromUserId: s.id, fromName: s.displayName,
      ...(d.note ? { note: d.note } : {}), service: d.service, titleSource: t.source, titleId: t.id, mediaType: t.mediaType,
      title: t.title, ...(t.runtime !== undefined ? { runtime: t.runtime } : {}), createdAt: at.toISOString(), seen: false,
    };
  });
  return {
    households, users,
    friendships: [[`${P}u-reviewer`, `${P}u-alex`], [`${P}u-reviewer`, `${P}u-jordan`]],
    viewerHouseholdIds: households.map((h) => h.id), recs,
  };
}

/** Re-runnable. Profile tokens minted by applySeed are discarded (the reviewer signs in by email). */
export async function applyReviewSeed(store: Store, code: string, now = new Date()): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new Error("review code must be 6 digits");
  await applySeed(store, buildReviewSeed(now));
  const h = emailHash(REVIEW_EMAIL);
  const owner = await store.getEmailOwner(h);
  if (owner && owner !== `${P}u-reviewer`) throw new Error("reviewer email already belongs to another user");
  await store.claimEmail(h, `${P}u-reviewer`);
  await store.putReviewCode(h, codeHash(REVIEW_EMAIL, code));
}
