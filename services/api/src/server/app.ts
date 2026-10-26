// The single-origin Gottawatch server: API + phone PWA (/) + TV browser view (/tv/) from one Node
// process, so the Nebius deployment is one container behind one HTTPS endpoint with no CORS.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiRequest, ApiResponse } from "./router.js";
import { isApiPath, matchRoute } from "./router.js";
import type { StaticSite } from "./static.js";

export const MAX_BODY_BYTES = 64 * 1024;

// One policy for both apps. 'unsafe-inline' styles: React/react-native-web set inline styles.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://image.tmdb.org",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": CSP,
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
};

export interface ServerOptions {
  api: (req: ApiRequest) => Promise<ApiResponse | undefined>;
  web?: StaticSite;
  tv?: StaticSite;
  /** Liveness/readiness details for GET /healthz (no secrets). */
  health?: () => Record<string, unknown>;
  log?: (line: string) => void;
}

/** Profile links are /u/<token>; never let a token reach the logs. */
export const redactPath = (p: string) => p.replace(/^\/u\/[^/?#]+/, "/u/[redacted]").replace(/^\/invite\/[^/?#]+/, "/invite/[redacted]");

const jsonError = (status: number, code: string, message: string) => JSON.stringify({ error: { code, message } });

async function readBody(req: IncomingMessage): Promise<string | "too_large"> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY_BYTES) return "too_large";
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createRequestListener(o: ServerOptions) {
  const log = o.log ?? (() => {});
  return async (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    const method = req.method ?? "GET";
    let path = "/";
    let status = 500;
    const send = (s: number, headers: Record<string, string>, body: string | Buffer) => {
      status = s;
      res.writeHead(s, { ...SECURITY_HEADERS, ...headers });
      res.end(method === "HEAD" ? undefined : body);
    };
    try {
      const url = new URL(req.url ?? "/", "http://local");
      path = url.pathname;
      if (path === "/healthz" && (method === "GET" || method === "HEAD")) {
        return send(200, { "content-type": "application/json", "cache-control": "no-store" }, JSON.stringify({ ok: true, ...(o.health?.() ?? {}) }));
      }
      if (matchRoute(method, path)) {
        const body = method === "GET" || method === "HEAD" ? "" : await readBody(req);
        if (body === "too_large") return send(413, { "content-type": "application/json" }, jsonError(413, "bad_request", "Request body too large"));
        const out = await o.api({ method, path, query: url.searchParams, headers: req.headers, body });
        if (out) return send(out.status, { ...out.headers, "cache-control": "no-store" }, out.body);
      }
      if (method === "GET" || method === "HEAD") {
        const enc = String(req.headers["accept-encoding"] ?? "");
        const wantsHtml = String(req.headers.accept ?? "").includes("text/html");
        if (path === "/tv") return send(308, { location: "/tv/" }, "");
        const site = path.startsWith("/tv/") ? o.tv : o.web;
        // API-looking paths answer JSON 404s to fetches, but a browser navigating to /pair gets the PWA.
        if (site && (wantsHtml || !isApiPath(path))) {
          const f = await site.serve(path, enc);
          if (f) return send(f.status, f.headers, f.body);
        }
      }
      if (method === "OPTIONS") return send(204, { allow: "GET, POST, DELETE, OPTIONS" }, "");
      return send(404, { "content-type": "application/json" }, jsonError(404, "not_found", "Not found"));
    } catch (e) {
      log(`error ${method} ${redactPath(path)}: ${e instanceof Error ? e.message : String(e)}`);
      if (!res.headersSent) send(500, { "content-type": "application/json" }, jsonError(500, "internal", "Something went wrong"));
      else res.end();
    } finally {
      if (path !== "/healthz") log(`${method} ${redactPath(path)} ${status} ${Date.now() - started}ms`);
    }
  };
}
