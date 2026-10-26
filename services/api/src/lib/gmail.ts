// Gmail SMTP mailer (EMAIL_MODE=gmail): sends sign-in codes from Kiran's Gmail with an app password
// instead of waiting on SES production access. The app password lives only in AWS Secrets Manager
// (secret name in GMAIL_SECRET_NAME, plain string value); it is read once per cold start and never logged.
// Gmail caps this at roughly 500 messages/day, far above hackathon volume. Never logs addresses.
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import nodemailer from "nodemailer";
import type { Mailer } from "./deps.js";

export interface SmtpTransport {
  sendMail(msg: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}
export type TransportFactory = (user: string, pass: string) => SmtpTransport;

export const gmailTransport: TransportFactory = (user, pass) =>
  nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });

export function secretFetcher(name: string, client = new SecretsManagerClient({})): () => Promise<string> {
  return async () => {
    const r = await client.send(new GetSecretValueCommand({ SecretId: name }));
    // Gmail shows app passwords in groups of four ("abcd efgh ijkl mnop"); spaces are not part of it.
    const pass = (r.SecretString ?? "").replace(/\s+/g, "");
    if (!pass) throw new Error("Email secret is empty");
    return pass;
  };
}

export function gmailMailer(
  user: string,
  getPassword: () => Promise<string>,
  makeTransport: TransportFactory = gmailTransport,
  fromName = "Gottawatch",
): Mailer {
  let transport: Promise<SmtpTransport> | undefined;
  const get = () => {
    transport ??= getPassword().then((pass) => makeTransport(user, pass));
    // A failed secret read shouldn't stick for the life of the container.
    transport.catch(() => (transport = undefined));
    return transport;
  };
  return {
    async send(to, subject, text, html) {
      const t = await get();
      await t.sendMail({ from: `"${fromName}" <${user}>`, to, subject, text, ...(html ? { html } : {}) });
    },
  };
}
