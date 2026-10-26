# Deploy on Northflank (free Developer Sandbox)

One combined service builds this repo's `Dockerfile` from GitHub `main` and runs it with a 1 GB
persistent volume at `/data` (`STORE_MODE=file`). Nemotron calls go to Nebius Token Factory. Hosting
costs $0: the Sandbox is free, needs no card and doesn't sleep. The AI calls use Token Factory credits.

## What gets created

| Piece | Value |
|---|---|
| Project | `default` (the free Sandbox allows one project; a new account already has it) |
| Secret group | `nebius-token-factory` → `NEBIUS_API_KEY` (secret, injected as env) |
| Service | `gottawatch` (combined: build + deploy), plan `nf-compute-50` (0.5 vCPU / 1 GB, $12/mo list, inside the $20/mo free allowance). Fallback `nf-compute-20` (0.2 vCPU / 512 MB) also works: tested at 42 MB RSS, Ask ≈ 4.8 s |
| Volume | `gw-data`, 1 GB, mounted at `/data` (`state.json` + `seed-links.txt`) |
| Port | `http` 8080, public HTTPS on `*.code.run` |
| Health | `GET /healthz` (startup, readiness, liveness probes) |
| Build | BuildKit, `/Dockerfile`, context `/`; `*.md` and `docs/**` changes don't trigger builds |

## Environment

| Var | Value | Notes |
|---|---|---|
| `NEBIUS_API_KEY` | secret group | required for live Nemotron picks and Ask |
| `PORT` | `8080` | must match the port above |
| `STORE_MODE` / `SNAPSHOT_FILE` | `file` / `/data/state.json` | the volume path |
| `PICK_MODE` | `nebius` | Tonight's pick from Nemotron Nano (falls back to deterministic) |
| `ASK_MODE` | `nebius` | Ask: Super → Nano → heuristic |
| `DEMO_REFRESH_HOURS` | `72` | re-dates demo recs so they stay fresh through judging (0 = off) |
| `SEED_JUDGES` | `1` | judge households seeded on first boot |
| `WEB_ORIGIN` | optional | only used in emailed invite links |

If the volume isn't writable by the image user (uid/gid 1000), the server exits with code 78 and a
one-line message instead of a stack trace. Northflank gives the volume to the image's group, so this
should not happen.

## Steps

1. Northflank account (free, no card). Done.
2. **Link GitHub (one-time, browser):** Northflank → Account settings → Git → GitHub → install the
   Northflank GitHub app on `k7bot` → "Only select repositories" → `gottawatch-nemotron`.
3. API token in the shell as `NORTHFLANK_API_TOKEN` (or `NF_API_TOKEN`), plus `NEBIUS_API_KEY`.
4. `npm i -g @northflank/cli && deploy/northflank/deploy.sh` (re-runnable; it keeps existing pieces).
   It checks repo access, creates the secret group and the service from `service.json`, and prints the URL.
5. First build + deploy takes about 5-8 minutes. Then check `/healthz`, `/`, `/tv/` and an Ask.

UI-only alternative: Create new → Service → Combined → GitHub repo `k7bot/gottawatch-nemotron`,
branch `main`, Dockerfile `/Dockerfile` → plan nf-compute-50 → port 8080 HTTP public → add the env
vars above and link the secret group → Volumes: add `gw-data` 1 GB at `/data` → Health checks
`/healthz` on 8080.

## Judge links

Seeding on first boot writes the profile links (bearer tokens) to `/data/seed-links.txt` (mode 600,
never logged). Read it with the service shell in the UI or
`northflank exec service --projectId default --serviceId gottawatch --cmd 'cat /data/seed-links.txt'`.
Prefix each `/u/...` path with the public URL.

## During judging (Dec 1-15, 2026)

- Pushing to `main` rebuilds and redeploys, and with a volume each deploy restarts the container
  (about 20 s of downtime). Pause CI on the service after submitting (Build options → disable CI),
  or push with `[skip nf]` in the commit message.
- One instance only: state lives in memory with a debounced snapshot to `/data` and a flush on SIGTERM.
