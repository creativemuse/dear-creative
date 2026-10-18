# Adam on Google Cloud Run

TypeScript [Google ADK](https://adk.dev/) agent (`services/adam`) that calls the Dear Creative web app Adam API (`/api/adam/*`). **Draft-only** — no Resend live send, no payments.

## GCP target

| Setting | Value |
|---------|--------|
| Project | `creative-ai-491118` |
| Region | `us-east4` |
| Service | `dear-creative-adam` |
| Runtime SA | `dear-creative-adam-run@creative-ai-491118.iam.gserviceaccount.com` |

## Cost guardrails

- `min-instances=0`, `max-instances=2`, `512Mi` RAM, `1` CPU
- `RESEND_LIVE=false`, `PAYMENTS_ENABLED=false` on the Cloud Run service
- Gemini via **Vertex AI** (`GOOGLE_GENAI_USE_VERTEXAI=1`) and `roles/aiplatform.user` on the runtime SA (no API key secret required when using ADC)
- No DNS changes to `news.creativeplatform.xyz`

## Secrets (names only)

Secret Manager containers (create via bootstrap; **add versions manually**):

| Secret name | Cloud Run env var |
|-------------|-------------------|
| `dear-creative-adam-dear-app-api-token` | `ADAM_API_TOKEN` |
| `dear-creative-adam-dear-app-base-url` | `DEAR_CREATIVE_API_BASE_URL` |

The token must match `ADAM_API_TOKEN` on the Dear Creative web app deployment.

## Deploy (requires gcloud credentials)

1. Copy `scripts/gcp/adam-gcp.env.example` → `scripts/gcp/adam-gcp.env` (gitignored).
2. Authenticate: `gcloud auth login` and `gcloud auth application-default login` with permission to deploy Cloud Run and manage IAM on `creative-ai-491118`.
3. `./scripts/gcp/adam-bootstrap-service-account.sh`
4. Add secret **versions** (interactive; values never committed).
5. `./scripts/gcp/adam-deploy-cloud-run.sh`
6. Smoke draft (approval queue only, no send): export the two env vars locally, then `./scripts/gcp/adam-smoke-draft-remote.sh`

## Local dev

```bash
cd services/adam
npm ci
export DEAR_CREATIVE_API_BASE_URL=http://localhost:3000
export ADAM_API_TOKEN=...
export RESEND_LIVE=false
export PAYMENTS_ENABLED=false
npm start
```

## Cloud Agent note

This environment had **no gcloud credentials** (`gcloud auth list` empty). Deployment and smoke draft must be run from a machine or CI identity with GCP access.
