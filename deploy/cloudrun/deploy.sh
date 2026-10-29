#!/usr/bin/env bash
# Deploy Gottawatch to Google Cloud Run (free tier sized): one container, state on a
# Cloud Storage volume at /data (STORE_MODE=file), Nebius key from Secret Manager.
# Re-runnable: existing resources are reused. The Nebius key is never printed or put on a
# command line (it is piped from $NEBIUS_API_KEY on first run only).
#
#   PROJECT=gottawatch-nemotron REGION=us-central1 deploy/cloudrun/deploy.sh
#
# Needs: gcloud (logged in), docker (DOCKER="sudo -n docker" if the socket needs root),
# and NEBIUS_API_KEY in the environment the first time.
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT=${PROJECT:-gottawatch-nemotron}
REGION=${REGION:-us-central1}
SERVICE=${SERVICE:-gottawatch}
REPO=${REPO:-gottawatch}
BUCKET=${BUCKET:-$PROJECT-data}
SECRET=${SECRET:-nebius-api-key}
SA_NAME=${SA_NAME:-gottawatch-run}
DOCKER=${DOCKER:-docker}
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
TAG=$(git rev-parse --short HEAD)
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/$SERVICE:$TAG"
g() { gcloud --project "$PROJECT" --quiet "$@"; }

echo "1/6 APIs"
g services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com

echo "2/6 registry, bucket, service account"
g artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 ||
  g artifacts repositories create "$REPO" --repository-format=docker --location "$REGION"
g storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 ||
  g storage buckets create "gs://$BUCKET" --location "$REGION" --uniform-bucket-level-access --public-access-prevention
g iam service-accounts describe "$SA" >/dev/null 2>&1 ||
  g iam service-accounts create "$SA_NAME" --display-name "Gottawatch Cloud Run"
g storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$SA" --role roles/storage.objectUser --format none

echo "3/6 secret $SECRET"
if ! g secrets describe "$SECRET" >/dev/null 2>&1; then
  : "${NEBIUS_API_KEY:?set NEBIUS_API_KEY for the first run}"
  printf %s "$NEBIUS_API_KEY" | g secrets create "$SECRET" --data-file=- --replication-policy automatic
fi
g secrets add-iam-policy-binding "$SECRET" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor --format none

echo "4/6 image $IMAGE"
$DOCKER build -t "$IMAGE" .
gcloud auth print-access-token | $DOCKER login -u oauth2accesstoken --password-stdin "https://$REGION-docker.pkg.dev" >/dev/null
$DOCKER push "$IMAGE" | tail -1

echo "5/6 Cloud Run service $SERVICE"
# max-instances=1: the snapshot file has one writer. min-instances=0: scales to zero (free tier).
# The node user in the image is uid/gid 1000, so the bucket is mounted as that user.
g run deploy "$SERVICE" --region "$REGION" --image "$IMAGE" --service-account "$SA" \
  --allow-unauthenticated --port 8080 --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 1 --concurrency 40 --timeout 60 \
  --execution-environment gen2 \
  --add-volume "name=data,type=cloud-storage,bucket=$BUCKET,mount-options=uid=1000;gid=1000" \
  --add-volume-mount "volume=data,mount-path=/data" \
  --set-secrets "NEBIUS_API_KEY=$SECRET:latest" \
  --set-env-vars "STORE_MODE=file,SNAPSHOT_FILE=/data/state.json,PICK_MODE=nebius,ASK_MODE=nebius,DEMO_REFRESH_HOURS=24,SEED_JUDGES=1" \
  --startup-probe "httpGet.path=/health,httpGet.port=8080,initialDelaySeconds=2,periodSeconds=5,failureThreshold=12,timeoutSeconds=3" \
  --liveness-probe "httpGet.path=/health,httpGet.port=8080,periodSeconds=30,failureThreshold=4,timeoutSeconds=5"

echo "6/6 URL"
URL=$(g run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')
echo "  $URL   (health: $URL/health, TV: $URL/tv/)"
echo "Judge links (secret, do not paste anywhere public): gcloud storage cat gs://$BUCKET/seed-links.txt"
