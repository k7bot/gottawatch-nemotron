// API Gateway HTTP API Lambda authorizer, simple response format (spec §7.2).
// Deny ONLY for a missing/malformed/unknown/wrong-kind token. Store errors are
// rethrown so API Gateway answers 500 (TV: "offline, retry") instead of caching
// a 403 deny that the TV would treat as "unpaired" (review MF-1).
// Never log the Authorization header or the token (profile tokens are long-lived).
import type { APIGatewayRequestAuthorizerEventV2 } from "aws-lambda";
import { authorizeHeader } from "../domain/authorize.js";
import type { Store } from "../lib/store.js";
import { DynamoStore } from "../lib/dynamoStore.js";
import type { AuthContext } from "../lib/http.js";

export function makeAuthorizer(getStore: () => Store) {
  return async (event: APIGatewayRequestAuthorizerEventV2) => {
    const header = event.headers?.authorization ?? event.headers?.Authorization;
    let ctx: AuthContext | undefined;
    try {
      ctx = await authorizeHeader(getStore(), header);
    } catch (e) {
      // Log only the error name/message, never the event or header.
      const err = e as { name?: string; message?: string };
      console.error("authorizer store error", { name: err?.name, message: err?.message });
      throw new Error("Authorizer unavailable");
    }
    return ctx ? { isAuthorized: true, context: ctx } : { isAuthorized: false };
  };
}

let store: Store | undefined;
export const handler = makeAuthorizer(() => (store ??= new DynamoStore(process.env.TABLE_NAME ?? "")));
