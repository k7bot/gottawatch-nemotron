import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAppHandler, makePairHandler } from "../src/handlers/routes.js";
import { authorizeHeader } from "../src/domain/authorize.js";
import { body, event, profileAuth, world } from "./helpers.js";

vi.useFakeTimers({ toFake: ["setTimeout"] });

describe("email sign-in (ADR-0013 amendment, ES-1..7)", () => {
  let w: ReturnType<typeof world>;
  let sent: { to: string; text: string }[];
  let pair: ReturnType<typeof makePairHandler>;
  let app: ReturnType<typeof makeAppHandler>;
  const code = () => /is (\d{6})/.exec(sent[sent.length - 1]!.text)![1]!;
  const run = async <T,>(p: Promise<T>) => {
    await vi.advanceTimersByTimeAsync(1000);
    return p;
  };
  beforeEach(() => {
    w = world();
    sent = [];
    w.deps.mailer = { send: async (to, _s, text) => void sent.push({ to, text }) };
    pair = makePairHandler(() => w.deps);
    app = makeAppHandler(() => w.deps);
  });
  const addEmail = async (email = "Kiran@Example.com ") => {
    expect((await app(event("POST /me/email", { auth: profileAuth(), body: { email } }))).statusCode).toBe(200);
    return app(event("POST /me/email/verify", { auth: profileAuth(), body: { email, code: code() } }));
  };

  it("config reflects EMAIL_MODE", async () => {
    expect(body(await pair(event("GET /auth/config")))).toEqual({ email: true });
    delete w.deps.mailer;
    expect(body(await pair(event("GET /auth/config")))).toEqual({ email: false });
  });

  it("verified email persists and GET /me returns it (Me tab reload)", async () => {
    await addEmail();
    expect(body(await app(event("GET /me", { auth: profileAuth() })))).toMatchObject({ kind: "profile", email: "kiran@example.com" });
  });

  it("add email → sign in on another phone with a 90-day token", async () => {
    const r = await addEmail();
    expect(body(r)).toEqual({ ok: true, email: "kiran@example.com" });
    const s = await run(pair(event("POST /auth/email/start", { body: { email: "kiran@example.com" } })));
    expect(body(s)).toEqual({ ok: true });
    expect(sent).toHaveLength(2);
    const v = await pair(event("POST /auth/email/verify", { body: { email: "KIRAN@example.com", code: code() } }));
    const tok = body(v).profileToken as string;
    expect(tok.startsWith("wcp_")).toBe(true);
    const ctx = await authorizeHeader(w.store, `Bearer ${tok}`);
    expect(ctx?.subjectId).toBe("u-kiran");
    // single use
    expect((await pair(event("POST /auth/email/verify", { body: { email: "kiran@example.com", code: code() } }))).statusCode).toBe(400);
  });

  it("unknown email: same answer, no mail (ES-1)", async () => {
    const s = await run(pair(event("POST /auth/email/start", { body: { email: "nobody@example.com" } })));
    expect(s.statusCode).toBe(200);
    expect(body(s)).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
  });

  it("5 wrong tries burn the code (ES-2) and sends are capped at 3 / 15 min", async () => {
    await addEmail();
    await run(pair(event("POST /auth/email/start", { body: { email: "kiran@example.com" } })));
    const good = code();
    const wrong = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await pair(event("POST /auth/email/verify", { body: { email: "kiran@example.com", code: wrong } }))).statusCode).toBe(400);
    expect((await pair(event("POST /auth/email/verify", { body: { email: "kiran@example.com", code: good } }))).statusCode).toBe(400);
    for (let i = 0; i < 4; i++) await run(pair(event("POST /auth/email/start", { body: { email: "kiran@example.com" } })));
    expect(sent.filter((x) => x.to === "kiran@example.com")).toHaveLength(1 + 3);
  });

  it("expired codes and expired tokens are rejected (ES-4)", async () => {
    await addEmail();
    await run(pair(event("POST /auth/email/start", { body: { email: "kiran@example.com" } })));
    w.clock.advance(11 * 60 * 1000);
    expect((await pair(event("POST /auth/email/verify", { body: { email: "kiran@example.com", code: code() } }))).statusCode).toBe(400);
    const { hashToken, newToken } = await import("../src/lib/tokens.js");
    const t = newToken("profile");
    await w.store.putToken({ hash: hashToken(t), kind: "profile", subjectId: "u-kiran", householdId: "hh-kiran", expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(await authorizeHeader(w.store, `Bearer ${t}`)).toBeUndefined();
  });

  it("an email owned by someone else can't be claimed (ES-5)", async () => {
    await addEmail("shared@example.com");
    const r = await app(event("POST /me/email", { auth: profileAuth("u-priya", "hh-priya"), body: { email: "shared@example.com" } }));
    expect(r.statusCode).toBe(409);
    expect(r.body).not.toContain("Kiran");
  });

  it("bad addresses get a 400; mail off → 404", async () => {
    expect((await run(pair(event("POST /auth/email/start", { body: { email: "nope" } })))).statusCode).toBe(400);
    delete w.deps.mailer;
    expect((await pair(event("POST /auth/email/start", { body: { email: "a@b.co" } }))).statusCode).toBe(404);
  });
});
