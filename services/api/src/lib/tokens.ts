import { createHash, randomBytes, randomInt } from "node:crypto";
import { PAIR_CODE_ALPHABET, PAIR_CODE_LENGTH } from "@gottawatch/contract";

export type TokenKind = "device" | "profile";
const PREFIX: Record<TokenKind, string> = { device: "wcd_", profile: "wcp_" };

/** 32 random bytes, base64url, with a kind prefix (spec §6). Only the hash is ever stored. */
export function newToken(kind: TokenKind): string {
  return PREFIX[kind] + randomBytes(32).toString("base64url");
}

export function tokenKindOf(token: string): TokenKind | undefined {
  if (token.startsWith(PREFIX.device)) return "device";
  if (token.startsWith(PREFIX.profile)) return "profile";
  return undefined;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newPairCode(): string {
  let code = "";
  for (let i = 0; i < PAIR_CODE_LENGTH; i++) {
    code += PAIR_CODE_ALPHABET[randomInt(PAIR_CODE_ALPHABET.length)];
  }
  return code;
}

/** Time-sortable id: 9 base36 chars of epoch ms + 8 hex random chars. */
export function newRecId(now: Date): string {
  return now.getTime().toString(36).padStart(9, "0") + randomBytes(4).toString("hex");
}

/** Smallest rec id that could have been created at `t` (for SK range queries). */
export function recIdLowerBound(t: Date): string {
  return t.getTime().toString(36).padStart(9, "0");
}
