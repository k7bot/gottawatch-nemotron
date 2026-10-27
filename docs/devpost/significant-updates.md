# What was significantly updated during the hackathon

Gottawatch existed before this hackathon: it was built for the Amazon *Build, Ship, Shape* developer
hackathon and submitted on Oct 23, 2026. This repo starts from a scrubbed copy of that state, committed and
tagged `baseline-amazon-2026-10-23`. Everything after that tag is new work for the Nebius x NVIDIA Global AI
Hackathon. Compare view: https://github.com/k7bot/gottawatch-nemotron/compare/baseline-amazon-2026-10-23...main

## What the baseline already had

- Phone web app (Vite + React): sign in, search titles, recommend one to a friend with a note, friends and invites.
- TV client (React Native, based on Amazon's react-native-multi-tv-app-sample) with a lean-back feed of friend picks
  and a browser export at `/tv/`, paired to a household with a code.
- API route handlers in TypeScript with a shared zod contract, a Store interface and an in-memory store.
- **Tonight's pick** with a `Picker` interface, a grounded prompt, validation, a daily cache and a rule-based fallback.
  An Amazon Bedrock picker was wired in but turned off in the live app (`pickMode=stub`).

Removed in the scrub (not part of this entry): the AWS CDK stack and AWS-only adapters (DynamoDB, SES, SSM,
Bedrock client, Gmail), the native iOS/Android app, deploy workflows, ops runbooks, design screenshots, and all
account identifiers, credentials and judge codes.

## What is new (13 commits after the tag, as of `be9891d`)

| Area | Change | Commit |
|---|---|---|
| Model choice | Eval harness and results for Nemotron models on Token Factory: a pick task and a tool-calling agent task with an exact-quote grounding check, 5 runs each | `3fa3010` |
| Tonight's pick | Token Factory client (OpenAI-compatible fetch, tools, JSON mode, timeouts) and a Nemotron Nano picker (`PICK_MODE=nebius`) | `08df8ed`, `5f5a3a4` |
| **Ask Gottawatch** (new feature) | Nemotron Super tool-calling agent with 4 tools, quote and title grounding checks, a nudge when it skips friend picks, Super → Nano → rule-based fallback chain, `POST /ask`, per-household rate limit, trace for the UI | `b59396e` |
| Phone UI | Ask box and mood chips on For you; best-bet card with friend quotes; "How I picked this" trace in plain language; honest source label; rate-limit and offline states | `b82c645` |
| TV UI | Ask screen driven by mood chips with the remote (no typing), live Nemotron picks, open a pick from the answer | `5fefb8a` |
| Demo data | Made-up catalog of 14 titles with metadata and generated posters, 4 friends, 13 unwatched friend picks with notes, watch history, a judge household | `ea5ac79` |
| Persistence | Snapshot store: debounced JSON saves to a file or S3-compatible storage, flush on shutdown | `4dbbae6` |
| Server | One Node process serving the API, the phone app at `/` and the TV view at `/tv/` on one origin, security headers, gzip, seed on boot, demo refresh | `da35000` |
| Packaging and hosting | Dockerfile (one Node 22 container); Cloud Run deploy with a Cloud Storage volume and Secret Manager; `/health` alias; an unused Northflank config | `2c96a86`, `3a46941`, `e90318a`, `be9891d` |

Size of the change since the tag (as of `be9891d`): 99 files changed, 3,521 lines added, 210 removed. Of that,
the API source is 1,373 added lines (most of it the Ask agent, Token Factory client, persistence and server) and
562 lines of new tests. Test counts now: contract 10, API 132, web 28, TV 35, all passing.
