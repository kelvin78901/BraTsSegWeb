# BraTS Web Project Overview


## 1. What this project is

BraTS Web is an end-to-end brain tumor segmentation platform for MRI workflows.

It combines:
- A React + TypeScript web app for login, case review, async inference, and clinical AI assistance.
- A Spring Boot API gateway for auth, RBAC, audit, model registry, and job orchestration.
- A Python FastAPI sidecar for segmentation and keyframe rendering.

The platform supports:
- Multi-case review (WT/TC/ET segmentation quality and overlays)
- Async file-based inference jobs
- AI-assisted case consultation via Gemini
- Role-based access with request-level auditing

## 2. Current architecture

```text
Browser (React SPA)
  Routes: /login, /patient, /doctor, /records
  |
  |  /api/** (Bearer token)
  v
Spring Boot 3.3.2 (Java 17)
  - Auth + token store + role interceptors
  - Async inference job APIs
  - Model registry APIs
  - AI chat/consult/background APIs
  - Audit APIs
  - Static hosting for built frontend
  |
  |  HTTP + optional X-Sidecar-Key
  v
Python Sidecar (FastAPI)
  - /segment
  - /render/keyframes
  - /health
  - backend fallback: nnU-Net -> ONNX -> MONAI
```

## 3. Repository layout

```text
brats_web/
  frontend/                    React + Vite + TypeScript app
  spring/demo/                 Spring Boot application
  sidecar/                     FastAPI segmentation service
  demo_site/                   Static demo pages and data
  index.html, 1.html           Legacy static viewer pages
  build_*.py, make_*.py        Dataset/build utilities
```

## 4. Frontend (frontend/)

### 4.1 Stack
- React 18
- TypeScript 5.5
- Vite 5
- Zustand state management
- Three.js for login 3D scene
- Vitest + Testing Library + Playwright

### 4.2 Main routes
Defined in `frontend/src/App.tsx`:
- `/login`: login page with Three.js brain scene
- `/patient`: primary clinician workspace
- `/doctor`: multi-view case review page
- `/records`: patient record management UI

### 4.3 Important feature areas
- `pages/PatientPage.tsx`
  - case/model selection
  - viewer + metrics + upload + async inference + AI chat
- `pages/DoctorPage.tsx`
  - axial/coronal/sagittal comparison and Dice KPI panel
- `pages/PatientRecordPage.tsx`
  - editable longitudinal patient record data
- `components/InferencePanel.tsx`
  - async submit + polling + recent jobs

### 4.4 Frontend build output
Vite build writes to:
- `spring/demo/src/main/resources/static`

This allows Spring Boot to serve the SPA in production mode.

## 5. Spring Boot backend (spring/demo/)

### 5.1 Core modules
- `auth/`
  - login/logout/me
  - token issuance and TTL-based in-memory token store
  - API auth filter + role interceptor
- `infer/`
  - async job submission, status, result, history
  - model registry and model metadata APIs
- `agent/`
  - conversational assistant endpoint
  - structured consultation and background generation
  - Gemini API integration with retries
- `audit/`
  - API action auditing and admin query endpoints
- `patient/`
  - patient profile endpoint
- `config/`
  - request ID, exception handling, static resource mapping, startup validations

### 5.2 API access model
- `AuthFilter` requires Bearer token on `/api/**`
- `RoleCheckInterceptor` enforces `@RequireRole`
- `ResourcePolicy` protects job ownership (owner-or-admin)

### 5.3 SPA routing
`WebConfig` forwards:
- `/login`, `/patient`, `/doctor`, `/records` -> `/index.html`

## 6. Python sidecar (sidecar/)

### 6.1 Service endpoints
- `GET /health`
- `GET /render/keyframes?caseId=...&sliceZ=...`
- `POST /segment` (multipart NIfTI)

### 6.2 Segmentation behavior
`/segment` accepts `.nii`/`.nii.gz`, runs backend by policy:
- explicit `SEG_BACKEND` if provided
- otherwise fallback chain:
  1) nnU-Net
  2) ONNX Runtime
  3) MONAI/PyTorch open model

It persists uploaded cases under `CASES_DIR` and updates index metadata.

## 7. Key API summary

### 7.1 Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/upload-segment`

### 7.2 AI
- `POST /api/agent/chat`
- `POST /api/ai/consult`
- `POST /api/ai/background`
- `GET /api/ai/models`
- `GET /api/ai/selfcheck`

### 7.3 Async inference
- `POST /api/infer/submit`
- `GET /api/infer/status/{jobId}`
- `GET /api/infer/result/{jobId}`
- `GET /api/infer/jobs`
- `GET /api/infer/admin/jobs` (admin)

### 7.4 Model registry
- `GET /api/models`
- `GET /api/models/{modelId}`

### 7.5 Patient and audit
- `GET /api/patient/me`
- `GET /api/audit` (admin)
- `GET /api/audit/user/{userId}` (admin)

## 8. Data and static resources

- Primary dynamic case route: `/viewer/cases/**`
- Compatibility route: `/data/**`
- Source priority for `/viewer/cases/**`:
  1) filesystem path from `cases.dir` or `CASES_DIR`
  2) classpath fallback `static/viewer/cases/`

Common case files:
- `flair.nii.gz`
- `pred.nii.gz`
- `metrics.json`

## 9. Configuration and environment

### 9.1 Spring
From `application.properties`:
- `server.port` (default `8080`)
- `cases.dir` (or env `CASES_DIR`)
- `gemini.apiKey`, `gemini.model`, `gemini.baseUrl`
- `sidecar.baseUrl`, `sidecar.secret`
- `infer.pool.size`
- multipart limits set to `512MB`

### 9.2 Sidecar
Important environment variables:
- `CASES_DIR`
- `SIDECAR_SECRET`
- `SEG_BACKEND`
- `ONNX_MODEL_PATH`
- `OPEN_BRATS_MODEL_PATH`
- `OPEN_BRATS_MODEL_URL`
- nnU-Net variables (`NNUNET_*`)
- `MAX_UPLOAD_BYTES`

## 10. Local development workflow

### 10.1 Start sidecar
In `sidecar/` environment:
- install dependencies from `requirements.txt` or `requirements-cpu.txt`
- run `uvicorn app:app --host 0.0.0.0 --port 8000`

### 10.2 Start Spring Boot
In `spring/demo/`:
- `mvn spring-boot:run`

### 10.3 Start frontend dev server
In `frontend/`:
- `npm install`
- `npm run dev`

Vite dev server runs on `5173` and proxies `/api`, `/viewer`, `/data`, and `/nifti-reader.js` to `8080`.

## 11. Testing

Frontend tests:
- Unit/integration: `npm run test`
- E2E: `npm run test:e2e`

No consolidated backend test suite is currently documented in this file.

## 12. Current state notes

- The active product UI is the React SPA under `frontend/`.
- Legacy static HTML assets still exist at repository root and in `demo_site/` for demo/compatibility use.
- Auth/session and audit storage are in-memory (suitable for demo/internal environments; not yet persistent).
- Async inference and model registry are implemented and integrated into the React patient workflow.
