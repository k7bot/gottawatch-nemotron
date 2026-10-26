// SES v2 mailer (ES-9: IAM allows ses:SendEmail on the configured identity only). Never logs addresses.
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { Mailer } from "./deps.js";

export function sesMailer(from: string, client = new SESv2Client({})): Mailer {
  return {
    async send(to, subject, text) {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [to] },
          Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
        }),
      );
    },
  };
}
