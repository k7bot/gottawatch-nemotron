# services/api: Lambda handlers

Spec: [docs/specs/api.md](../../docs/specs/api.md) · Tasks: [docs/tasks/api-tasks.md](../../docs/tasks/api-tasks.md) · Contract: [packages/contract](../../packages/contract) · Infra: [infra](../../infra).

## Layout
- `src/lib/`: tokens + pair codes + rec ids, `Store` interface (`MemoryStore` for tests, `DynamoStore` for AWS), HTTP helpers, env wiring (`deps.ts`), Bedrock SDK adapter.
- `src/domain/`: pairing, authorizer check, feed/Seen/`/me`, Tonight's pick (stub picker, Bedrock picker, cache, fallback).
- `src/handlers/`: Lambda entry points (`authorizer`, `pair`, `app` = /me + /feed + seen, `tonight`). `routes.ts` holds testable factories.

## Run tests
```bash
npm install          # from the repo root (npm workspaces)
npm test             # contract + api + infra
npm test -w @gottawatch/api
```
Not implemented yet: `/friends`, `/titles/search`, `POST /recommendations`, seed script (API-11/12), TMDB (API-14).

## Config
`TABLE_NAME` (set by CDK), `PICK_MODE=stub|bedrock` (default `stub`; Bedrock is blocked on the account, OQ-14), `BEDROCK_MODEL_ID` (required for `bedrock`).
