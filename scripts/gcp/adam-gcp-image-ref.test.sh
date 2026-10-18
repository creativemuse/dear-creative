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

echo "Adam GCP image ref validation OK"
