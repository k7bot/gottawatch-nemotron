import { describe, expect, it, vi } from "vitest";
import type { TitleRef } from "@gottawatch/contract";
import { makeAppHandler, makePairHandler } from "../src/handlers/routes.js";
import { applyJudgeSeed, JUDGE_EMAIL, JUDGE_TITLES } from "../src/seed/judge.js";
import { applyReviewSeed } from "../src/seed/appReview.js";
import { applySeed, buildSeed } from "../src/seed/seed.js";
import { body, event, world } from "./helpers.js";

vi.useFakeTimers({ toFake: ["setTimeout"] });
const run = async <T,>(p: Promise<T>) => { await vi.advanceTimersByTimeAsync(1000); return p; };
const titles: Record<string, TitleRef> = Object.fromEntries(
  JUDGE_TITLES.map((t) => [t.key, { source: "tmdb", id: t.id, mediaType: t.mediaType, title: `T-${t.key}`, poster: "https://image.tmdb.org/t/p/w342/x.jpg" } as TitleRef]),
);

describe("judge account", () => {
  it("signs in with the fixed code, has its own friends and TMDB recs, survives other reseeds", async () => {
    const w = world();
    const sent: string[] = [];
    w.deps.mailer = { send: async (to) => void sent.push(to) };
    await applyJudgeSeed(w.store, "135790", titles, w.clock.now());
    await applySeed(w.store, buildSeed({ judges: 1 }, w.clock.now()));
    await applyReviewSeed(w.store, "246810", w.clock.now());
    const pair = makePairHandler(() => w.deps), app = makeAppHandler(() => w.deps);
    await run(pair(event("POST /auth/email/start", { body: { email: JUDGE_EMAIL } })));
    expect(sent).toEqual([]);
    expect((await pair(event("POST /auth/email/verify", { body: { email: JUDGE_EMAIL, code: "246810" } }))).statusCode).toBe(400);
    expect((await pair(event("POST /auth/email/verify", { body: { email: JUDGE_EMAIL, code: "135790" } }))).statusCode).toBe(200);
    const auth = { kind: "profile", subjectId: "judge-u-judge", householdId: "judge-hh-judge" } as never;
    expect((body(await app(event("GET /friends", { auth }))) as { friends: unknown[] }).friends).toHaveLength(3);
    const feed = JSON.stringify(body(await app(event("GET /me/feed", { auth }))));
    for (const k of ["bear", "severance", "robot", "slowhorses", "dune2"]) expect(feed).toContain(`T-${k}`);
    expect(JSON.stringify(body(await app(event("GET /me/sent", { auth }))))).toContain("T-shogun");
  });
});
