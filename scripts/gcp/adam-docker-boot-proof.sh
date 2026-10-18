#!/usr/bin/env bash
# Builds the Adam Cloud Run image and proves the ADK server starts (no GCP deploy).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=adam-gcp-lib.sh
source "${ROOT}/scripts/gcp/adam-gcp-lib.sh"
adam_gcp_parse_args "$@"
adam_gcp_require_project

IMAGE="${ADAM_DOCKER_BOOT_IMAGE:-dear-creative-adam:boot-proof}"
CONTAINER="dear-creative-adam-boot-proof-$$"
LOG_FILE="${ROOT}/.adam-docker-boot.log"

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if sudo docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
  else
    echo "Docker is not available; skip boot proof or install/start dockerd" >&2
    exit 1
  fi
fi

cleanup() {
  "${DOCKER[@]}" rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${DOCKER[@]}" build -t "${IMAGE}" "${ROOT}/services/adam"

"${DOCKER[@]}" run -d --name "${CONTAINER}" \
  -e PORT=8080 \
  -e RESEND_LIVE=false \
  -e PAYMENTS_ENABLED=false \
  -e ADAM_API_TOKEN=boot-proof-token \
  -e DEAR_CREATIVE_API_BASE_URL=https://boot-proof.example.test \
  -p 18080:8080 \
  "${IMAGE}" >/dev/null

for _ in $(seq 1 90); do
  if "${DOCKER[@]}" logs "${CONTAINER}" 2>&1 | grep -q "ADK API Server started"; then
    echo "Adam ADK API server started (prod image boot proof)"
    "${DOCKER[@]}" logs "${CONTAINER}" >"${LOG_FILE}" 2>&1 || true
    grep -A5 "ADK API Server started" "${LOG_FILE}" || head -n 25 "${LOG_FILE}"
    exit 0
  fi
  if ! "${DOCKER[@]}" ps -q --filter "name=${CONTAINER}" | grep -q .; then
    "${DOCKER[@]}" logs "${CONTAINER}" || true
    echo "Container exited before ADK server start log" >&2
    exit 1
  fi
  sleep 1
done

"${DOCKER[@]}" logs "${CONTAINER}" || true
echo "Timed out waiting for Adam ADK server" >&2
exit 1
