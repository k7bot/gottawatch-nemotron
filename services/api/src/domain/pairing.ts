// Flow A pairing (spec §7.1, ADR-0002).
import type { PairCompleteResponse, PairStartResponse, PairStatusResponse } from "@gottawatch/contract";
import { ApiError } from "../lib/http.js";
import type { Store } from "../lib/store.js";
import type { Clock } from "../lib/time.js";
import { hashToken, newPairCode, newToken } from "../lib/tokens.js";

export const PAIR_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export interface Deps {
  store: Store;
  clock: Clock;
  genCode?: () => string;
}

export async function startPairing(deps: Deps, deviceId: string): Promise<PairStartResponse> {
  const gen = deps.genCode ?? newPairCode;
  const expiresAt = new Date(deps.clock().getTime() + PAIR_TTL_MS).toISOString();
  for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
    const code = gen();
    if (await deps.store.putPairCode({ code, deviceId, status: "pending", expiresAt })) {
      return { code, expiresAt };
    }
  }
  throw new ApiError("internal", "Could not allocate a pairing code");
}

async function liveCode(deps: Deps, code: string) {
  const rec = await deps.store.getPairCode(code);
  if (!rec) throw new ApiError("not_found", "Unknown pairing code");
  // DynamoDB TTL deletes lazily, so check expiry ourselves.
  if (new Date(rec.expiresAt) <= deps.clock()) throw new ApiError("expired", "Pairing code expired");
  return rec;
}

export async function completePairing(
  deps: Deps,
  userId: string,
  householdId: string,
  code: string,
): Promise<PairCompleteResponse> {
  const rec = await liveCode(deps, code);
  if (rec.status !== "pending") throw new ApiError("conflict", "Pairing code already used");
  if (!(await deps.store.approvePairCode(code, householdId, userId))) {
    throw new ApiError("conflict", "Pairing code already used");
  }
  return { ok: true, householdId };
}

export async function pairingStatus(deps: Deps, code: string, deviceId: string): Promise<PairStatusResponse> {
  const rec = await liveCode(deps, code);
  // Only the TV that requested the code can collect its token (OQ-10, proposed).
  if (rec.deviceId !== deviceId) throw new ApiError("not_found", "Unknown pairing code");
  if (rec.status === "pending" || !rec.householdId) return { status: "pending" };

  // Claim the code first so two concurrent polls can't both mint a token.
  if (!(await deps.store.deletePairCode(code))) throw new ApiError("not_found", "Unknown pairing code");

  const token = newToken("device");
  const hash = hashToken(token);
  const previous = await deps.store.getDevice(deviceId);
  await deps.store.putToken({ hash, kind: "device", subjectId: deviceId, householdId: rec.householdId });
  await deps.store.putDevice({
    id: deviceId,
    householdId: rec.householdId,
    tokenHash: hash,
    createdAt: deps.clock().toISOString(),
  });
  await deps.store.putHomeDevice({ householdId: rec.householdId, deviceId, pairedAt: deps.clock().toISOString() });
  // Re-pairing revokes the old token (plan §3A).
  if (previous && previous.tokenHash !== hash) await deps.store.deleteToken(previous.tokenHash);
  return { status: "paired", deviceToken: token };
}
