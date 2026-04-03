package com.demo.med.infer;

import com.demo.med.auth.DemoUser;
import com.demo.med.auth.RequireRole;
import com.demo.med.auth.ResourcePolicy;
import com.demo.med.config.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.*;
import java.util.*;

@RestController
@RequestMapping("/api/infer")
@RequireRole({DemoUser.Role.DOCTOR, DemoUser.Role.ADMIN})
public class InferenceController {

    private final InferenceJobStore jobStore;
    private final InferenceWorkerPool workerPool;
    private final ModelRegistry modelRegistry;

    public InferenceController(InferenceJobStore jobStore,
                               InferenceWorkerPool workerPool,
                               ModelRegistry modelRegistry) {
        this.jobStore = jobStore;
        this.workerPool = workerPool;
        this.modelRegistry = modelRegistry;
    }

    @PostMapping(value = "/submit", consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
                 produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> submit(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "modelId", required = false) String modelId,
            HttpServletRequest request) {

        String reqId = ApiResponse.requestId(request);
        DemoUser user = (DemoUser) request.getAttribute("demoUser");
        String userId = user != null ? user.getUserId() : "anonymous";

        if (file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("INVALID_INPUT", "File is empty", reqId));
        }
        String origName = file.getOriginalFilename();
        if (origName == null || origName.isBlank()) origName = "upload.nii.gz";
        String nameLower = origName.toLowerCase();
        if (!nameLower.endsWith(".nii.gz") && !nameLower.endsWith(".nii")) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("INVALID_INPUT", "Only NIfTI files (.nii, .nii.gz) accepted", reqId));
        }
        if (file.getSize() > 512L * 1024 * 1024) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("INVALID_INPUT", "File too large (max 512 MB)", reqId));
        }

        if (jobStore.countActiveForUser(userId) >= InferenceJobStore.MAX_JOBS_PER_USER) {
            return ResponseEntity.status(429)
                    .body(ApiResponse.error("RATE_LIMIT",
                            "Max " + InferenceJobStore.MAX_JOBS_PER_USER + " concurrent jobs per user", reqId));
        }

        if (modelId == null || modelId.isBlank()) modelId = "default";
        ModelRegistry.ModelInfo resolvedModel = modelRegistry.get(modelId);
        if (resolvedModel == null) {
            resolvedModel = modelRegistry.get("default");
        }
        String effectiveModelId = resolvedModel != null ? resolvedModel.id() : modelId;

        try {

            String tmpDir = System.getProperty("java.io.tmpdir");
            String uid = UUID.randomUUID().toString().substring(0, 8);
            Path uploadDir = Paths.get(tmpDir, "salynt_async", uid);
            Files.createDirectories(uploadDir);
            Path dest = uploadDir.resolve(origName);
            file.transferTo(dest.toFile());

            String jobId = UUID.randomUUID().toString();
            InferenceJob job = new InferenceJob(jobId, userId, origName, file.getSize(), effectiveModelId);
            if (resolvedModel != null) {
                job.getMetadata().put("modelVersion", resolvedModel.version());
                job.getMetadata().put("modelBackend", resolvedModel.backend());
            }
            jobStore.put(job);

            workerPool.submit(job, dest);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("jobId", jobId);
            data.put("status", "QUEUED");
            data.put("modelId", effectiveModelId);
            data.put("fileName", origName);
            data.put("message", "Job submitted. Poll GET /api/infer/status/" + jobId);
            return ResponseEntity.accepted()
                    .body(ApiResponse.ok(data, reqId));

        } catch (Exception e) {
            String msg = e.getMessage() == null ? "submit failed" : e.getMessage().replace("\"", "'");
            return ResponseEntity.internalServerError()
                    .body(ApiResponse.error("SUBMIT_ERROR", msg, reqId));
        }
    }

    @GetMapping(value = "/status/{jobId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> status(
            @PathVariable String jobId, HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        InferenceJob job = jobStore.get(jobId);
        if (job == null) {
            return ResponseEntity.status(404)
                    .body(ApiResponse.error("NOT_FOUND", "Job not found: " + jobId, reqId));
        }

        DemoUser user = (DemoUser) request.getAttribute("demoUser");
        ResourcePolicy.checkOwnership(user, job.getUserId());
        return ResponseEntity.ok(ApiResponse.ok(job.toStatusMap(), reqId));
    }

    @GetMapping(value = "/result/{jobId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> result(
            @PathVariable String jobId, HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        InferenceJob job = jobStore.get(jobId);
        if (job == null) {
            return ResponseEntity.status(404)
                    .body(ApiResponse.error("NOT_FOUND", "Job not found: " + jobId, reqId));
        }

        DemoUser user = (DemoUser) request.getAttribute("demoUser");
        ResourcePolicy.checkOwnership(user, job.getUserId());
        if (job.getStatus() != InferenceJob.Status.COMPLETED) {
            Map<String, Object> data = job.toStatusMap();
            data.put("message", "Job is not yet completed. Current status: " + job.getStatus());
            return ResponseEntity.ok(ApiResponse.ok(data, reqId));
        }
        return ResponseEntity.ok(ApiResponse.ok(job.toResultMap(), reqId));
    }

    @GetMapping(value = "/jobs", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> listJobs(HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        DemoUser user = (DemoUser) request.getAttribute("demoUser");
        String userId = user != null ? user.getUserId() : "anonymous";

        List<Map<String, Object>> list = jobStore.listForUser(userId).stream()
                .map(InferenceJob::toStatusMap)
                .toList();

        return ResponseEntity.ok(ApiResponse.ok(Map.of("jobs", list), reqId));
    }

    @GetMapping(value = "/admin/jobs", produces = MediaType.APPLICATION_JSON_VALUE)
    @RequireRole({DemoUser.Role.ADMIN})
    public ResponseEntity<Map<String, Object>> listAllJobs(HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        List<Map<String, Object>> list = jobStore.listAll().stream()
                .map(InferenceJob::toStatusMap)
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("jobs", list, "total", list.size()), reqId));
    }
}
