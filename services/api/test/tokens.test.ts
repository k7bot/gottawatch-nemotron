import { describe, expect, it } from "vitest";
import { PairCode } from "@gottawatch/contract";
import { hashToken, newPairCode, newRecId, newToken, recIdLowerBound, tokenKindOf } from "../src/lib/tokens.js";
import { localDate } from "../src/lib/time.js";

describe("tokens + ids", () => {
  it("device/profile tokens carry a prefix and 32 random bytes", () => {
    const t = newToken("device");
    expect(t.startsWith("wcd_")).toBe(true);
    expect(Buffer.from(t.slice(4), "base64url")).toHaveLength(32);
    expect(tokenKindOf(newToken("profile"))).toBe("profile");
    expect(tokenKindOf("abc")).toBeUndefined();
    expect(newToken("device")).not.toEqual(t);
  });
  it("hash is sha256 hex and stable", () => {
    expect(hashToken("x")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("x")).toEqual(hashToken("x"));
  });
  it("pair codes always satisfy the contract", () => {
    for (let i = 0; i < 500; i++) expect(PairCode.safeParse(newPairCode()).success).toBe(true);
  });
  it("rec ids sort by time and lower bound works", () => {
    const a = newRecId(new Date("2026-10-01T00:00:00Z"));
    const b = newRecId(new Date("2026-10-02T00:00:00Z"));
    expect(a < b).toBe(true);
    expect(b >= recIdLowerBound(new Date("2026-10-02T00:00:00Z"))).toBe(true);
    expect(a >= recIdLowerBound(new Date("2026-10-02T00:00:00Z"))).toBe(false);
  });
  it("local date follows the household timezone", () => {
    const t = new Date("2026-10-12T02:30:00Z"); // 10:30pm Sun in New York
    expect(localDate(t, "America/New_York")).toBe("2026-10-11");
    expect(localDate(t, "UTC")).toBe("2026-10-12");
  });
});
