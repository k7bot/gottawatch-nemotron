# Gottawatch

Friends recommend titles from their phones; your TV shows a lean-back living-room feed of those picks, suggests one **Tonight's pick** with a reason grounded only in your friends' own notes, and helps you get to the streaming app that has it.

> **Baseline snapshot.** This commit is a scrubbed copy of Gottawatch as it stood on Oct 23, 2026 (originally built for the Amazon *Build, Ship, Shape* developer hackathon). Deployment config, judge/test credentials, account identifiers, app-store identifiers and the native phone app were removed. Everything after the `baseline-amazon-2026-10-23` tag is new work.

## Build and run

Prerequisites: Node 22 LTS (20 still works; the container uses 22), npm, and for the TV app Yarn 4 via `corepack enable`.

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

### One container (what gets deployed)

The production shape is a single Node process that serves the phone PWA at `/`, the browser TV view
at `/tv/` and the API on the same origin (`services/api/src/server/main.ts`).

```bash
docker build -t gottawatch .
docker run -p 8080:8080 -e NEBIUS_API_KEY -v gw-data:/data gottawatch
# → http://localhost:8080 (phone) and http://localhost:8080/tv/ (TV). Profile links for the seeded
#   demo people and the judge are written to /data/seed-links.txt (mode 600, never logged).
```

| Env | Default | Notes |
|---|---|---|
| `NEBIUS_API_KEY` | none | Turns on Ask (Nemotron 3 Super → Nano → heuristic) and Tonight's pick (Nano). Without it both use the deterministic fallback |
| `STORE_MODE` | `file` in the image | `file` (`SNAPSHOT_FILE`, default `/data/state.json`), `s3` or `memory` |
| `SNAPSHOT_BUCKET` / `SNAPSHOT_KEY` / `S3_ENDPOINT` / `S3_REGION` | – / `gottawatch/store.json` / – / `us-north1` | `s3` mode, e.g. Nebius Object Storage `https://storage.us-north1.nebius.cloud` with `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. Seed links are written next to the snapshot object |
| `PICK_MODE` / `ASK_MODE` | `nebius` when a key is set | `stub` / `off` to force the offline paths |
| `SEED_ON_BOOT` / `SEED_JUDGES` | `1` / `1` | Seeds the demo circle + N judge households when the store is empty |
| `DEMO_REFRESH_HOURS` | `72` | Re-dates the demo recs when they go stale. Keeps every link valid but resets judge Seen marks and sends |

Local without Docker: `npm run serve -w services/api` after building `apps/web` (`VITE_API_URL=same-origin`) and
the TV export (`cd apps/tv && EXPO_PUBLIC_API_URL=same-origin scripts/export-web.sh`).

### Hosting

The live demo runs on Google Cloud Run (one container, state in a Cloud Storage volume, Nebius key in Secret Manager). See [deploy/cloudrun/README.md](deploy/cloudrun/README.md). An unused alternative for Northflank is in [deploy/northflank/](deploy/northflank/README.md).

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
