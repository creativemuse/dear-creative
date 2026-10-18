#!/usr/bin/env bash
# Deploy Adam ADK API server to Cloud Run (low cost profile). Requires gcloud auth.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=adam-gcp-lib.sh
source "${ROOT}/scripts/gcp/adam-gcp-lib.sh"

ADAM_DEPLOY_USE_SOURCE=false
ADAM_DEPLOY_IMAGE_ARG=""
ADAM_DEPLOY_ALLOW_TAG=false

adam_deploy_parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --project)
        if [[ $# -lt 2 || -z "${2:-}" ]]; then
          echo "Error: --project requires a GCP project id." >&2
          exit 1
        fi
        ADAM_GCP_PROJECT_ARG="$2"
        shift 2
        ;;
      --project=*)
        ADAM_GCP_PROJECT_ARG="${1#*=}"
        if [[ -z "${ADAM_GCP_PROJECT_ARG}" ]]; then
          echo "Error: --project requires a GCP project id." >&2
          exit 1
        fi
        shift
        ;;
      --image)
        if [[ $# -lt 2 || -z "${2:-}" ]]; then
          echo "Error: --image requires a container image URI." >&2
          exit 1
        fi
        ADAM_DEPLOY_IMAGE_ARG="$2"
        shift 2
        ;;
      --image=*)
        ADAM_DEPLOY_IMAGE_ARG="${1#*=}"
        if [[ -z "${ADAM_DEPLOY_IMAGE_ARG}" ]]; then
          echo "Error: --image requires a container image URI." >&2
          exit 1
        fi
        shift
        ;;
      --source)
        ADAM_DEPLOY_USE_SOURCE=true
        shift
        ;;
      --allow-tag)
        ADAM_DEPLOY_ALLOW_TAG=true
        shift
        ;;
      *)
        echo "Error: unknown argument: $1" >&2
        exit 1
        ;;
    esac
  done
}

adam_deploy_parse_args "$@"
adam_gcp_source_env "${ROOT}"
adam_gcp_require_project

PROJECT="${GCP_PROJECT_ID}"
REGION="${GCP_REGION}"
SERVICE="${ADAM_CLOUD_RUN_SERVICE:?ADAM_CLOUD_RUN_SERVICE is required in adam-gcp.env}"
SA_ID="${ADAM_RUNTIME_SA:?}"
SA_EMAIL="${SA_ID}@${PROJECT}.iam.gserviceaccount.com"
TOKEN_SECRET="${ADAM_SECRET_DEAR_APP_API_TOKEN:?}"
BASE_URL_SECRET="${ADAM_SECRET_DEAR_APP_BASE_URL:?}"
MEMORY="${ADAM_MEMORY:-1Gi}"

gcloud config set project "${PROJECT}" >/dev/null

COMMON_ARGS=(
  --region "${REGION}"
  --service-account "${SA_EMAIL}"
  --platform managed
  --no-allow-unauthenticated
  --min-instances 0
  --max-instances 2
  --cpu 1
  --memory "${MEMORY}"
  --concurrency 10
  --timeout 300
  --set-env-vars "RESEND_LIVE=false,PAYMENTS_ENABLED=false,GOOGLE_GENAI_USE_VERTEXAI=1,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},ADAM_GEMINI_MODEL=gemini-2.5-flash"
  --set-secrets "ADAM_API_TOKEN=${TOKEN_SECRET}:latest,DEAR_CREATIVE_API_BASE_URL=${BASE_URL_SECRET}:latest"
)

if [[ "${ADAM_DEPLOY_USE_SOURCE}" == true ]]; then
  BUILD_SA_ARGS=()
  if [[ -n "${ADAM_CLOUD_BUILD_SA:-}" ]]; then
    BUILD_SA_ARGS=(--build-service-account="${ADAM_CLOUD_BUILD_SA}@${PROJECT}.iam.gserviceaccount.com")
  fi
  gcloud run deploy "${SERVICE}" \
    --source "${ROOT}/services/adam" \
    "${BUILD_SA_ARGS[@]}" \
    "${COMMON_ARGS[@]}"
else
  IMAGE="${ADAM_DEPLOY_IMAGE_ARG:-${ADAM_IMAGE:-}}"
  if ! adam_gcp_validate_image_ref "${IMAGE}" "${ADAM_DEPLOY_ALLOW_TAG}"; then
    exit 1
  fi
  gcloud run deploy "${SERVICE}" \
    --image "${IMAGE}" \
    "${COMMON_ARGS[@]}"
fi

URL="$(gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.url)')"
REV="$(gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.latestReadyRevisionName)')"

cat <<EOF
Deployed ${SERVICE}
Project: ${PROJECT}
Region: ${REGION}
URL: ${URL}
Revision: ${REV}
Service account: ${SA_EMAIL}
Secrets mounted: ${TOKEN_SECRET}, ${BASE_URL_SECRET}
EOF
