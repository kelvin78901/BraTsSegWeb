# BraTS Web — 脑肿瘤分割可视化平台 技术文档

> 面向新同事的项目技术介绍，涵盖架构设计、前后端页面、接口、数据格式、模型使用。

---

## 目录

1. [项目简介](#1-项目简介)
2. [技术架构总览](#2-技术架构总览)
3. [前端页面说明](#3-前端页面说明)
4. [完整接口清单](#4-完整接口清单)
5. [目录结构](#5-目录结构)
6. [技术栈](#6-技术栈)
7. [数据格式规范](#7-数据格式规范)
8. [模型与推理引擎](#8-模型与推理引擎)
9. [AI 助手（Gemini 集成）](#9-ai-助手gemini-集成)
10. [核心脚本说明](#10-核心脚本说明)
11. [部署与启动](#11-部署与启动)

---

## 1. 项目简介

本项目是一个针对 **BraTS 2021** 脑肿瘤 MRI 数据集的端到端分割可视化与在线推断系统，面向**临床医生**和**研究人员**两类用户，功能包括：

- 批量预处理 BraTS 数据，自动计算 Dice/IoU 等分割指标
- 在浏览器中交互式浏览多模态 MRI（T1/T1ce/T2/FLAIR），三视图对比 GT vs 预测
- 支持上传 `.nii.gz` MRI 文件，在线 AI 推断脑肿瘤分割并可视化
- 集成 **Google Gemini** 大模型，提供影像分析报告生成与多轮临床对话助手

---

## 2. 技术架构总览

```
┌──────────────────────────────────────────────────────────────────────┐
│                         浏览器（前端）                                 
│                                                                       
│  【生产路由 - Spring Boot 托管】         【开发/演示路由】               
│  /login.html    → 登录页（Three.js 大脑动画）                          
│  /doctor.html   → 医生工作站（多 case 浏览 + 指标）                    
│  /patient.html  → 患者门户（单 case + AI 助手 + 上传推断）              
│                                         /demo_site/explorer.html       
│                                         /demo_site/patient_portal.html 
└──────────┬─────────────────────────────────────────────┬──────────────┘
           │  /api/**  (JSON REST)                        │  /viewer/cases/** (静态 NIfTI)
           │  Authorization: Bearer token                 │  fetch(.nii.gz)
           ▼                                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Spring Boot (Java 17)                              
│  auth/AuthController        → POST /api/auth/login                    
│                               POST /api/auth/upload-segment           
│  agent/AgentController      → POST /api/agent/chat  (多轮对话)        
│  agent/AiConsultController  → POST /api/ai/consult                    
│                               POST /api/ai/background                 
│                               GET  /api/ai/selfcheck                  
│  patient/PatientController  → GET  /api/patient/me                    
│  config/WebConfig           → /viewer/cases/** 静态资源路由            
└──────────┬───────────────────────────────────────────────────────────┘
           │  HTTP 代理 (SIDECAR_URL，默认 :5000)
           │  GET /render/keyframes (Spring 拉取供 Gemini 使用)
           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Python Sidecar (FastAPI / Uvicorn)                   
│  POST /segment          → 接收 .nii.gz，运行推断，返回 PNG base64      
│  GET  /render/keyframes → 渲染已持久化 case 的轴/冠/矢切片              
│  GET  /health           → 健康检查                                    
└──────────────────────────────────────────────────────────────────────┘
           │  subprocess（自动降级）
           ├─ 1. nnU-Net CLI
           ├─ 2. ONNX Runtime  ← 推荐生产
           └─ 3. MONAI PyTorch
```

**两套前端的关系：**

| 位置 | 用途 | 需要 Spring Boot？ |
|------|------|-------------------|
| `demo_site/` | 纯静态演示，双击即可打开，无登录 | 否，`python serve.py` 即可 |
| `spring/.../static/` | 完整产品前端，含登录/鉴权/AI 助手 | 是 |

---

## 3. 前端页面说明

### 3.1 生产前端（Spring Boot 托管 `/static/`）

#### `login.html` — 登录页
- **Three.js（WebGL）** 渲染脑血管 3D 动画背景
- 表单提交 `POST /api/auth/login`，成功后将 `token` + 用户信息写入 `localStorage`
- 根据角色跳转：`/doctor.html`（医生）

#### `doctor.html` — 医生工作站
- 顶部检查 `localStorage` 中的 token，未登录跳转 `/login.html`
- **多 case 浏览**：下拉选 case，多模态切换（T1/T2/FLAIR/T1ce）
- **三视图**（Axial / Coronal / Sagittal）渲染：fetch `/viewer/cases/{caseId}/{mod}.nii.gz` → `nifti-reader.js` 解析 → Canvas 绘制
- **四列对比**：Raw / GT Overlay / Pred Overlay / Diff（FP 红 / FN 蓝）
- **ROI Zoom**：自动计算肿瘤 BBox 放大显示
- **指标 KPI 卡片**：Dice/IoU/Precision/Recall + 明细表格

#### `patient.html` — 患者门户（AI 工作站）
- 登录保护；调用 `GET /api/patient/me` 加载患者基本信息
- **2D 切片**（轴状面 Canvas）+ **3D 体渲染**（Canvas 实现的最大强度投影 MIP）
- **文件上传**：拖拽或点击，`POST /api/auth/upload-segment`，返回 base64 PNG 展示推断结果
- **AI 助手侧边栏**（详见第 9 节）：自由对话 / 结构化咨询 / 自检
- 模型选择器：`gemini-3-flash-preview` / `gemini-3-pro-preview`

---

### 3.2 演示前端（`demo_site/`，无需登录）

#### `explorer.html` — 研究者视图
- 无需后端，直接 fetch `./data/` 下的静态 `.nii.gz` + `metrics.json`
- 功能与 `doctor.html` 类似，但无登录，适合本地调试/演示

#### `patient_portal.html` — 演示门户
- 支持上传 `.nii.gz`，直接调用 Sidecar `POST /segment`（跳过 Spring Boot）

---

## 4. 完整接口清单

### 4.1 Spring Boot REST 接口

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 登录，Body: `{username, password}` → `{ok, token, userId, displayName, institution, caseRoot}` |
| `/api/auth/upload-segment` | POST (multipart) | 上传 `.nii.gz` → 代理至 Sidecar `/segment` → 返回 PNG base64 + metadata |
| `/api/agent/chat` | POST | 多轮自由对话。Body: `{caseId, message, model?, background?}` → `{ok, reply, model}` |
| `/api/ai/consult` | POST | 结构化影像咨询。Body: `{caseId, question, sliceZ?, model?, background?}` → `{ok, answer:{findings,differential,next_steps}, rawText}` |
| `/api/ai/background` | POST | 预生成 case 背景摘要（内存缓存）。Body: `{caseId, sliceZ?, model?}` → `{ok, background}` |
| `/api/ai/selfcheck` | GET | 验证 Gemini API Key + Sidecar 连通性。→ `{ok, sidecar:{ok,status}, gemini:{configured,tested}}` |
| `/api/patient/me` | GET | 返回 Mock 患者数据（姓名/年龄/就诊历史/关怀团队） |

**上传推断响应格式：**
```json
{
  "ok": true,
  "images": [
    { "name": "axial_mid.png",       "mime": "image/png", "b64": "..." },
    { "name": "coronal_mid.png",     "mime": "image/png", "b64": "..." },
    { "name": "sagittal_mid.png",    "mime": "image/png", "b64": "..." },
    { "name": "axial_max_tumor.png", "mime": "image/png", "b64": "..." }
  ],
  "meta": {
    "shape": [240, 240, 155],
    "axialMaxZ": 78,
    "backend": "onnx",
    "savedCase": { "caseId": "UPLOAD_20260328_123456_ABC123" }
  }
}
```

---

### 4.2 Python Sidecar 接口（内部，Spring Boot 调用）

| 路径 | 方法 | 说明 |
|------|------|------|
| `POST /segment` | multipart | 接收 `.nii.gz`，推断，返回 4 张 PNG（base64）+ metadata；同时持久化 case 到 `CASES_DIR` |
| `GET  /render/keyframes?caseId=&sliceZ=` | GET | 渲染已有 case 的切片图（供 `AiConsultController` 调 Gemini 时抓图用） |
| `GET  /health` | GET | `{"ok": true, "casesDir": "...", "casesDirExists": true}` |

---

### 4.3 静态资源路由（Spring Boot `WebConfig`）

| URL 前缀 | 来源 | 说明 |
|----------|------|------|
| `/viewer/cases/**` | 文件系统 `$CASES_DIR/` → classpath fallback | 优先文件系统（支持运行时上传新 case 立刻可见） |
| `/data/**` | classpath `/static/viewer/cases/` | 旧路由兼容 |
| `/*.html`、`/assets/**`、`/nifti-reader.js` | classpath `/static/` | 前端页面及公共资源 |

---

## 5. 目录结构

```
brats_web/
│
├── 【演示站点 - 无需后端】
├── demo_site/
│   ├── explorer.html           # 研究者视图
│   ├── patient_portal.html     # 演示门户
│   ├── nifti-reader.js
│   └── data/
│       ├── index.json
│       ├── metrics_summary.csv / .json
│       └── BraTS2021_XXXXX/    # *.nii.gz + *.gif + metrics.json
│
├── 【Python 推断服务】
├── sidecar/
│   ├── app.py                  # FastAPI 主应用
│   ├── onnx_brats_infer.py     # ONNX 滑动窗口推断
│   ├── open_brats_infer.py     # MONAI PyTorch 推断
│   ├── export_onnx.py          # 一次性 PT → ONNX 导出
│   ├── requirements.txt        # 完整依赖（含 torch/monai）
│   ├── requirements-cpu.txt    # CPU-only 最小依赖（生产推荐）
│   └── models/monai_brats/
│       ├── model.pt
│       └── model.onnx
│
├── 【Spring Boot 生产应用】
├── spring/demo/src/main/
│   ├── java/com/demo/med/
│   │   ├── auth/
│   │   │   ├── AuthController.java    # 登录 + 上传代理
│   │   │   ├── AuthStore.java         # Token 内存存储
│   │   │   └── DemoUser.java
│   │   ├── agent/
│   │   │   ├── AgentController.java   # 多轮对话
│   │   │   ├── AiConsultController.java  # 影像咨询 + background
│   │   │   └── GeminiClient.java      # Gemini API 封装
│   │   ├── patient/PatientController.java
│   │   ├── config/
│   │   │   ├── WebConfig.java         # 静态资源路由
│   │   │   └── MultipartConfig.java
│   │   └── MedDemoApplication.java
│   └── resources/static/
│       ├── login.html                 # 登录页（Three.js）
│       ├── doctor.html                # 医生工作站
│       ├── patient.html               # 患者门户 + AI 助手
│       ├── nifti-reader.js
│       ├── assets/viewer.css          # 共享样式
│       └── viewer/cases/              # case 数据（CASES_DIR）
│
├── 【数据预处理脚本】
├── build_brats_web.py
├── build_cases.py / build_index.py / compute_metrics.py
├── make_gifs.py / make_gifs_triview.py
└── serve.py                    # 本地开发静态服务器
```

---

## 6. 技术栈

### 6.1 前端（纯原生，无框架）

| 技术 | 说明 |
|------|------|
| HTML5 / CSS3 / Vanilla JS | ES2020+，无 npm / Webpack，可直接打开 |
| **Canvas 2D API** | MRI 切片渲染核心，逐像素操作 `ImageData` |
| **nifti-reader.js** | 浏览器端 NIfTI 解析（gzip 解压 + header 解析 + voxel 读取） |
| **Three.js** | 登录页 3D 脑血管动画（WebGL） |
| CSS Grid / CSS 变量 | 响应式布局，Dark Mode |
| Fetch API | 所有 HTTP 请求，含 FormData 文件上传 |

### 6.2 后端 — Spring Boot

| 技术 | 说明 |
|------|------|
| Java 17 + Spring Boot 3 | Web MVC + REST |
| Jackson | JSON 序列化 |
| Java HttpClient (JDK 内置) | 调用 Gemini API，无额外依赖 |
| ConcurrentHashMap | 内存存储 token / 对话历史 / background 缓存 |

### 6.3 后端 — Python Sidecar

| 技术 | 说明 |
|------|------|
| Python 3.10+ / FastAPI / Uvicorn | REST API，支持 async |
| nibabel | NIfTI 读写 |
| NumPy / Pillow | 体素处理、切片归一化、PNG 编码 |
| onnxruntime | CPU 推断引擎（推荐） |
| torch + monai | 备用推断（可选安装） |

---

## 7. 数据格式规范

### 7.1 NIfTI 体积（`.nii.gz`）

每个 case 目录下的文件：

| 文件 | 内容 | 数据类型 |
|------|------|---------|
| `flair.nii.gz` | FLAIR 模态 | float32 |
| `t1.nii.gz` | T1 模态 | float32 |
| `t1ce.nii.gz` | T1 增强模态 | float32 |
| `t2.nii.gz` | T2 模态 | float32 |
| `gt.nii.gz` | Ground Truth 分割标签 | int16 |
| `pred.nii.gz` | 模型预测分割 | int16 |

**体积尺寸：** 240 × 240 × 155 voxels（BraTS 2021 标准，1mm 各向同性）

**分割标签值：**

| 值 | 区域 | 可视化颜色 |
|----|------|-----------|
| `0` | 背景 | 透明 |
| `1` | Necrotic Core（坏死核心） | 红色 |
| `2` | Peritumoral Edema（瘤周水肿） | 绿色 |
| `4` | Enhancing Tumor（增强肿瘤） | 蓝色 |

**三大临床子区域：**

| 缩写 | 全称 | 标签组成 |
|------|------|---------|
| WT | Whole Tumor | {1, 2, 4} |
| TC | Tumor Core | {1, 4} |
| ET | Enhancing Tumor | {4} |

---

### 7.2 指标文件

**`metrics.json`（per-case）：**
```json
{
  "WT_dice": 0.892, "WT_iou": 0.806,
  "TC_dice": 0.764, "TC_iou": 0.618,
  "ET_dice": 0.731, "ET_iou": 0.576,
  "label_1_dice": 0.0, "label_2_dice": 0.87, "label_4_dice": 0.73,
  "gt_nonzero_voxels": 57305, "pred_nonzero_voxels": 61527
}
```

**`metrics_summary.csv`**：所有 case 汇总一行一条，可直接 Pandas/Excel 分析。

**`index.json`**：case ID 字符串数组，前端下拉列表数据源。

---

### 7.3 GIF 动画（预览）

| 文件 | 内容 |
|------|------|
| `gt.gif` / `pred.gif` | GT / Pred 逐切片动画 |
| `merged.gif` | GT + Pred 并排对比 |
| `triview_flair/t1/t1ce/t2.gif` | 各模态三视图动画 |

---

## 8. 模型与推理引擎

### 8.1 模型架构 — MONAI SegResNet

```
输入：(1, 4, H, W, D)     ← 4通道多模态 MRI（T1/T1ce/T2/FLAIR）
         ↓
  SegResNet Encoder-Decoder
  blocks_down=[1,2,2,4]  blocks_up=[1,1,1]  init_filters=16  dropout=0.2
         ↓
输出：(1, 3, H, W, D)     ← 3通道 logits (TC / WT / ET)
         ↓
  sigmoid > 0.5 → 组合 → 标签图 {0, 1, 2, 4}
```

权重来自 HuggingFace：[MONAI/brats_mri_segmentation](https://huggingface.co/MONAI/brats_mri_segmentation)

---

### 8.2 推断后端三级降级

| 优先级 | 后端 | 精度 | 要求 |
|--------|------|------|------|
| 1 | **nnU-Net** CLI | 最高 | nnU-Net 完整安装 + GPU |
| 2 | **ONNX Runtime** | 中 | `onnxruntime`，≥2GB RAM，**推荐生产** |
| 3 | **MONAI PyTorch** | 中 | `torch + monai`，自动下载权重 |

通过环境变量 `SEG_BACKEND=auto/nnunet/onnx/open` 控制，默认 `auto` 顺序降级。

---

### 8.3 ONNX 滑动窗口推断流程

```
输入 (4, H, W, D)
  → 不足 roi_size 时零填充
  → 枚举滑窗（roi=128³，overlap=0.25）
  → 每个窗口送入 ONNX Session，累加 logits
  → 均值 → sigmoid → {0,1,2,4} 标签图
  → 保存 pred.nii.gz（继承原始 affine/header）
```

**ONNX 模型导出（一次性）：**
```bash
python sidecar/export_onnx.py \
  --model-path sidecar/models/monai_brats/model.pt \
  --output     sidecar/models/monai_brats/model.onnx
```

---

### 8.4 渲染逻辑（后端 Python）

渲染每张 MRI 切片的 overlay PNG：

```python
# 1. 1-99 百分位归一化
lo, hi = np.percentile(slice, [1, 99])
gray = np.clip((slice - lo) / (hi - lo), 0, 1) * 255

# 2. 颜色 overlay（alpha=0.35）
for label, color in {1: RED, 2: GREEN, 4: BLUE}.items():
    mask = seg == label
    output[mask] = 0.65 * output[mask] + 0.35 * color

# 3. PNG → base64 返回前端
```

---

## 9. AI 助手（Gemini 集成）

### 9.1 完整数据流

```
patient.html
  │
  ├─ 切换 case ──→ POST /api/ai/background
  │                  ├─ GET Sidecar /render/keyframes  (拿 MRI 切片 PNG)
  │                  ├─ 读 classpath metrics.json
  │                  └─ GeminiClient.generateBackground
  │                       → 摘要文字，缓存 backgroundCache[caseId]
  │
  ├─ 发消息 ─────→ POST /api/agent/chat
  │                  ├─ 读 chatHistory[userId:caseId]（内存，最近 20 轮）
  │                  ├─ 追加用户消息
  │                  └─ GeminiClient.generateChat
  │                       systemInstruction = background + 临床指引
  │                       → 回复文本，写回历史
  │
  └─ 点 Consult ──→ POST /api/ai/consult
                     ├─ GET Sidecar /render/keyframes
                     ├─ 读 metrics.json + /api/patient/me
                     └─ GeminiClient.generateConsult（多模态：文字+PNG）
                          → 结构化 JSON：findings / differential / next_steps
```

---

### 9.2 GeminiClient 三种调用模式

| 方法 | temperature | 响应格式 | 用途 |
|------|------------|---------|------|
| `generateConsult` | 0.2 | 强制 JSON Schema | 影像报告、鉴别诊断 |
| `generateBackground` | 0.3 | JSON Schema | case 背景摘要预加载 |
| `generateChat` | 0.75 | 纯文本 | 多轮自由问答 |

**多模态：** MRI 切片 PNG 通过 `inlineData.mimeType=image/png` 传给 Gemini，模型可直接「看图」分析。

**对话历史：** `ConcurrentHashMap<userId:caseId, List>`，内存存储，重启清空，最多保留 20 轮。

---

### 9.3 配置

```properties
# application.properties 或环境变量
gemini.apiKey=<GEMINI_API_KEY>        # 必填
gemini.model=gemini-3-flash-preview   # 默认模型
gemini.baseUrl=https://generativelanguage.googleapis.com
sidecar.baseUrl=http://localhost:8000
```

---

### 9.4 演示账号

| 账号 | 密码 | 机构 |
|------|------|------|
| `doctor` | `salynt` | Salynt Medical Center |
| `dr.chen` | `chen2025` | Johns Hopkins Neuro-Oncology |
| `dr.smith` | `smith2025` | UCSF Brain Tumor Center |

Token 存于 `localStorage`，Spring 拦截器（`AuthStore`）校验。

---

## 10. 核心脚本说明

| 脚本 | 用途 | 运行时机 |
|------|------|---------|
| `build_brats_web.py` | 原始 BraTS + nnU-Net 输出 → 生成 `data/` 资产（nii.gz + metrics.json + index.json） | 数据准备，一次性 |
| `build_cases.py` | 构建/更新 case 目录 | 数据准备 |
| `build_index.py` | 扫描目录生成 `index.json` | 数据准备 |
| `compute_metrics.py` | 独立计算 Dice/IoU | 按需 |
| `make_gifs.py` | 生成 GT/Pred/merged GIF | 数据准备 |
| `make_gifs_triview.py` | 生成三视图 GIF | 数据准备 |
| `sidecar/app.py` | FastAPI 推断 API（常驻服务） | 运行时 |
| `sidecar/export_onnx.py` | PT → ONNX 导出（一次性） | 部署前 |
| `serve.py` | 轻量 HTTP 静态服务器（开发用） | 本地开发 |

---

## 11. 部署与启动

### 11.1 纯静态演示（无需后端）

```bash
cd brats_web
python serve.py
# 访问 http://127.0.0.1:8000/demo_site/explorer.html
```

### 11.2 启动 Python Sidecar

```bash
cd sidecar
# CPU-only（推荐）
pip install -r requirements-cpu.txt
uvicorn app:app --host 0.0.0.0 --port 5000

# 完整（含 nnU-Net）
pip install -r requirements.txt
SEG_BACKEND=nnunet uvicorn app:app --host 0.0.0.0 --port 5000
```

### 11.3 启动 Spring Boot

```bash
cd spring/demo
export GEMINI_API_KEY=your_key_here
export SIDECAR_URL=http://127.0.0.1:5000

./mvnw spring-boot:run
# 访问 http://localhost:8080/login.html
```

### 11.4 关键环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SEG_BACKEND` | `auto` | 推断后端：`nnunet` / `onnx` / `open` / `auto` |
| `CASES_DIR` | `spring/.../viewer/cases` | case 数据目录，Sidecar 和 Spring 共用 |
| `SIDECAR_URL` | `http://127.0.0.1:5000` | Spring Boot 调用 Sidecar 的地址 |
| `ONNX_MODEL_PATH` | `models/monai_brats/model.onnx` | ONNX 模型路径 |
| `MAX_UPLOAD_BYTES` | `536870912`（512MB）| 最大上传体积 |
| `gemini.apiKey` | —（必填）| Google Gemini API Key |
| `gemini.model` | `gemini-3-flash-preview` | 默认 Gemini 模型 |

---

*文档生成时间：2026-03-28*
