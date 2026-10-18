#!/usr/bin/env bash
# Asserts Adam GCP scripts fail fast when no project id is configured (no gcloud calls).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

TMP_ENV="$(mktemp)"
trap 'rm -f "${TMP_ENV}"' EXIT

cat >"${TMP_ENV}" <<'EOF'
export GCP_REGION=us-east4
export ADAM_CLOUD_RUN_SERVICE=dear-creative-adam
export ADAM_RUNTIME_SA=dear-creative-adam-run
export ADAM_SECRET_DEAR_APP_API_TOKEN=dear-creative-adam-dear-app-api-token
export ADAM_SECRET_DEAR_APP_BASE_URL=dear-creative-adam-dear-app-base-url
EOF

expect_project_required() {
  local script="$1"
  local label="$2"
  unset GCP_PROJECT_ID
  export ADAM_GCP_ENV_FILE="${TMP_ENV}"
  set +e
  local output
  output="$("${script}" 2>&1)"
  local code=$?
  set -e
  if [[ "${code}" -eq 0 ]]; then
    echo "Expected ${label} to fail without GCP_PROJECT_ID, but exit code was 0" >&2
    exit 1
  fi
  if ! grep -q "GCP project is required" <<<"${output}"; then
    echo "Expected ${label} to mention missing GCP project. Output:" >&2
    echo "${output}" >&2
    exit 1
  fi
}

expect_project_required "${ROOT}/scripts/gcp/adam-docker-boot-proof.sh" "adam-docker-boot-proof.sh"
expect_project_required "${ROOT}/scripts/gcp/adam-bootstrap-service-account.sh" "adam-bootstrap-service-account.sh"
expect_project_required "${ROOT}/scripts/gcp/adam-deploy-cloud-run.sh" "adam-deploy-cloud-run.sh"
expect_project_required "${ROOT}/scripts/gcp/adam-smoke-draft-remote.sh" "adam-smoke-draft-remote.sh"

unset GCP_PROJECT_ID
# shellcheck source=adam-gcp-lib.sh
source "${ROOT}/scripts/gcp/adam-gcp-lib.sh"
set +e
( adam_gcp_require_project ) 2>/dev/null
lib_code=$?
set -e
if [[ "${lib_code}" -eq 0 ]]; then
  echo "adam_gcp_require_project should fail when GCP_PROJECT_ID is unset" >&2
  exit 1
fi

echo "Adam GCP scripts correctly require GCP_PROJECT_ID or --project"
