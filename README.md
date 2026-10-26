# Gottawatch

Friends recommend titles from their phones; your TV shows a lean-back living-room feed of those picks, suggests one **Tonight's pick** with a reason grounded only in your friends' own notes, and helps you get to the streaming app that has it.

> **Baseline snapshot.** This commit is a scrubbed copy of Gottawatch as it stood on Oct 23, 2026 (originally built for the Amazon *Build, Ship, Shape* developer hackathon). Deployment config, judge/test credentials, account identifiers, app-store identifiers and the native phone app were removed. Everything after the `baseline-amazon-2026-10-23` tag is new work.

## Build and run

Prerequisites: Node 20+ (CI uses 22), npm, and for the TV app Yarn 4 via `corepack enable`.

```bash
npm ci
npm test            # unit tests for every workspace
npm run typecheck

# Offline API (real route handlers, in-memory store, made-up demo catalog) on http://localhost:8787
npx tsx services/api/scripts/local-demo-server.ts

# Phone web app. There is no default backend: VITE_API_URL is required for live mode.
VITE_API_URL=http://localhost:8787 npm run dev -w apps/web
VITE_API_MODE=mock npm run dev -w apps/web     # fully offline mock data

# TV client (separate Yarn workspace); EXPO_PUBLIC_API_URL is required for live mode
cd apps/tv && corepack enable && yarn install
EXPO_PUBLIC_API_URL=http://localhost:8787 yarn dev:web
```

## Repo map

| Path | What lives here |
|---|---|
| `apps/tv/` | TV client (React Native, Fire OS first, Vega-ready), based on Amazon's react-native-multi-tv-app-sample (MIT-0, see `apps/tv/UPSTREAM.md`) |
| `apps/web/` | Phone web app (Vite + React): email sign-in, search, recommend, friends/invites, Your home |
| `services/api/` | Route handlers (Node/TypeScript): pair, feed, recommendations, seen, titles/search (TMDB or demo), tonight, email sign-in, invites, friends, Your home |
| `packages/contract/` | Shared zod schemas + types for the HTTP API |
| `docs/` | Big picture, specs and decisions (ADRs) |

## TMDB attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Show and movie info and posters come from [The Movie Database (TMDB)](https://www.themoviedb.org/); where-to-watch data comes from JustWatch via TMDB. `CATALOG_MODE=demo` uses made-up titles with no posters or service names.

## License

MIT, see [LICENSE](LICENSE). `apps/tv/` keeps its upstream MIT No Attribution license ([apps/tv/LICENSE](apps/tv/LICENSE)).
