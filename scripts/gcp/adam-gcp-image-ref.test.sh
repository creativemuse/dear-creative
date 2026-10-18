#!/usr/bin/env bash
# Digest / tag validation for Adam deploy (no gcloud).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=adam-gcp-lib.sh
source "${ROOT}/scripts/gcp/adam-gcp-lib.sh"

EXAMPLE_DIGEST="f91355e979fc57fead5d6a0f7787bcbfc4b9fbfb9380e7601340a76406b1d76d"
VALID="us-east4-docker.pkg.dev/creative-ai-491118/dear-creative/adam@sha256:${EXAMPLE_DIGEST}"
TAGGED="us-east4-docker.pkg.dev/creative-ai-491118/dear-creative/adam:latest"

assert_ok() {
  local ref="$1"
  local allow="${2:-false}"
  if ! adam_gcp_validate_image_ref "${ref}" "${allow}"; then
    echo "Expected valid: ${ref} (allow_tag=${allow})" >&2
    exit 1
  fi
}

assert_fail() {
  local ref="$1"
  local allow="${2:-false}"
  set +e
  adam_gcp_validate_image_ref "${ref}" "${allow}" >/dev/null 2>&1
  local code=$?
  set -e
  if [[ "${code}" -eq 0 ]]; then
    echo "Expected invalid: ${ref} (allow_tag=${allow})" >&2
    exit 1
  fi
}

assert_ok "${VALID}"
assert_ok "${TAGGED}" true
assert_fail ""
assert_fail "${TAGGED}"
assert_fail "us-east4-docker.pkg.dev/creative-ai-491118/dear-creative/adam"
assert_fail "${VALID}:extra"
assert_fail "us-east4-docker.pkg.dev/creative-ai-491118/dear-creative/adam@sha256:abc"

export GCP_PROJECT_ID=creative-ai-491118
export GCP_REGION=us-east4
repo="$(adam_gcp_default_adam_image_repo)"
if [[ "${repo}" != "us-east4-docker.pkg.dev/creative-ai-491118/dear-creative/adam" ]]; then
  echo "Expected default repo from GCP_REGION=us-east4, got: ${repo}" >&2
  exit 1
fi
export GCP_REGION=europe-west1
repo="$(adam_gcp_default_adam_image_repo)"
if [[ "${repo}" != "europe-west1-docker.pkg.dev/creative-ai-491118/dear-creative/adam" ]]; then
  echo "Expected repo from GCP_REGION=europe-west1, got: ${repo}" >&2
  exit 1
fi

echo "Adam GCP image ref validation OK"
