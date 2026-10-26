// HTTP → handler adapter shared by the single-origin server (server/main.ts) and the offline demo
// server (scripts/local-demo-server.ts). It turns a plain Node request into the API Gateway-shaped
// event the route handlers already understand, runs the bearer-token authorizer, and dispatches.
import type { AppDeps } from "../lib/deps.js";
import type { Store } from "../lib/store.js";
import { makeAppHandler, makeAskHandler, makePairHandler, makeTonightHandler } from "../handlers/routes.js";
import { makeAuthorizer } from "../handlers/authorizer.js";

export const PUBLIC_ROUTES = new Set(["POST /pair/start", "GET /pair/status", "GET /auth/config", "POST /auth/email/start", "POST /auth/email/verify", "POST /invites/preview"]);
const PAIR_ROUTES = new Set([...PUBLIC_ROUTES, "POST /pair/complete"]);
export const ROUTES = [
  "POST /pair/start", "GET /pair/status", "POST /pair/complete", "GET /auth/config", "POST /auth/email/start", "POST /auth/email/verify",
  "POST /invites/preview", "GET /invites", "POST /invites", "DELETE /invites/{id}", "POST /invites/accept", "DELETE /friends/{id}", "GET /me", "GET /feed",
  "GET /friends", "GET /titles/search", "GET /titles/{mediaType}/{id}", "POST /recommendations", "POST /recommendations/{id}/seen", "DELETE /recommendations/{id}/seen",
  "GET /me/feed", "GET /me/seen", "POST /me/seen/{id}", "DELETE /me/seen/{id}", "GET /me/sent", "GET /me/home", "DELETE /me/home/tvs/{id}", "GET /seen", "GET /tonight",
  "POST /me/email", "POST /me/email/verify", "POST /ask",
] as const;

export function matchRoute(method: string, path: string): { rk: string; params: Record<string, string> } | undefined {
  const b = path.split("/");
  for (const rk of ROUTES) {
    const [m, tpl] = rk.split(" ") as [string, string];
    if (m !== method) continue;
    const a = tpl.split("/");
    if (a.length !== b.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < a.length && ok; i++) {
      const seg = a[i]!;
      if (seg.startsWith("{")) {
        try {
          params[seg.slice(1, -1)] = decodeURIComponent(b[i]!);
        } catch {
          ok = false;
        }
        ok = ok && b[i] !== "";
      } else ok = seg === b[i];
    }
    if (ok) return { rk, params };
  }
}

/** True when `method path` could be an API call (used to keep API 404s JSON, not the SPA shell). */
export const isApiPath = (path: string) => ROUTES.some((rk) => {
  const first = rk.split(" ")[1]!.split("/")[1];
  return path === `/${first}` || path.startsWith(`/${first}/`);
});

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | string[] | undefined>;
  body?: string;
}
export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const json = (status: number, body: unknown): ApiResponse => ({ status, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });

export function makeApiDispatcher(getDeps: () => AppDeps, getStore: () => Store) {
  const app = makeAppHandler(getDeps), pair = makePairHandler(getDeps), tonight = makeTonightHandler(getDeps), ask = makeAskHandler(getDeps);
  const authz = makeAuthorizer(getStore);
  return async (req: ApiRequest): Promise<ApiResponse | undefined> => {
    const m = matchRoute(req.method, req.path);
    if (!m) return undefined;
    const authHeader = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
    let lambda: unknown;
    if (!PUBLIC_ROUTES.has(m.rk) || authHeader) {
      const r = await authz({ headers: { authorization: authHeader } } as never);
      if (!r.isAuthorized && !PUBLIC_ROUTES.has(m.rk)) return json(403, { message: "Forbidden" });
      lambda = r.isAuthorized ? r.context : undefined;
    }
    const event = {
      routeKey: m.rk,
      rawPath: req.path,
      body: req.body || undefined,
      isBase64Encoded: false,
      queryStringParameters: Object.fromEntries(req.query),
      pathParameters: m.params,
      requestContext: { authorizer: lambda ? { lambda } : undefined },
      headers: req.headers,
    };
    const h = m.rk === "GET /tonight" ? tonight : m.rk === "POST /ask" ? ask : PAIR_ROUTES.has(m.rk) ? pair : app;
    const out = (await h(event as never)) as { statusCode: number; body?: string; headers?: Record<string, string> };
    return { status: out.statusCode, headers: { "content-type": "application/json; charset=utf-8", ...(out.headers ?? {}) }, body: out.body ?? "" };
  };
}
