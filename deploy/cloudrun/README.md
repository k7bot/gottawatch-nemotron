# Deploy on Google Cloud Run

The live demo runs as one Cloud Run service in `us-central1`, sized to stay inside the
Cloud Run free tier. The model calls go to Nebius Token Factory (Nemotron); Google only
hosts the container and its state file.

| Piece | What |
|---|---|
| Service | `gottawatch`, 1 vCPU / 512 MiB, `min-instances=0`, `max-instances=1`, public (`--allow-unauthenticated`), gen2 |
| Image | Artifact Registry `us-central1-docker.pkg.dev/<project>/gottawatch/gottawatch:<git sha>`, built from the root `Dockerfile` |
| State | Cloud Storage bucket `<project>-data` mounted at `/data` (Cloud Storage volume, uid/gid 1000). `STORE_MODE=file`, `SNAPSHOT_FILE=/data/state.json` |
| Secret | Secret Manager `nebius-api-key`, exposed as `NEBIUS_API_KEY` |
| Identity | Service account `gottawatch-run` with Secret Accessor on the secret and Object User on the bucket only |
| Probes | Startup and liveness on `GET /health` |

Env: `PICK_MODE=nebius`, `ASK_MODE=nebius`, `DEMO_REFRESH_HOURS=72`, `SEED_JUDGES=1` (plus the
image defaults `PORT=8080`, `NODE_ENV=production`).

## Deploy

```bash
export NEBIUS_API_KEY=...            # first run only; stored in Secret Manager
PROJECT=gottawatch-nemotron REGION=us-central1 DOCKER="sudo -n docker" deploy/cloudrun/deploy.sh
```

The script is re-runnable: it reuses the registry, bucket, service account and secret, then
builds, pushes and deploys a new revision tagged with the current commit.

## Notes

- **Why `max-instances=1`:** the store is in memory with a debounced JSON snapshot. One
  instance means one writer, so there are no conflicting writes to `state.json`.
- **Restarts:** on boot the server loads `/data/state.json`; on SIGTERM (scale to zero, new
  revision) it flushes the snapshot first. A fresh bucket gets the demo seed on first boot.
- **`/healthz` vs `/health`:** the `run.app` front end answers `/healthz` itself with a 404, so
  Cloud Run probes and outside checks use `/health`. Both paths exist in the app.
- **Judge links:** the first boot writes `seed-links.txt` to the bucket. It holds sign-in tokens:
  read it with `gcloud storage cat gs://<project>-data/seed-links.txt` and never commit or post it.
- **Cold start:** with `min-instances=0` the first request after idle takes a few seconds.
