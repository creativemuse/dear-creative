#!/usr/bin/env bash
# Deploy Adam ADK API server to Cloud Run (low cost profile). Requires gcloud auth.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT}/scripts/gcp/adam-gcp.env"

PROJECT="${GCP_PROJECT_ID:?}"
REGION="${GCP_REGION:?}"
SERVICE="${ADAM_CLOUD_RUN_SERVICE:?}"
SA_ID="${ADAM_RUNTIME_SA:?}"
SA_EMAIL="${SA_ID}@${PROJECT}.iam.gserviceaccount.com"
TOKEN_SECRET="${ADAM_SECRET_DEAR_APP_API_TOKEN:?}"
BASE_URL_SECRET="${ADAM_SECRET_DEAR_APP_BASE_URL:?}"

gcloud config set project "${PROJECT}" >/dev/null

gcloud run deploy "${SERVICE}" \
  --source "${ROOT}/services/adam" \
  --region "${REGION}" \
  --service-account "${SA_EMAIL}" \
  --platform managed \
  --no-allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --cpu 1 \
  --memory 512Mi \
  --concurrency 10 \
  --timeout 300 \
  --set-env-vars "RESEND_LIVE=false,PAYMENTS_ENABLED=false,GOOGLE_GENAI_USE_VERTEXAI=1,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},ADAM_GEMINI_MODEL=gemini-2.5-flash" \
  --set-secrets "ADAM_API_TOKEN=${TOKEN_SECRET}:latest,DEAR_CREATIVE_API_BASE_URL=${BASE_URL_SECRET}:latest"

URL="$(gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.url)')"
REV="$(gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.latestReadyRevisionName)')"

cat <<EOF
Deployed ${SERVICE}
URL: ${URL}
Revision: ${REV}
Service account: ${SA_EMAIL}
Secrets mounted: ${TOKEN_SECRET}, ${BASE_URL_SECRET}
EOF
