// Builds production dependencies from environment variables (spec §4).
import type { Picker } from "../domain/tonight.js";
import { stubPicker } from "../domain/tonight.js";
import { makeBedrockPicker } from "../domain/bedrockPicker.js";
import { sdkConverse } from "./bedrock.js";
import { DynamoStore } from "./dynamoStore.js";
import type { Store } from "./store.js";
import { systemClock, type Clock } from "./time.js";
import { sesMailer } from "./ses.js";
import { gmailMailer, secretFetcher } from "./gmail.js";
import { resendMailer } from "./resend.js";
import { demoCatalog, type Catalog } from "../catalog/index.js";
import { tmdbCatalog, tmdbFetcher } from "../catalog/tmdb.js";
import { ssmFetcher } from "./ssm.js";

export interface AppDeps {
  store: Store;
  clock: Clock;
  picker: Picker;
  /** Email sign-in (ADR-0013 amendment). Undefined = EMAIL_MODE=off. */
  mailer?: Mailer;
  /** PWA origin for invite links (ADR-0015), e.g. https://app.example.com */
  webOrigin?: string;
  /** Title catalog (CATALOG_MODE). Undefined = demo (made-up titles). */
  catalog?: Catalog;
}
export interface Mailer {
  send(to: string, subject: string, text: string, html?: string): Promise<void>;
}

export function pickerFromEnv(env: NodeJS.ProcessEnv = process.env): Picker {
  const mode = env.PICK_MODE ?? "stub";
  if (mode === "stub") return stubPicker;
  if (mode === "bedrock") {
    if (!env.BEDROCK_MODEL_ID) throw new Error("PICK_MODE=bedrock needs BEDROCK_MODEL_ID");
    return makeBedrockPicker(sdkConverse(), env.BEDROCK_MODEL_ID);
  }
  throw new Error(`Unknown PICK_MODE: ${mode}`);
}

let cached: AppDeps | undefined;
export function depsFromEnv(): AppDeps {
  if (!cached) {
    const table = process.env.TABLE_NAME;
    if (!table) throw new Error("TABLE_NAME is not set");
    const store = new DynamoStore(table);
    cached = { store, catalog: catalogFromEnv(store), clock: systemClock, picker: pickerFromEnv(), mailer: mailerFromEnv(), webOrigin: process.env.WEB_ORIGIN };
  }
  return cached;
}

export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer | undefined {
  const mode = env.EMAIL_MODE ?? "off";
  if (mode === "off") return undefined;
  if (mode === "ses") {
    const from = env.EMAIL_FROM;
    if (!from) throw new Error("EMAIL_MODE=ses needs EMAIL_FROM");
    return sesMailer(from);
  }
  if (mode === "gmail") {
    const user = env.GMAIL_USER;
    const secret = env.GMAIL_SECRET_NAME;
    if (!user || !secret) throw new Error("EMAIL_MODE=gmail needs GMAIL_USER and GMAIL_SECRET_NAME");
    return gmailMailer(user, secretFetcher(secret));
  }
  if (mode === "resend") {
    const from = env.RESEND_FROM;
    const secret = env.RESEND_SECRET_NAME;
    if (!from || !secret) throw new Error("EMAIL_MODE=resend needs RESEND_FROM and RESEND_SECRET_NAME");
    return resendMailer(from, secretFetcher(secret));
  }
  throw new Error(`Unknown EMAIL_MODE: ${mode}`);
}

/** CATALOG_MODE=demo (default; made-up titles, safe for the demo video) or tmdb (needs TMDB_PARAM_NAME). */
export function catalogFromEnv(store: Store, env: NodeJS.ProcessEnv = process.env): Catalog {
  const mode = env.CATALOG_MODE ?? "demo";
  if (mode === "demo") return demoCatalog;
  if (mode === "tmdb") {
    if (!env.TMDB_PARAM_NAME) throw new Error("CATALOG_MODE=tmdb needs TMDB_PARAM_NAME");
    return tmdbCatalog(tmdbFetcher(ssmFetcher(env.TMDB_PARAM_NAME)), store);
  }
  throw new Error(`Unknown CATALOG_MODE: ${mode}`);
}
