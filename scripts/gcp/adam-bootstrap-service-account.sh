#!/usr/bin/env bash
# Creates least-privilege runtime SA + secret containers (no secret values).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=adam-gcp-lib.sh
source "${ROOT}/scripts/gcp/adam-gcp-lib.sh"
adam_gcp_parse_args "$@"
adam_gcp_source_env "${ROOT}"
adam_gcp_require_project

PROJECT="${GCP_PROJECT_ID}"
REGION="${GCP_REGION}"
SA_ID="${ADAM_RUNTIME_SA:?ADAM_RUNTIME_SA is required in adam-gcp.env}"
SA_EMAIL="${SA_ID}@${PROJECT}.iam.gserviceaccount.com"
TOKEN_SECRET="${ADAM_SECRET_DEAR_APP_API_TOKEN:?}"
BASE_URL_SECRET="${ADAM_SECRET_DEAR_APP_BASE_URL:?}"

gcloud config set project "${PROJECT}" >/dev/null

if ! gcloud iam service-accounts describe "${SA_EMAIL}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SA_ID}" \
    --display-name="Dear Creative Adam (Cloud Run runtime)"
fi

gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/logging.logWriter" \
  --condition=None >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user" \
  --condition=None >/dev/null

for SECRET in "${TOKEN_SECRET}" "${BASE_URL_SECRET}"; do
  if ! gcloud secrets describe "${SECRET}" >/dev/null 2>&1; then
    gcloud secrets create "${SECRET}" --replication-policy=automatic
  fi
  gcloud secrets add-iam-policy-binding "${SECRET}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" >/dev/null
done

cat <<EOF
Bootstrap complete (no secret values written).
Project: ${PROJECT}
Region: ${REGION}
Runtime SA: ${SA_EMAIL}
Roles: roles/logging.logWriter, roles/aiplatform.user, secretAccessor on:
  - ${TOKEN_SECRET}
  - ${BASE_URL_SECRET}
Add secret versions before deploy:
  gcloud secrets versions add ${TOKEN_SECRET} --data-file=-
  gcloud secrets versions add ${BASE_URL_SECRET} --data-file=-
EOF
