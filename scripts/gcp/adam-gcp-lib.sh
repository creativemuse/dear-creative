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

# Returns 0 when ref is acceptable for deploy (digest-pinned, or any tag if allow_tag).
adam_gcp_validate_image_ref() {
  local ref="$1"
  local allow_tag="${2:-false}"
  if [[ -z "${ref}" ]]; then
    echo "Error: container image is required. Set ADAM_IMAGE, pass --image, or use --source." >&2
    return 1
  fi
  if [[ "${ref}" =~ @sha256:[a-fA-F0-9]{64}$ ]]; then
    return 0
  fi
  if [[ "${allow_tag}" == true || "${allow_tag}" == 1 ]]; then
    return 0
  fi
  echo "Error: image must pin a digest (@sha256:...). Pass --allow-tag to deploy a mutable tag." >&2
  return 1
}

adam_gcp_default_adam_image_repo() {
  local region="${GCP_REGION:-us-east4}"
  echo "${region}-docker.pkg.dev/${GCP_PROJECT_ID}/dear-creative/adam"
}
