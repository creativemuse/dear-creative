#!/usr/bin/env bash
# Builds Adam via Cloud Build and pushes to Artifact Registry. Prints digest-pinned URI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=adam-gcp-lib.sh
source "${ROOT}/scripts/gcp/adam-gcp-lib.sh"
adam_gcp_parse_args "$@"
adam_gcp_source_env "${ROOT}"
adam_gcp_require_project

PROJECT="${GCP_PROJECT_ID}"
REGION="${GCP_REGION}"
IMAGE_REPO="$(adam_gcp_default_adam_image_repo)"

gcloud config set project "${PROJECT}" >/dev/null

TAG="${ADAM_IMAGE_TAG:-}"
if [[ -z "${TAG}" ]]; then
  if git -C "${ROOT}" rev-parse --short HEAD >/dev/null 2>&1; then
    TAG="$(git -C "${ROOT}" rev-parse --short HEAD)"
  else
    TAG="$(date -u +%Y%m%d%H%M%S)"
  fi
fi

BUILD_SA_ARGS=()
if [[ -n "${ADAM_CLOUD_BUILD_SA:-}" ]]; then
  BUILD_SA_ARGS=(--service-account="${ADAM_CLOUD_BUILD_SA}@${PROJECT}.iam.gserviceaccount.com")
fi

gcloud builds submit "${ROOT}/services/adam" \
  --region "${REGION}" \
  --tag "${IMAGE_REPO}:${TAG}" \
  "${BUILD_SA_ARGS[@]}"

DIGEST="$(gcloud artifacts docker images describe "${IMAGE_REPO}:${TAG}" --format='value(image_summary.digest)')"
if [[ -z "${DIGEST}" ]]; then
  echo "Error: could not resolve image digest for ${IMAGE_REPO}:${TAG}" >&2
  exit 1
fi

PINNED="${IMAGE_REPO}@${DIGEST}"
cat <<EOF
Built and pushed Adam image
Repository: ${IMAGE_REPO}
Tag: ${TAG}
Digest-pinned URI:
${PINNED}
Deploy with:
  ADAM_IMAGE=${PINNED} ./scripts/gcp/adam-deploy-cloud-run.sh
  ./scripts/gcp/adam-deploy-cloud-run.sh --image ${PINNED}
EOF
