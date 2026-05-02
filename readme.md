# SmartMed BraTS Web

A brain-tumor MRI segmentation, visualization, and AI-assisted diagnosis platform built on the BraTS 2021 dataset.

## Overview

SmartMed BraTS Web lets clinicians load NIfTI MRI scans in the browser, run automatic tumor segmentation, and get AI-powered diagnostic assistance — all through a single-page web application.

**Key capabilities:**

- **In-browser MRI viewer** — three orthogonal slice views (axial, coronal, sagittal) plus real-time 3D volume rendering, with interactive controls for slice position, overlay opacity, and rotation.
- **Automatic segmentation** — upload a `.nii.gz` file and the system runs nnU-Net, ONNX Runtime, or MONAI inference on the backend, returning segmentation results and evaluation metrics.
- **AI consultation** — multi-turn conversational analysis and structured differential-diagnosis reports powered by Google Gemini, grounded in the actual imaging data and patient context.
- **Multi-model comparison** — a dedicated doctor view showing raw MRI, ground truth, prediction, and a color-coded difference map side by side across three planes.
- **Electronic health records** — in-app patient record management including medications, lab results, imaging studies, treatment plans, tumor details, and clinical history.
- **Role-based access & audit logging** — Bearer-token authentication with RBAC and automatic request-level auditing.

---

## Architecture

The system follows a **three-tier** design:

```
┌──────────────────────────────────────┐
│         Browser  (React SPA)         │
│   Login · Patient · Doctor · Records │
│         ↕  REST API (fetch)          │
├──────────────────────────────────────┤
│      Spring Boot 3.3  (Java 17)      │
│   API Gateway · Auth · Inference     │
│   Queue · AI Agent · Audit           │
│         ↕  HTTP                      │
├──────────────┬───────────────────────┤
│  Python      │  Google Gemini API    │
│  Sidecar     │  (generative AI)      |
│  (FastAPI)   │                       │
└──────────────┴───────────────────────┘
```

| Tier | Technology | Default Port | Role |
|------|-----------|-------------|------|
| Frontend | React 18 + TypeScript + Vite | 5173 (dev) | UI rendering, NIfTI visualization, state management |
| Backend | Spring Boot 3.3.2, Java 17 | 8080 | API gateway, auth, job queue, AI proxy, audit |
| Sidecar | Python FastAPI + Uvicorn | 8000 | GPU/CPU segmentation inference, keyframe rendering |

---

## Tech Stack

### Frontend

| Technology | Purpose |
|-----------|---------|
| React 18 + TypeScript 5.5 | Component-based UI with type safety |
| Vite 5 | Dev server with hot reload; production bundler |
| React Router 6 | Client-side routing (`/login`, `/patient`, `/doctor`, `/records`) |
| Zustand | Lightweight state management (auth, viewer, inference, patient records) |
| Three.js | 3D brain model on the login page (Perlin-noise geometry + custom GLSL shaders + bloom post-processing) |
| Canvas 2D API | 2D slice rendering and CPU-based 3D volume ray-casting |
| nifti-reader.js | In-browser NIfTI file parsing and decompression |
| Vitest + Playwright | Unit tests and end-to-end tests |

### Backend

| Technology | Purpose |
|-----------|---------|
| Spring Boot 3.3.2 (starter-web only) | REST API framework — no Spring Security, no JPA, no database |
| In-memory stores | All data (tokens, jobs, audit events, chat history) stored in ConcurrentHashMap with TTL-based eviction |
| Java HttpClient | Calls Google Gemini API with retry and timeout |
| ThreadPoolExecutor | Async inference job processing (configurable pool size) |

### Sidecar

| Technology | Purpose |
|-----------|---------|
| FastAPI + Uvicorn | Lightweight Python web service |
| nibabel + NumPy + Pillow | NIfTI I/O, array processing, PNG keyframe generation |
| nnU-Net v1/v2 | Primary segmentation backend (GPU) |
| ONNX Runtime | CPU-only inference alternative |
| MONAI + PyTorch | Fallback backend (auto-downloads model from HuggingFace) |

---

## Project Structure

