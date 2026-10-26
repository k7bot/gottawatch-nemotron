// Bearer-token check used by the Lambda authorizer (spec §7.2).
import type { AuthContext } from "../lib/http.js";
import type { Store } from "../lib/store.js";
import { hashToken, tokenKindOf } from "../lib/tokens.js";

export async function authorizeHeader(store: Store, header: string | undefined): Promise<AuthContext | undefined> {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  const token = m?.[1];
  if (!token || token.length > 200) return undefined;
  const kind = tokenKindOf(token);
  if (!kind) return undefined;
  const rec = await store.getToken(hashToken(token));
  if (!rec || rec.kind !== kind) return undefined;
  if (rec.expiresAt && Date.parse(rec.expiresAt) <= Date.now()) return undefined; // ES-4
  return { kind: rec.kind, subjectId: rec.subjectId, householdId: rec.householdId };
}
