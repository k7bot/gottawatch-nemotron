import { beforeEach, describe, expect, it } from "vitest";
import { PairStartResponse, PairStatusResponse } from "@gottawatch/contract";
import { makePairHandler } from "../src/handlers/routes.js";
import { makeAuthorizer } from "../src/handlers/authorizer.js";
import { body, event, profileAuth, world } from "./helpers.js";

const DEVICE = "tvA1b2C3d4E5f6G7h8I9j0K1";

describe("pairing (flow A)", () => {
  let w: ReturnType<typeof world>;
  let pair: ReturnType<typeof makePairHandler>;
  beforeEach(() => {
    w = world();
    pair = makePairHandler(() => w.deps);
  });

  async function start(deviceId = DEVICE) {
    const r = await pair(event("POST /pair/start", { body: { deviceId } }));
    expect(r.statusCode).toBe(200);
    return PairStartResponse.parse(body(r));
  }
  const status = (code: string, deviceId = DEVICE) =>
    pair(event("GET /pair/status", { query: { code, deviceId } }));
  const complete = (code: string) => pair(event("POST /pair/complete", { body: { code }, auth: profileAuth() }));

  it("start → pending → complete → token once → code gone", async () => {
    const { code, expiresAt } = await start();
    expect(new Date(expiresAt).getTime() - w.clock.t.getTime()).toBe(10 * 60 * 1000);
    expect(body(await status(code))).toEqual({ status: "pending" });

    const c = await complete(code);
    expect(c.statusCode).toBe(200);
    expect(body(c)).toEqual({ ok: true, householdId: "hh-kiran" });

    const s = PairStatusResponse.parse(body(await status(code)));
    expect(s.status).toBe("paired");
    const token = s.status === "paired" ? s.deviceToken : "";
    // token is never stored in plaintext
    expect(JSON.stringify([...w.store.tokens.values(), ...w.store.devices.values()])).not.toContain(token);

    // second collection fails: one-time delivery
    expect((await status(code)).statusCode).toBe(404);

    const authz = makeAuthorizer(() => w.store);
    const ok = await authz({ headers: { authorization: `Bearer ${token}` } } as never);
    expect(ok).toEqual({
      isAuthorized: true,
      context: { kind: "device", subjectId: DEVICE, householdId: "hh-kiran" },
    });
  });

  it("only the requesting TV can collect the token", async () => {
    const { code } = await start();
    await complete(code);
    expect((await status(code, "tvZ9y8X7w6V5u4T3s2R1q0P9")).statusCode).toBe(404);
    expect(body(await status(code)).status).toBe("paired");
  });

  it("expired codes are rejected even before DynamoDB TTL deletes them", async () => {
    const { code } = await start();
    w.clock.advance(10 * 60 * 1000 + 1);
    const r = await complete(code);
    expect(r.statusCode).toBe(410);
    expect(body(r).error.code).toBe("expired");
    expect((await status(code)).statusCode).toBe(410);
  });

  it("a code can't be completed twice", async () => {
    const { code } = await start();
    await complete(code);
    expect((await complete(code)).statusCode).toBe(409);
  });

  it("unknown code and bad input", async () => {
    expect((await complete("ABCDEF")).statusCode).toBe(404);
    expect((await pair(event("POST /pair/start", { body: { deviceId: "x" } }))).statusCode).toBe(400);
    expect((await status("abc")).statusCode).toBe(400);
  });

  it("complete needs a profile token, not a device token", async () => {
    const { code } = await start();
    const r = await pair(
      event("POST /pair/complete", {
        body: { code },
        auth: { kind: "device", subjectId: DEVICE, householdId: "hh-kiran" },
      }),
    );
    expect(r.statusCode).toBe(403);
  });

  it("re-pairing the same TV revokes the previous token", async () => {
    const authz = makeAuthorizer(() => w.store);
    const pairOnce = async () => {
      const { code } = await start();
      await complete(code);
      return body(await status(code)).deviceToken as string;
    };
    const first = await pairOnce();
    const second = await pairOnce();
    expect(first).not.toEqual(second);
    expect((await authz({ headers: { authorization: `Bearer ${first}` } } as never)).isAuthorized).toBe(false);
    expect((await authz({ headers: { authorization: `Bearer ${second}` } } as never)).isAuthorized).toBe(true);
  });

  it("retries on code collisions", async () => {
    const codes = ["AAAAAA", "AAAAAA", "BBBBBB"];
    w.deps = { ...w.deps };
    const p = makePairHandler(() => ({ ...w.deps, genCode: () => codes.shift()! }) as never);
    const a = body(await p(event("POST /pair/start", { body: { deviceId: DEVICE } })));
    const b = body(await p(event("POST /pair/start", { body: { deviceId: DEVICE } })));
    expect([a.code, b.code]).toEqual(["AAAAAA", "BBBBBB"]);
  });
});
