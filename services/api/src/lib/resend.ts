// Resend HTTP mailer (EMAIL_MODE=resend): sends sign-in codes via https://api.resend.com/emails with
// plain fetch (no SDK). The API key lives only in AWS Secrets Manager (secret name in RESEND_SECRET_NAME,
// plaintext value); it is read once per cold start and never logged. Never logs addresses or codes.
// Free plan: 100 emails/day. See docs/ops/resend-email.md, ADR-0014 addendum.
import type { Mailer } from "./deps.js";

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

export function resendMailer(
  from: string,
  getApiKey: () => Promise<string>,
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
  fromName = "Gottawatch",
): Mailer {
  let key: Promise<string> | undefined;
  const get = () => {
    key ??= getApiKey();
    key.catch(() => (key = undefined));
    return key;
  };
  return {
    async send(to, subject, text, html) {
      const k = await get();
      const r = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${fromName} <${from}>`, to: [to], subject, text, ...(html ? { html } : {}) }),
      });
      // Status only: the response body may echo the recipient.
      if (!r.ok) throw new Error(`Resend send failed: HTTP ${r.status}`);
    },
  };
}