```
brats_web/
├── frontend/            React SPA source
│   └── src/
│       ├── pages/       4 page components (Login, Patient, Doctor, Records)
│       ├── components/  Reusable UI (ViewerPanel, ChatPanel, InferencePanel, etc.)
│       ├── store/       Zustand stores (auth, viewer, inference, patient records)
│       ├── api/         HTTP client wrappers with auto-retry
│       └── lib/         NIfTI loader, 2D/3D renderers, Markdown parser
│
├── spring/demo/         Spring Boot backend
│   └── src/main/java/com/demo/med/
│       ├── auth/        Token auth, RBAC interceptor, role annotations
│       ├── infer/       Async job queue, worker pool, model registry
│       ├── agent/       Gemini chat, structured consult, background generation
│       ├── audit/       Request-level audit logging (ring buffer)
│       ├── patient/     Demo patient profile
│       └── config/      Web config, exception handler, request ID, startup checks
│
├── sidecar/             Python segmentation service
│   ├── app.py           FastAPI endpoints (/segment, /render/keyframes, /health)
│   └── models/          Model weight files
│
└── demo_site/           Static demo data and legacy viewer pages
```

---

## How It Works

### MRI Viewing

The frontend fetches NIfTI files (`.nii.gz`) from the server, parses them entirely in the browser, and renders three orthogonal 2D slice views plus a 3D volume view — all on HTML Canvas. The segmentation mask is overlaid with color-coded labels: red (necrotic core), green (edema), blue (enhancing tumor). Users can adjust slice position, overlay opacity, 3D threshold, and toggle auto-rotation.

### Segmentation Inference

Users drag-and-drop a NIfTI file into the inference panel. The frontend submits it to the Spring Boot backend, which queues the job and dispatches it to the Python sidecar via HTTP. The sidecar runs the segmentation model (priority: nnU-Net → ONNX → MONAI), saves the result as a new case on disk, and returns overlay keyframes. The frontend polls for completion and automatically loads the result into the viewer.

### AI-Assisted Diagnosis

The platform integrates Google Gemini for two modes of AI interaction:

- **Free-form chat** — multi-turn conversation about the loaded case, with history maintained per user and case.
- **Structured consult** — sends the case imaging data (keyframe PNGs), segmentation metrics, and patient context to Gemini with a JSON-schema constraint. Returns a structured report including key findings, differential diagnoses with confidence levels, recommended next steps, and red flags.

### Doctor Comparison View

A 12-panel grid displays raw MRI, ground truth overlay, model prediction overlay, and a difference map (false positives in red, false negatives in green, true positives in blue) across all three anatomical planes. Doctors can switch between MRI modalities (FLAIR, T1, T1ce, T2) and compare different models.

### Patient Records

A full electronic health record interface stored in the browser (localStorage). Supports editing demographics, tumor details, treatment plans, medications, lab results, imaging studies, allergies, comorbidities, visit history, and file uploads. This data is attached as context when requesting AI consultations.

---

## Authentication & Authorization

- **Mechanism:** Custom Bearer-token auth (no Spring Security dependency). Tokens are UUIDs stored in-memory with 8-hour TTL.
- **RBAC:** Three roles — `DOCTOR`, `RESEARCHER`, `ADMIN`. Enforced via a custom annotation and interceptor.
- **Sidecar auth:** Shared-secret header between Spring Boot and the Python sidecar.

---

## Data Format

### NIfTI Files

The platform works with NIfTI-1 format (`.nii` or `.nii.gz`). BraTS 2021 volumes are typically 240×240×155 voxels. Each case stores four MRI modalities (FLAIR, T1, T1ce, T2) and a segmentation mask as separate files.

**Segmentation labels:**

| Value | Region | Color |
|-------|--------|-------|
| 0 | Background | — |
| 1 | Necrotic / Non-enhancing Core | Red |
| 2 | Peritumoral Edema | Green |
| 4 | Enhancing Tumor | Blue |

**Composite regions:** WT = 1+2+4, TC = 1+4, ET = 4

### Case Directory Layout

```
CASES_DIR/
├── index.json          # Array of case ID strings
├── BraTS2021_XXXXX/
│   ├── flair.nii.gz    # MRI modalities
│   ├── t1.nii.gz
│   ├── t1ce.nii.gz
│   ├── t2.nii.gz
│   ├── gt.nii.gz       # Ground truth (optional)
│   ├── pred.nii.gz     # Model prediction
│   └── metrics.json    # Dice/IoU scores per region
└── ...
```

---

## Notes

- All backend storage is **in-memory** — data is lost on restart. This is suitable for demo and development environments.
- Passwords are hard-coded for the demo accounts (`doctor`/`salynt`, `dr.chen`/`chen2025`, `dr.smith`/`smith2025`).
- For detailed architecture, API specifications, and internal design, see [ARCHITECTURE.md](ARCHITECTURE.md).


## Reference 
BraTs2021
nnUnet
