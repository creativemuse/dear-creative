#!/usr/bin/env bash
# Creates or updates a Google Cloud Scheduler job that triggers Adam's weekly
# Monday morning issue draft on the Dear Creative web app (/api/adam/schedule).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=adam-gcp-lib.sh
source "${ROOT}/scripts/gcp/adam-gcp-lib.sh"
adam_gcp_parse_args "$@"
adam_gcp_source_env "${ROOT}"
adam_gcp_require_project

PROJECT="${GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-east4}"
JOB_NAME="${ADAM_SCHEDULER_JOB_NAME:-dear-creative-adam-monday-draft}"
CRON_SCHEDULE="${ADAM_SCHEDULER_CRON:-0 9 * * 1}"
TIMEZONE="${ADAM_SCHEDULER_TIMEZONE:-America/New_York}"
BASE_URL="${DEAR_CREATIVE_API_BASE_URL:?DEAR_CREATIVE_API_BASE_URL must be set}"
API_TOKEN="${ADAM_API_TOKEN:?ADAM_API_TOKEN must be set}"

TARGET_URI="${BASE_URL%/}/api/adam/schedule"

gcloud config set project "${PROJECT}" >/dev/null

if gcloud scheduler jobs describe "${JOB_NAME}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${JOB_NAME}" \
    --location="${REGION}" \
    --schedule="${CRON_SCHEDULE}" \
    --time-zone="${TIMEZONE}" \
    --uri="${TARGET_URI}" \
    --http-method=POST \
    --update-headers="Authorization=Bearer ${API_TOKEN},Content-Type=application/json" \
    --message-body='{"force":false}'
  echo "Updated Cloud Scheduler job ${JOB_NAME} (${CRON_SCHEDULE} ${TIMEZONE})"
else
  gcloud scheduler jobs create http "${JOB_NAME}" \
    --location="${REGION}" \
    --schedule="${CRON_SCHEDULE}" \
    --time-zone="${TIMEZONE}" \
    --uri="${TARGET_URI}" \
    --http-method=POST \
    --headers="Authorization=Bearer ${API_TOKEN},Content-Type=application/json" \
    --message-body='{"force":false}'
  echo "Created Cloud Scheduler job ${JOB_NAME} (${CRON_SCHEDULE} ${TIMEZONE})"
fi
