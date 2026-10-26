// Route handlers as factories over AppDeps so tests can inject an in-memory store.
import * as C from "@gottawatch/contract";
import { completePairing, pairingStatus, startPairing } from "../domain/pairing.js";
import { getFeed, getMe, getSeenHistory, markSeen, markUnseen } from "../domain/feed.js";
import { forgetTv, getHome, getSent, homeOf } from "../domain/phone.js";
import { startAddEmail, startEmailSignIn, verifyAddEmail, verifyEmailSignIn } from "../domain/email.js";
import { acceptInvite, cancelInvite, createInvite, listInvites, previewInvite, removeFriend } from "../domain/invites.js";
import { getTonight } from "../domain/tonight.js";
import { createRecommendation, listFriends, searchTitles, titleDetails } from "../domain/recommend.js";
import type { AppDeps } from "../lib/deps.js";
import { ApiError, auth, json, jsonBody, parse, wrap, type ApiEvent } from "../lib/http.js";

export function makePairHandler(getDeps: () => AppDeps) {
  return wrap(async (event: ApiEvent) => {
    const deps = getDeps();
    switch (event.routeKey) {
      case "POST /pair/start": {
        const { deviceId } = parse(C.PairStartRequest, jsonBody(event));
        return json(200, await startPairing(deps, deviceId));
      }
      case "GET /pair/status": {
        const q = parse(C.PairStatusQuery, event.queryStringParameters ?? {});
        return json(200, await pairingStatus(deps, q.code, q.deviceId));
      }
      // Email sign-in (unauthenticated, ADR-0013 amendment); lives with the pair Lambda (no authorizer).
      case "GET /auth/config":
        return json(200, { email: !!deps.mailer });
      case "POST /auth/email/start": {
        const { email, invite, name } = parse(C.EmailStartRequest, jsonBody(event));
        return json(200, await startEmailSignIn(deps, email, invite, name));
      }
      case "POST /invites/preview": {
        const { code } = parse(C.InviteCodeRequest, jsonBody(event));
        return json(200, await previewInvite(deps, code));
      }
      case "POST /auth/email/verify": {
        const { email, code } = parse(C.EmailVerifyRequest, jsonBody(event));
        return json(200, await verifyEmailSignIn(deps, email, code));
      }
      case "POST /pair/complete": {
        const ctx = auth(event, "profile");
        const { code } = parse(C.PairCompleteRequest, jsonBody(event));
        return json(200, await completePairing(deps, ctx.subjectId, ctx.householdId, code));
      }
    }
    throw new ApiError("not_found", "No such route");
  });
}

