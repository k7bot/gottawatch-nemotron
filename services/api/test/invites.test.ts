import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAppHandler, makePairHandler } from "../src/handlers/routes.js";
import { authorizeHeader } from "../src/domain/authorize.js";
import { body, event, profileAuth, world } from "./helpers.js";

vi.useFakeTimers({ toFake: ["setTimeout"] });

describe("friend invites (ADR-0015)", () => {
  let w: ReturnType<typeof world>;
  let sent: { to: string; subject: string; text: string; html?: string }[];
  let pair: ReturnType<typeof makePairHandler>;
  let app: ReturnType<typeof makeAppHandler>;
  const run = async <T,>(p: Promise<T>) => {
    await vi.advanceTimersByTimeAsync(1000);
    return p;
  };
  beforeEach(() => {
    w = world();
    sent = [];
    w.deps.mailer = { send: async (to, subject, text, html) => void sent.push({ to, subject, text, html }) };
    w.deps.webOrigin = "https://web.example";
    // Ana: a separate account, not connected to Kiran.
    w.store.households.set("hh-ana", { id: "hh-ana", name: "Ana's home", timezone: "America/New_York" });
    w.store.users.set("u-ana", { id: "u-ana", displayName: "Ana", householdId: "hh-ana" });
    pair = makePairHandler(() => w.deps);
    app = makeAppHandler(() => w.deps);
  });
  const create = async (b: unknown = {}, who = "u-kiran") => app(event("POST /invites", { auth: profileAuth(who), body: b }));
  const accept = (code: string, who = "u-ana", hh = "hh-ana") => app(event("POST /invites/accept", { auth: profileAuth(who, hh), body: { code } }));

  it("link invite → preview → accept connects both ways → each can recommend to the other", async () => {
    const r = body(await create());
    expect(r.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(body(await pair(event("POST /invites/preview", { body: { code: r.code } })))).toMatchObject({ status: "valid", inviter: { displayName: "Kiran" } });
    expect(body(await accept(r.code))).toMatchObject({ already: false, friend: { id: "u-kiran", householdId: "hh-kiran" } });
    expect(await w.store.listFriendIds("u-ana")).toContain("u-kiran");
    expect(await w.store.listFriendIds("u-kiran")).toContain("u-ana");
    const rec = (who: string, hh: string, to: string) =>
      app(event("POST /recommendations", { auth: profileAuth(who, hh), body: { titleRef: { source: "demo", id: "kestrel-bay" }, recipientHouseholdIds: [to] } }));
    expect((await rec("u-ana", "hh-ana", "hh-kiran")).statusCode).toBe(200);
    expect((await rec("u-kiran", "hh-kiran", "hh-ana")).statusCode).toBe(200);
    // single use
    expect((await accept(r.code, "u-sam", "hh-sam")).statusCode).toBe(410);
    expect(body(await pair(event("POST /invites/preview", { body: { code: r.code } })))).toEqual({ status: "gone" });
    expect(body(await app(event("GET /invites", { auth: profileAuth() }))).invites).toEqual([]);
  });

  it("email invite: one email, same copy for any address, masked in the pending list, link in body", async () => {
    const r = body(await create({ email: "Ana.Smith@Example.com" }));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("Kiran sent you a Gottawatch invitation");
    expect(sent[0]!.html).toContain("Kiran invited you to connect on Gottawatch");
    expect(sent[0]!.html).toContain("Accept invitation");
    expect(sent[0]!.text).toContain(`https://web.example/invite/${r.code}`);
    expect(sent[0]!.html).toContain("Accept invitation");
    const list = body(await app(event("GET /invites", { auth: profileAuth() }))).invites;
    expect(list).toHaveLength(1);
    expect(list[0].to).toBe("an•••@example.com");
    expect(JSON.stringify(w.store.invites)).not.toContain("ana.smith");
  });

  it("cancel, expiry, own invite, already connected", async () => {
    const a = body(await create());
    expect((await app(event("DELETE /invites/{id}", { auth: profileAuth(), path: { id: a.invite.id } }))).statusCode).toBe(200);
    expect((await accept(a.code)).statusCode).toBe(410);

    const b = body(await create());
    w.clock.advance(7 * 86400e3 + 1);
    expect((await accept(b.code)).statusCode).toBe(410);

    const c = body(await create());
    expect((await accept(c.code, "u-kiran", "hh-kiran")).statusCode).toBe(409);
    const d = body(await accept(c.code, "u-priya", "hh-priya"));
    expect(d.already).toBe(true);
    expect(body(await pair(event("POST /invites/preview", { body: { code: c.code } }))).status).toBe("valid"); // not consumed
  });

  it("rate limit: 20 invite emails a day", async () => {
    for (let i = 0; i < 20; i++) {
      const r = await create({ email: `t${i}@example.com` });
      expect(r.statusCode).toBe(200);
      await app(event("DELETE /invites/{id}", { auth: profileAuth(), path: { id: body(r).invite.id } }));
    }
    expect((await create({ email: "t21@example.com" })).statusCode).toBe(409);
    expect((await create()).statusCode).toBe(200); // links still work
  });

  it("remove connection is mutual, leaves other friends, and is safe to repeat", async () => {
    expect(await w.store.listFriendIds("u-kiran")).toEqual(expect.arrayContaining(["u-priya", "u-sam"]));
    expect((await app(event("DELETE /friends/{id}", { auth: profileAuth(), path: { id: "u-priya" } }))).statusCode).toBe(200);
    expect(await w.store.listFriendIds("u-kiran")).not.toContain("u-priya");
    expect(await w.store.listFriendIds("u-priya")).not.toContain("u-kiran");
    expect(await w.store.listFriendIds("u-kiran")).toContain("u-sam");
    expect((await app(event("DELETE /friends/{id}", { auth: profileAuth(), path: { id: "u-priya" } }))).statusCode).toBe(200);
  });

  it("remove friend drops both directions and blocks recommending", async () => {
    expect((await app(event("DELETE /friends/{id}", { auth: profileAuth(), path: { id: "u-priya" } }))).statusCode).toBe(200);
    expect(await w.store.listFriendIds("u-priya")).not.toContain("u-kiran");
    const r = await app(event("POST /recommendations", { auth: profileAuth(), body: { titleRef: { source: "demo", id: "kestrel-bay" }, recipientHouseholdIds: ["hh-priya"] } }));
    expect(r.statusCode).toBe(403);
  });

  it("sign-up through an invite: new person + home, then accept", async () => {
    const r = body(await create());
    expect(body(await run(pair(event("POST /auth/email/start", { body: { email: "new@example.com", invite: r.code, name: "  Maya  " } }))))).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("join Gottawatch");
    const code = /is (\d{6})/.exec(sent[0]!.text)![1]!;
    const v = body(await pair(event("POST /auth/email/verify", { body: { email: "new@example.com", code } })));
    const ctx = (await authorizeHeader(w.store, `Bearer ${v.profileToken}`))!;
    const meR = body(await app(event("GET /me", { auth: ctx })));
    expect(meR.user.displayName).toBe("Maya");
    expect(meR.email).toBe("new@example.com");
    expect(body(await accept(r.code, ctx.subjectId, ctx.householdId)).already).toBe(false);
    expect(body(await app(event("GET /friends", { auth: ctx }))).friends.map((f: { displayName: string }) => f.displayName)).toEqual(["Kiran"]);
  });

  it("sign-up needs a live invite and a name; answer is the same either way", async () => {
    expect(body(await run(pair(event("POST /auth/email/start", { body: { email: "x@example.com", name: "X" } }))))).toEqual({ ok: true });
    expect(body(await run(pair(event("POST /auth/email/start", { body: { email: "x@example.com", invite: "A".repeat(22), name: "X" } }))))).toEqual({ ok: true });
    const r = body(await create());
    expect(body(await run(pair(event("POST /auth/email/start", { body: { email: "x@example.com", invite: r.code } }))))).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
  });
});
