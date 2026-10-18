#!/usr/bin/env bash
# Runs the smoke draft script against the deployed Dear Creative web app (no send).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT}/scripts/gcp/adam-gcp.env"

cd "${ROOT}/services/adam"
npm ci --omit=dev
npm run build:prod

export RESEND_LIVE=false
export PAYMENTS_ENABLED=false
# ADAM_API_TOKEN and DEAR_CREATIVE_API_BASE_URL must be present in the shell env
# (load from Secret Manager locally if needed — do not log values).

npm run smoke:draft
