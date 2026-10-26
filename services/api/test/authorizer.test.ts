import { afterEach, describe, expect, it, vi } from "vitest";
import { makeAuthorizer } from "../src/handlers/authorizer.js";
import { makeAppHandler } from "../src/handlers/routes.js";
import { MemoryStore } from "../src/lib/store.js";
import { deviceAuth, event, profileToken, world } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("authorizer failure modes (review MF-1) and log hygiene", () => {
  it("store errors are rethrown (→ API Gateway 500, not a cached 403 deny)", async () => {
    const broken = new MemoryStore();
    broken.getToken = async () => {
      throw Object.assign(new Error("ProvisionedThroughputExceededException"), { name: "ThrottlingException" });
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const authz = makeAuthorizer(() => broken);
    const token = "wcp_" + "a".repeat(43);
    await expect(authz({ headers: { authorization: `Bearer ${token}` } } as never)).rejects.toThrow();
    // never logs the token
    expect(JSON.stringify(errors.mock.calls)).not.toContain(token);
    expect(JSON.stringify(errors.mock.calls)).toContain("ThrottlingException");
  });

  it("unknown/malformed tokens are still a plain deny (no store call for malformed)", async () => {
    const w = world();
    const spy = vi.spyOn(w.store, "getToken");
    const authz = makeAuthorizer(() => w.store);
    expect(await authz({ headers: { authorization: "Bearer garbage" } } as never)).toEqual({ isAuthorized: false });
    expect(spy).not.toHaveBeenCalled();
    expect(await authz({ headers: { authorization: "Bearer wcd_unknown" } } as never)).toEqual({ isAuthorized: false });
  });

  it("valid profile token is not written to any log during a request", async () => {
    const w = world();
    const tok = await profileToken(w.store, "u-kiran");
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "info")];
    logs.forEach((s) => s.mockImplementation(() => {}));
    const authz = makeAuthorizer(() => w.store);
    await authz({ headers: { authorization: `Bearer ${tok}` } } as never);
    // a handler that blows up must not log the event (which would include the header)
    w.store.listRecs = async () => {
      throw new Error("boom");
    };
    const app = makeAppHandler(() => w.deps);
    const ev = event("GET /feed", { auth: deviceAuth() });
    (ev as unknown as { headers: Record<string, string> }).headers = { authorization: `Bearer ${tok}` };
    const r = await app(ev);
    expect(r.statusCode).toBe(500);
    for (const s of logs) expect(JSON.stringify(s.mock.calls)).not.toContain(tok);
  });

  it("204 responses carry no content-type and an empty body (review MF-3)", async () => {
    const { json } = await import("../src/lib/http.js");
    const r = json(204);
    expect(r.body).toBe("");
    expect(r.headers).not.toHaveProperty("content-type");
  });
});
