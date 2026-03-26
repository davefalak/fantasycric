#!/usr/bin/env bash
set -euo pipefail

# Free-tier oriented deployment for API on Cloud Run.
# Requires:
# - gcloud authenticated
# - Docker/Cloud Build enabled
# - External free Postgres URL (Neon/Supabase/etc.)

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-fantasy-api}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

DATABASE_URL="${DATABASE_URL:-}"
JWT_SECRET="${JWT_SECRET:-}"
CRICKETDATA_API_KEY="${CRICKETDATA_API_KEY:-}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required. Example: PROJECT_ID=my-gcp-project ./scripts/deploy-gcp-free.sh"
  exit 1
fi

if [[ -z "${DATABASE_URL}" ]]; then
  echo "DATABASE_URL is required (use a free external Postgres provider)."
  exit 1
fi

if [[ -z "${JWT_SECRET}" ]]; then
  echo "JWT_SECRET is required."
  exit 1
fi

if [[ -z "${CRICKETDATA_API_KEY}" ]]; then
  echo "CRICKETDATA_API_KEY is required."
  exit 1
fi

echo "Using project: ${PROJECT_ID}"
echo "Using region: ${REGION}"
echo "Service name: ${SERVICE_NAME}"

gcloud config set project "${PROJECT_ID}"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

echo "Building image ${IMAGE} ..."
gcloud builds submit --tag "${IMAGE}" -f Dockerfile.api .

echo "Deploying Cloud Run service ${SERVICE_NAME} ..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "NODE_ENV=production,API_PORT=8080,DATABASE_URL=${DATABASE_URL},JWT_SECRET=${JWT_SECRET},CRICKETDATA_API_KEY=${CRICKETDATA_API_KEY},LIVE_POLL_AUTO_START=false,LIVE_PROVIDER=cricketdata,CRICKETDATA_DAILY_HIT_BUDGET=90"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format='value(status.url)')"
echo "Deployed successfully."
echo "Service URL: ${SERVICE_URL}"
echo "Health check: ${SERVICE_URL}/api/health"