export function makeAppHandler(getDeps: () => AppDeps) {
  return wrap(async (event: ApiEvent) => {
    const deps = getDeps();
    switch (event.routeKey) {
      case "GET /me":
        return json(200, await getMe(deps.store, auth(event)));
      case "GET /feed": {
        const ctx = auth(event, "device");
        const { limit } = parse(C.FeedQuery, event.queryStringParameters ?? {});
        return json(200, { items: await getFeed(deps.store, ctx.householdId, limit) });
      }
      case "GET /friends": {
        const ctx = auth(event, "profile");
        return json(200, { friends: await listFriends(deps.store, ctx.subjectId) });
      }
      case "GET /titles/search": {
        auth(event, "profile");
        const { q } = parse(C.TitleSearchQuery, event.queryStringParameters ?? {});
        return json(200, { results: await searchTitles(q, deps.catalog) });
      }
      case "GET /titles/{mediaType}/{id}": {
        auth(event, "profile");
        const p = parse(C.TitleDetailsPath, event.pathParameters ?? {});
        return json(200, { title: await titleDetails(deps.catalog, p.id, p.mediaType) });
      }
      case "POST /recommendations": {
        const ctx = auth(event, "profile");
        const req = parse(C.CreateRecommendationRequest, jsonBody(event));
        return json(200, { ids: await createRecommendation(deps.store, deps.clock, ctx.subjectId, req, deps.catalog) });
      }
      case "POST /recommendations/{id}/seen": {
        const ctx = auth(event, "device");
        const id = event.pathParameters?.id;
        if (!id || id.length > 128) throw new ApiError("bad_request", "Missing recommendation id");
        await markSeen(deps.store, deps.clock, ctx.householdId, id);
        return json(200, { ok: true });
      }
      case "DELETE /recommendations/{id}/seen": {
        const ctx = auth(event, "device");
        const id = event.pathParameters?.id;
        if (!id || id.length > 128) throw new ApiError("bad_request", "Missing recommendation id");
        await markUnseen(deps.store, ctx.householdId, id);
        return json(200, { ok: true });
      }
      // --- phone-only twins (ADR-0013, review PT-1/PT-2) ---
      case "GET /me/feed": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        const { limit } = parse(C.FeedQuery, event.queryStringParameters ?? {});
        return json(200, { items: await getFeed(deps.store, u.householdId, limit) });
      }
      case "GET /me/seen": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        const { limit } = parse(C.SeenQuery, event.queryStringParameters ?? {});
        return json(200, { items: await getSeenHistory(deps.store, u.householdId, limit) });
      }
      case "POST /me/seen/{id}":
      case "DELETE /me/seen/{id}": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        const id = event.pathParameters?.id;
        if (!id || id.length > 128) throw new ApiError("bad_request", "Missing recommendation id");
        if (event.routeKey.startsWith("POST")) await markSeen(deps.store, deps.clock, u.householdId, id);
        else await markUnseen(deps.store, u.householdId, id);
        return json(200, { ok: true });
      }
      case "GET /me/sent": {
        const ctx = auth(event, "profile");
        await homeOf(deps.store, ctx);
        const { limit } = parse(C.SentQuery, event.queryStringParameters ?? {});
        return json(200, { items: await getSent(deps.store, ctx.subjectId, limit) });
      }
      case "POST /me/email": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        const { email } = parse(C.EmailStartRequest, jsonBody(event));
        return json(200, await startAddEmail(deps, u.id, email));
      }
      case "POST /me/email/verify": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        const { email, code } = parse(C.EmailVerifyRequest, jsonBody(event));
        return json(200, await verifyAddEmail(deps, u.id, email, code));
      }
      // --- friend invites (ADR-0015) ---
      case "POST /invites": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        const { email } = parse(C.CreateInviteRequest, jsonBody(event));
        return json(200, await createInvite(deps, u.id, email));
      }
      case "GET /invites": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        return json(200, { invites: await listInvites(deps, u.id) });
      }
      case "DELETE /invites/{id}": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        const id = event.pathParameters?.id;
        if (!id || id.length > 64) throw new ApiError("bad_request", "Missing invite id");
        await cancelInvite(deps, u.id, id);
        return json(200, { ok: true });
      }
      case "POST /invites/accept": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        const { code } = parse(C.InviteCodeRequest, jsonBody(event));
        return json(200, await acceptInvite(deps, u.id, code));
      }
      case "DELETE /friends/{id}": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        const id = event.pathParameters?.id;
        if (!id || id.length > 128) throw new ApiError("bad_request", "Missing friend id");
        await removeFriend(deps, u.id, id);
        return json(200, { ok: true });
      }
      case "GET /me/home": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        return json(200, await getHome(deps.store, u));
      }
      case "DELETE /me/home/tvs/{id}": {
        const u = await homeOf(deps.store, auth(event, "profile"));
        const id = event.pathParameters?.id ?? "";
        return json(200, await forgetTv(deps.store, u, id));
      }
      case "GET /seen": {
        const ctx = auth(event, "device");
        const { limit } = parse(C.SeenQuery, event.queryStringParameters ?? {});
        return json(200, { items: await getSeenHistory(deps.store, ctx.householdId, limit) });
      }
    }
    throw new ApiError("not_found", "No such route");
  });
}

export function makeTonightHandler(getDeps: () => AppDeps) {
  return wrap(async (event: ApiEvent) => {
    const ctx = auth(event, "device");
    const res = await getTonight(getDeps(), ctx.householdId);
    return res ? json(200, res) : json(204);
  });
}
