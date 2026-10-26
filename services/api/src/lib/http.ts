import type {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import type { ZodType } from "zod";
import type { ErrorCode } from "@gottawatch/contract";
import type { TokenKind } from "./tokens.js";

export interface AuthContext {
  kind: TokenKind;
  subjectId: string;
  householdId: string;
}
export type ApiEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;
export type ApiResult = APIGatewayProxyStructuredResultV2;

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  expired: 410,
  rate_limited: 429,
  internal: 500,
};

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

export function json(statusCode: number, body?: unknown): ApiResult {
  if (body === undefined) {
    // e.g. 204: no content-type, so clients don't try to parse an empty body (review MF-3).
    return { statusCode, headers: { "cache-control": "no-store" }, body: "" };
  }
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new ApiError("bad_request", msg);
  }
  return r.data;
}

export function jsonBody(event: ApiEvent): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError("bad_request", "Body must be JSON");
  }
}

export function auth(event: ApiEvent, kind?: TokenKind): AuthContext {
  const ctx = event.requestContext.authorizer?.lambda;
  if (!ctx) throw new ApiError("unauthorized", "Missing credentials");
  if (kind && ctx.kind !== kind) throw new ApiError("forbidden", `This route needs a ${kind} token`);
  return ctx;
}

/** Wraps a handler body: maps ApiError to the contract error body; hides other errors. */
export function wrap(fn: (event: ApiEvent) => Promise<ApiResult>) {
  return async (event: ApiEvent): Promise<ApiResult> => {
    try {
      return await fn(event);
    } catch (e) {
      if (e instanceof ApiError) {
        return json(STATUS[e.code], { error: { code: e.code, message: e.message } });
      }
      // Log the error only (never the event: it carries the Authorization header).
      const err = e as { name?: string; message?: string; stack?: string };
      console.error("unhandled", { name: err?.name, message: err?.message, stack: err?.stack });
      return json(500, { error: { code: "internal", message: "Something went wrong" } });
    }
  };
}
