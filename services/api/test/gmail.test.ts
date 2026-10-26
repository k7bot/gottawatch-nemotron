import { describe, expect, it } from "vitest";
import { gmailMailer, type SmtpTransport } from "../src/lib/gmail.js";
import { mailerFromEnv } from "../src/lib/deps.js";

describe("Gmail mailer (EMAIL_MODE=gmail)", () => {
  it("reads the app password once and sends from the Gmail address", async () => {
    let reads = 0;
    const made: { user: string; pass: string }[] = [];
    const sent: unknown[] = [];
    const transport: SmtpTransport = { sendMail: async (m) => void sent.push(m) };
    const m = gmailMailer(
      "sender@example.com",
      async () => (reads++, "apppass"),
      (user, pass) => (made.push({ user, pass }), transport),
    );
    await m.send("a@example.com", "Your code", "Your code is 123456");
    await m.send("b@example.com", "Your code", "Your code is 654321");
    expect(reads).toBe(1);
    expect(made).toEqual([{ user: "sender@example.com", pass: "apppass" }]);
    expect(sent[0]).toEqual({
      from: '"Gottawatch" <sender@example.com>',
      to: "a@example.com",
      subject: "Your code",
      text: "Your code is 123456",
    });
  });

  it("retries the secret read after a failure", async () => {
    let calls = 0;
    const m = gmailMailer(
      "x@example.com",
      async () => {
        calls++;
        if (calls === 1) throw new Error("nope");
        return "p";
      },
      () => ({ sendMail: async () => undefined }),
    );
    await expect(m.send("a@example.com", "s", "t")).rejects.toThrow("nope");
    await expect(m.send("a@example.com", "s", "t")).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it("mailerFromEnv: off by default, gmail needs user + secret, unknown mode throws", () => {
    expect(mailerFromEnv({})).toBeUndefined();
    expect(mailerFromEnv({ EMAIL_MODE: "off" })).toBeUndefined();
    expect(() => mailerFromEnv({ EMAIL_MODE: "gmail", GMAIL_USER: "x@example.com" })).toThrow(/GMAIL_SECRET_NAME/);
    expect(mailerFromEnv({ EMAIL_MODE: "gmail", GMAIL_USER: "x@example.com", GMAIL_SECRET_NAME: "s" })).toBeDefined();
    expect(() => mailerFromEnv({ EMAIL_MODE: "smtp" })).toThrow(/Unknown EMAIL_MODE/);
  });
});
