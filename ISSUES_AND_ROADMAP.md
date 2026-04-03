# BraTS Web — Pending Tasks Only

> Last updated: 2025-07-13
> Scope: sidecar (FastAPI/Python) · Spring Boot 3 (Java 17) · Frontend (React 18 + Vite 5 + TypeScript 5.5)
> Note: 本文档仅保留"尚未完成"的任务；历史已完成修复项已移除。

---

## ✅ 已完成（本轮 R5）

| 任务 | 说明 |
|---|---|
| ~~WebConfig `user.dir` 硬编码~~ | 改用 `@Value("${cases.dir:}")` + CASES_DIR 环境变量 + classpath fallback |
| ~~用户角色体系~~ | DemoUser.Role 扩展为 DOCTOR / RESEARCHER / ADMIN |
| ~~前端工程化迁移~~ | 完成 React 18 + Vite 5 + TypeScript 5.5 全量重构（30+ 模块） |
| ~~Stage B 前端全量重构~~ | `frontend/` 工程已建立，覆盖 Login、Patient、Doctor 三大页面 |
| ~~AuthFilter SPA 支持~~ | 简化为 non-API 全放通，React Router 负责客户端路由 |
| ~~SPA View Controllers~~ | WebConfig 添加 `/login`, `/patient`, `/doctor` → `forward:/index.html` |

### React 前端架构（已交付）

```
frontend/
├── vite.config.ts        # Dev proxy + Spring static 输出
├── src/
│   ├── store/            # Zustand (authStore, viewerStore)
│   ├── api/client.ts     # Unified fetch + Bearer auth
│   ├── lib/              # niftiLoader, sliceRenderer, volumeRenderer, markdown
│   ├── components/       # ProtectedRoute, AppHeader, BrainScene, ViewerPanel, ChatPanel, etc.
│   └── pages/            # LoginPage (Three.js), PatientPage (2D+3D viewer), DoctorPage (GT vs Pred)
```

---

## 1) 当前待办（短期）— ✅ 全部完成

| 优先级 | 任务 | 目标交付 | 状态 |
|---|---|---|---|
| P3 | 角色权限边界落地 | 自定义 @RequireRole 注解 + RoleCheckInterceptor，全部 Controller 已标注 | ✅ 完成 |
| P4 | 前端测试基线 | Vitest 单元测试 (15 pass) + Playwright E2E (login.spec.ts) | ✅ 完成 |
| P4 | ErrorBoundary + Retry | ErrorBoundary 组件包裹 App + apiFetch 自动重试 (指数退避, 3 次) | ✅ 完成 |
| P5 | Three.js 代码拆分 | React.lazy() 动态加载 BrainScene, 独立 chunk 471 KB | ✅ 完成 |
| P5 | 清理旧前端文件 | 已删除 login.html / patient.html / doctor.html / 1.html | ✅ 完成 |

## 2) 中期改造（Stage C–D）— ✅ 全部完成

### Stage C（M5–M6）推理平台化 ✅
| 任务 | 说明 | 状态 |
|---|---|---|
| 异步任务模式 | `InferenceJob` + `InferenceJobStore`：jobId + 状态机 (QUEUED→RUNNING→COMPLETED/FAILED) + 24h GC | ✅ 完成 |
| Worker Pool | `InferenceWorkerPool`：`ThreadPoolExecutor` 可配置线程池，转发 sidecar `/segment`，全生命周期跟踪 | ✅ 完成 |
| 异步 API | `InferenceController`：POST submit / GET status / GET result / GET jobs / GET admin/jobs | ✅ 完成 |
| 模型注册表 | `ModelRegistry` + `ModelRegistryController`：4 预注册模型，含版本/后端/校验和/评估指标 | ✅ 完成 |
| 推理元数据 | InferenceJob 含 inputFile/modelId/modelVersion/elapsedMs/errorMessage/metadata map | ✅ 完成 |
| 前端异步推理 | `InferencePanel` + `inferenceStore`：模型选择、异步提交、2s 轮询、任务历史 | ✅ 完成 |
| 配置外部化 | `infer.pool.size=${INFER_POOL_SIZE:2}` 支持环境变量 | ✅ 完成 |

### Stage D（M7–M8）安全与合规升级 ✅
| 任务 | 说明 | 状态 |
|---|---|---|
| 密钥启动验证 | `SecretValidator`：ApplicationReady 事件校验 GEMINI_API_KEY/SIDECAR_SECRET，生产模式强制失败 | ✅ 完成 |
| 审计全链路 | `AuditEvent` + `AuditService` + `AuditInterceptor` + `AuditController`：结构化日志 + 10K 内存环缓冲 | ✅ 完成 |
| 资源级权限 | `ResourcePolicy`：所有权校验 (owner-or-admin)，InferenceController status/result 强制隔离 | ✅ 完成 |
| 全局异常处理 | `GlobalExceptionHandler`：AccessDeniedException→403, IllegalArgumentException→400 | ✅ 完成 |
| 审计管理 API | `GET /api/audit` (admin-only)：按 action/user 过滤审计事件 | ✅ 完成 |

## 3) 长期目标（Stage E–F）

### Stage E（M9–M10）多租户与企业接入
- 接入 OIDC/SAML。
- 落地租户隔离策略（数据与权限）。
- 细化 RBAC 到资源级权限。

### Stage F（M11–M12）运营化与国际化
- 建立 SLA/SLO 驱动的稳定性治理。
- 推进成本优化（存储分层、推理资源弹性）。
- 支持区域化部署与合规策略差异化。

## 4) 质量与发布门禁（待建设）

- 覆盖率门槛：后端 > 80%，前端 > 70%，推理脚本 > 75%。
- 安全门槛：依赖漏洞 Critical/High 清零。
- 性能门槛：关键路径 P95 不回退超过 10%。
- 发布门槛：自动化测试、性能基线、安全扫描全部通过后才能上线。

## 5) 里程碑总览

| 阶段 | 时间 | 目标 | 状态 |
|---|---|---|---|
| Stage A | M1–M2 | 缺陷修复 + 安全加固 | ✅ 完成 (R1–R4) |
| Stage B | M3–M4 | 前端全量重构 | ✅ 完成 (R5) |
| Stage C | M5–M6 | 推理平台化 | ✅ 完成 |
| Stage D | M7–M8 | 安全合规升级 | ✅ 完成 |
| Stage E | M9–M10 | 多租户与企业接入 | 🔲 待启动 |
| Stage F | M11–M12 | 运营化与国际化 | 🔲 待启动 |
