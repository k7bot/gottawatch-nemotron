# Gottawatch

Friends recommend titles from their phones; your TV shows a lean-back living-room feed of those picks, suggests one **Tonight's pick** with a reason grounded only in your friends' own notes, and helps you get to the streaming app that has it.

> Started from a scrubbed baseline (tag `baseline-amazon-2026-10-23`): Gottawatch as it stood on Oct 23, 2026, originally built for the Amazon *Build, Ship, Shape* developer hackathon, with deployment config, judge/test credentials, account identifiers, app-store identifiers and the native phone app removed. Everything after that tag is new work for the Nebius x NVIDIA Global AI Hackathon ([what changed](docs/devpost/significant-updates.md)).

## Built with NVIDIA Nemotron on Nebius Token Factory

**Live demo:** https://gottawatch-752956741608.us-central1.run.app (phone web app) and
https://gottawatch-752956741608.us-central1.run.app/tv/ (browser TV view). Judge sign-in is in the Devpost testing notes.

**Ask Gottawatch** turns your friends' recommendations into a household concierge. Type or tap a mood
("short and funny, both of us") on the phone, or on the TV pick a mood chip with the remote or "Type your own". A Nemotron agent reads
what your friends sent, checks runtime, genre and what you've already watched, and answers with one to three
picks. Every quote it shows is copied word for word from a friend's note, and the server checks that.

| Model (Token Factory id) | Job | Settings |
|---|---|---|
| `nvidia/nemotron-3-super-120b-a12b` | Ask agent with tool calling | temperature 0.2, reasoning off, JSON mode after the first tool round, at most 4 rounds, 12 s budget |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Tonight's pick on the TV, and the Ask fallback reranker | temperature 0.2, JSON mode, single shot |

**How it calls Token Factory.** Plain `fetch` to the OpenAI-compatible endpoint
`https://api.tokenfactory.nebius.com/v1/chat/completions` (no SDK), `Authorization: Bearer $NEBIUS_API_KEY`,
with `tools` for function calling and `response_format: {"type": "json_object"}` for final answers
(`services/api/src/lib/tokenFactory.ts`). The key comes from the environment (Secret Manager in production)
and is never logged.

**Agent tools** (`services/api/src/domain/ask.ts`): `get_friend_picks` (unwatched friend picks with who sent them
and their notes; optional runtime, type and genre filters), `get_title_details`, `get_watch_history`, `search_catalog`.

**Grounding and quote check.** The model's JSON is validated before anything reaches the screen:
- every `recId` must be one of the household's real candidates, otherwise the pick is dropped;
- every quote must be an exact substring (ignoring case, extra spaces and curly vs straight quotes) of a sender's note;
- any quoted text inside a reason or the answer must also come from a note, otherwise the pick or answer is dropped;
- a reason that says a friend "said" or "mentioned" something is dropped when that friend left no note
  (we saw the fast model invent these in live runs);
- if the agent's tool round skips `get_friend_picks`, the server adds that call to the round; if it answers without ever reading friend picks, it is sent back once to call `get_friend_picks`;
- when the question asks for something short (or "under N minutes"), picks over the length are dropped if a shorter one fits, and an answer promising a length a pick doesn't meet is replaced;
- an answer that just repeats the question, or names a title it doesn't return, is replaced with a plain one.

**Relevance.** Every answer has a `status`: `ok` (grounded picks), `no_match` (nothing your friends sent fits; the
app says so and may show the closest pick, labeled "not an exact match") or `off_topic` (not a what-to-watch
question; no picks). The model chooses it and the server checks it: `no_match` is only believed after the agent read
the friend picks, `off_topic` only for typed questions that have no what-to-watch words in them ("something short and funny" never counts as off topic), and `ok` needs at least one grounded pick. The rule-based
fallback returns `no_match` instead of everything when a typed question's filters (genre, movie or show, length)
can't be met. Older clients that ignore `status` keep working (it defaults to `ok`).

**Prompt-injection defence.** Only the asking household's data goes to the model (friends' display names, notes, titles,
runtime, genres; no emails, tokens or account IDs). The system prompt treats friend notes as data, not
instructions, and allows recommending only titles returned by `get_friend_picks`; the validator enforces that
regardless of what the model says. Questions that try to change or reveal the rules
("ignore previous instructions…") are answered `off_topic` before any model call. Questions are capped at 300 characters and Ask is rate limited to 20 per household per 10 minutes.

**Fallback chain.** Super agent → Nano single-shot rerank → rule-based ranking by number of friends. Ask always
answers, and the response's `source` (`nemotron-agent`, `nemotron-fast` or `fallback`) and a step-by-step `trace`
drive the honest source label and the "How I picked this" drawer in the app.

**Measured on Token Factory** (Oct 26, 2026; `tools/model-eval/RESULTS.md`):

| Test | Result |
|---|---|
| Model eval, 5 runs each, median: Super 120B | pick 5/5 in 1075 ms; agent task 5/5 in 2028 ms |
| Model eval: Nano 30B | pick 5/5 in 706 ms; agent task 5/5 in 1447 ms |
| Model eval: Nemotron 3.5 Lightning (not used) | agent task 1/5, paraphrased quotes |
| Local server (not live), 10 real `/ask` calls | 10/10 answered by the agent with grounded picks, 1.3 to 3.8 s |
| `/tonight` with Nano | 0.9 to 1.2 s first call, cached after |
| Live Cloud Run deployment (Oct 27, 17 ordinary questions) | grounded picks from the agent, usually 2 to 4 s (2.0 to 7.3 s); no_match / off_topic in about 1 to 2 s |

**Run it locally with Nemotron:**

```bash
export NEBIUS_API_KEY=...              # a Nebius Token Factory key
docker build -t gottawatch . && docker run -p 8080:8080 -e NEBIUS_API_KEY -v gw-data:/data gottawatch
# phone: http://localhost:8080   TV: http://localhost:8080/tv/   health: /health
# sign-in links for the seeded demo people are in /data/seed-links.txt inside the volume
```

Without a key the app still runs, with the rule-based fallback. Licensed MIT ([LICENSE](LICENSE)).

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
| `DEMO_REFRESH_HOURS` | `24` | Re-dates the demo recs when they go stale. Keeps every link valid but resets judge Seen marks and sends |

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
