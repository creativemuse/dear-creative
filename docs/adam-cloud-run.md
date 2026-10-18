# Adam on Google Cloud Run

TypeScript [Google ADK](https://adk.dev/) agent (`services/adam`) that calls the Dear Creative web app Adam API (`/api/adam/*`). **Draft-only** — no Resend live send, no payments.

Adam deploys to GCP project **`creative-ai-491118`**. Shell scripts do **not** hardcode a default: set **`GCP_PROJECT_ID`** (e.g. via `adam-gcp.env`) or pass **`--project <id>`** or they fail fast.

## GCP target

| Setting | Value |
|---------|--------|
| Project | `creative-ai-491118` (`GCP_PROJECT_ID` or `--project`; required in scripts) |
| Region | **`GCP_REGION`** (default `us-east4`) |
| Service | `dear-creative-adam` (override in `adam-gcp.env`) |
| Runtime SA | `dear-creative-adam-run@creative-ai-491118.iam.gserviceaccount.com` |

Configure via `scripts/gcp/adam-gcp.env` (copy from `adam-gcp.env.example`).

## Deployer service account

Grant these roles to the human or CI identity that runs `adam-bootstrap-service-account.sh`, `adam-build-image.sh`, and `adam-deploy-cloud-run.sh`:

| Role | Why |
|------|-----|
| `roles/run.admin` (Cloud Run Admin) | Deploy and configure Cloud Run services |
| `roles/iam.serviceAccountAdmin` (Service Account Admin) | Create the runtime service account |
| `roles/iam.serviceAccountUser` (Service Account User) | Deploy Cloud Run as the runtime SA |
| `roles/resourcemanager.projectIamAdmin` (Project IAM Admin) | Bind runtime SA roles on the project |
| `roles/secretmanager.admin` (Secret Manager Admin) | Create secret containers and IAM bindings |
| `roles/cloudbuild.builds.editor` (Cloud Build Editor) | `adam-build-image.sh` and optional `--source` deploys |
| `roles/artifactregistry.admin` (Artifact Registry Admin) | Push deploy artifacts (often required with Cloud Build) |
| `roles/serviceusage.serviceUsageAdmin` (Service Usage Admin) | Enable required APIs on a new project |
| `roles/storage.admin` (Storage Admin) | Cloud Build source staging bucket |

**Can often be narrowed later:** Storage Admin → bucket-scoped object admin on the Cloud Build bucket; Artifact Registry Admin → admin on a single repository; Project IAM Admin → custom role with only `setIamPolicy` on the runtime SA; Secret Manager Admin → admin on named secrets only.

Enable APIs before first deploy: Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Vertex AI, IAM.

## Cloud Run invoker IAM

Deploy uses `--no-allow-unauthenticated`. Only principals with **`roles/run.invoker`** on the service (or project) receive a valid identity token for HTTPS calls.

Typical grants:

- **Human / CI smoke:** `gcloud run services add-iam-policy-binding dear-creative-adam --region=us-east4 --member=user:you@example.com --role=roles/run.invoker`
- **Another GCP service account** (e.g. Cloud Scheduler): same command with `--member=serviceAccount:…`

The runtime service account does **not** need `run.invoker` on itself; it uses ADC for Vertex. Callers hitting the Adam ADK URL must present an OIDC token.

Optional: set `ADAM_CLOUD_BUILD_SA` in `adam-gcp.env` so build/deploy scripts pass a dedicated Cloud Build service account.

## Container image (Artifact Registry)

- **Repository:** `<GCP_REGION>-docker.pkg.dev/<GCP_PROJECT_ID>/dear-creative/adam` (region from **`GCP_REGION`**, default `us-east4`)
- **Default deploy:** digest-pinned `--image` (via **`ADAM_IMAGE`** or **`--image`**). Tags without a digest are rejected unless **`--allow-tag`** is passed.
- **Example (current pushed image):** `us-east4-docker.pkg.dev/creative-ai-491118/dear-creative/adam@sha256:f91355e979fc57fead5d6a0f7787bcbfc4b9fbfb9380e7601340a76406b1d76d`
- **Rollback:** redeploy the previous digest (keep the last known-good `@sha256:…` and run `adam-deploy-cloud-run.sh --image …` again). Cloud Run revisions are immutable per image pin.
- **Fallback:** `./scripts/gcp/adam-deploy-cloud-run.sh --source` builds from `services/adam` at deploy time (slower, less reproducible).

## Cost guardrails

- `min-instances=0`, `max-instances=2`, **`1Gi` RAM** (override with **`ADAM_MEMORY`** in `adam-gcp.env`), `1` CPU
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

1. Copy `scripts/gcp/adam-gcp.env.example` → `scripts/gcp/adam-gcp.env` (gitignored). Example sets **`GCP_PROJECT_ID=creative-ai-491118`**; adjust only if deploying elsewhere.
2. Authenticate: `gcloud auth login` and `gcloud auth application-default login` with the deployer roles above on that project.
3. `./scripts/gcp/adam-bootstrap-service-account.sh` (or `./scripts/gcp/adam-bootstrap-service-account.sh --project <id>`)
4. Add secret **versions** (interactive; values never committed).
5. Build and push: `./scripts/gcp/adam-build-image.sh` (prints a digest-pinned URI).
6. Deploy that digest: `ADAM_IMAGE=<uri@sha256:…> ./scripts/gcp/adam-deploy-cloud-run.sh` or `./scripts/gcp/adam-deploy-cloud-run.sh --image <uri@sha256:…>`. Optional: `ADAM_MEMORY=2Gi` for a larger Cloud Run limit.
7. Smoke draft (approval queue only, no send): export the two env vars locally, then `./scripts/gcp/adam-smoke-draft-remote.sh`

## Prod image boot proof (local)

CI and operators can verify the container starts without deploying:

```bash
GCP_PROJECT_ID=local-boot-proof ./scripts/gcp/adam-docker-boot-proof.sh
```

Requires Docker. The script still requires a **project id** (no default) but does not call GCP. It builds `services/adam`, runs with test env vars, and checks for the ADK start log. The prod image binds **`0.0.0.0:$PORT`** (default **8080**) so Cloud Run startup probes reach the ADK server.

## Local dev

```bash
cd services/adam
npm ci
export DEAR_CREATIVE_API_BASE_URL=http://localhost:3000
export ADAM_API_TOKEN=...
export RESEND_LIVE=false
export PAYMENTS_ENABLED=false
export PORT=8080
npm start
```

`npm start` runs the ADK API server on **`0.0.0.0`** and **`PORT`** (default **8080**), matching the Cloud Run container.

## Cloud Agent note

Cloud agents typically have **no gcloud credentials**. Deployment and smoke draft must be run from a machine or CI identity with GCP access.

## Adam Editorial Studio (`/adam`), Voice, Ideas & Monday Schedule

The unified private studio at `/adam` (also accessible via `/approvals` and `/admin`) provides:

1. **Multimodal Chat (`POST /api/adam/chat`):** Chat with Adam and attach reference images (`image/*`), PDFs (`application/pdf`), or text/markdown files (`text/*`, `.md`, `.csv`, `.json`).
2. **Voice Input & Output (`POST /api/adam/voice/stt`, `POST /api/adam/voice/tts`):**
   - Server-side Google Gemini Multimodal Audio STT + Gemini / Google Cloud TTS (`GEMINI_API_KEY`).
   - Automatic zero-latency client fallback using the browser's local Web Speech API (`SpeechRecognition` + `speechSynthesis`).
3. **Ideas & Rough Drafts (`GET/POST/PATCH /api/adam/ideas`):**
   - Paste an idea or rough draft on `/adam` to either immediately turn it into a draft post in the Approval Queue (`mode: "draft_now"`) or queue it in `adam_ideas` (`mode: "queue"`).
4. **Weekly Scheduled Issue Drafting (`GET/PUT/POST /api/adam/schedule`):**
   - Default schedule: `0 9 * * 1` (`America/New_York` — Every Monday at 9:00 AM).
   - Prioritizes queued ideas from `adam_ideas` first; if none are queued, autonomously drafts a fresh Dear Creative issue into the Approval Queue.
   - Provision or update the Google Cloud Scheduler job with:
     ```bash
     ./scripts/gcp/adam-schedule-cloud-scheduler.sh
     ```

