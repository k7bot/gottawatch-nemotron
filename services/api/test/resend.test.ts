import { describe, expect, it } from "vitest";
import { resendMailer, type FetchLike } from "../src/lib/resend.js";
import { mailerFromEnv } from "../src/lib/deps.js";

describe("Resend mailer (EMAIL_MODE=resend)", () => {
  it("reads the key once and POSTs to the Resend API as Gottawatch", async () => {
    let reads = 0;
    const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
    const f: FetchLike = async (url, init) => (calls.push({ url, init }), { ok: true, status: 200 });
    const m = resendMailer("login@example.com", async () => (reads++, "re_key"), f);
    await m.send("a@example.com", "Your code", "Your code is 123456");
    await m.send("b@example.com", "Your code", "Your code is 654321");
    expect(reads).toBe(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers.Authorization).toBe("Bearer re_key");
    expect(JSON.parse(calls[0]!.init.body)).toEqual({
      from: "Gottawatch <login@example.com>",
      to: ["a@example.com"],
      subject: "Your code",
      text: "Your code is 123456",
    });
  });

  it("throws on non-2xx without leaking the address, and retries a failed key read", async () => {
    const bad = resendMailer("x@y.z", async () => "k", async () => ({ ok: false, status: 422 }));
    const err = await bad.send("secret@example.com", "s", "t").catch((e: Error) => e);
    expect(String(err)).toContain("HTTP 422");
    expect(String(err)).not.toContain("secret@example.com");
    let n = 0;
    const m = resendMailer("x@y.z", async () => { if (++n === 1) throw new Error("nope"); return "k"; }, async () => ({ ok: true, status: 200 }));
    await expect(m.send("a@example.com", "s", "t")).rejects.toThrow("nope");
    await expect(m.send("a@example.com", "s", "t")).resolves.toBeUndefined();
  });

  it("mailerFromEnv: resend needs from + secret", () => {
    expect(() => mailerFromEnv({ EMAIL_MODE: "resend", RESEND_FROM: "a@b.c" })).toThrow(/RESEND_SECRET_NAME/);
    expect(mailerFromEnv({ EMAIL_MODE: "resend", RESEND_FROM: "a@b.c", RESEND_SECRET_NAME: "s" })).toBeDefined();
  });
});
