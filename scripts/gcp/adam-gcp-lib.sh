# Shared helpers for Adam GCP shell scripts. Source from bash; do not execute directly.

ADAM_GCP_PROJECT_ARG=""

adam_gcp_parse_args() {
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
      *)
        echo "Error: unknown argument: $1" >&2
        exit 1
        ;;
    esac
  done
}

adam_gcp_source_env() {
  local root="$1"
  local file="${ADAM_GCP_ENV_FILE:-${root}/scripts/gcp/adam-gcp.env}"
  if [[ ! -f "${file}" ]]; then
    echo "Error: missing ${file} (copy scripts/gcp/adam-gcp.env.example)." >&2
    exit 1
  fi
  # shellcheck source=/dev/null
  source "${file}"
}

adam_gcp_require_project() {
  local project="${ADAM_GCP_PROJECT_ARG:-${GCP_PROJECT_ID:-}}"
  if [[ -z "${project}" ]]; then
    echo "Error: GCP project is required. Set GCP_PROJECT_ID or pass --project <id>." >&2
    exit 1
  fi
  export GCP_PROJECT_ID="${project}"
  export GCP_REGION="${GCP_REGION:-us-east4}"
}
