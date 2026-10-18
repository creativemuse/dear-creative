#!/usr/bin/env bash
# Asserts missing /posts/[slug] responses include Next.js noindex (soft 404 under PPR).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-file:./data/ci-dear-creative.db}"
export LOCAL_DATABASE_URL
PORT="${PORT:-$((31000 + RANDOM % 9000))}"
BOGUS_SLUG="${BOGUS_SLUG:-bogus-slug-notfound-check}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="${LOG_FILE:-/tmp/post-slug-notfound-noindex.log}"

npm run db:migrate:local >/dev/null

if [[ ! -d .next ]]; then
  npx next build
fi

SERVER_PID=""
cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

: >"${LOG_FILE}"
NEXT_PUBLIC_SITE_URL="${BASE_URL}" npm run start -- -p "${PORT}" >>"${LOG_FILE}" 2>&1 &
SERVER_PID=$!

ready=0
for _ in $(seq 1 45); do
  if grep -q "Ready in" "${LOG_FILE}" 2>/dev/null; then
    code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/" 2>/dev/null || true)"
    if [[ "${code}" =~ ^[0-9]+$ ]] && [[ "${code}" -ge 200 ]] && [[ "${code}" -lt 600 ]]; then
      ready=1
      break
    fi
  fi
  sleep 2
done
if [[ "${ready}" -ne 1 ]]; then
  echo "next start did not become ready on port ${PORT}" >&2
  tail -50 "${LOG_FILE}" >&2 || true
  exit 1
fi

HTTP_CODE="$(curl -s -o /tmp/post-slug-notfound.html -w '%{http_code}' "${BASE_URL}/posts/${BOGUS_SLUG}")"
HTML="$(cat /tmp/post-slug-notfound.html)"

echo "curl /posts/${BOGUS_SLUG} -> HTTP ${HTTP_CODE}"

if ! grep -qE 'name="robots"[^>]*content="noindex"' <<<"${HTML}"; then
  echo "Expected noindex meta tag in HTML for bogus post slug" >&2
  exit 1
fi

echo "ok: noindex meta tag present"
