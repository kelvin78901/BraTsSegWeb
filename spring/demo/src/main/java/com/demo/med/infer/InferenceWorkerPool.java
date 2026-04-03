package com.demo.med.infer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.*;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.logging.Level;
import java.util.logging.Logger;

@Component
public class InferenceWorkerPool {

    private static final Logger log = Logger.getLogger(InferenceWorkerPool.class.getName());

    private final ExecutorService executor;
    private final InferenceJobStore jobStore;

    @Value("${sidecar.baseUrl:http://localhost:8000}")
    private String sidecarBaseUrl;

    @Value("${sidecar.secret:}")
    private String sidecarSecret;

    public InferenceWorkerPool(
            InferenceJobStore jobStore,
            @Value("${infer.pool.size:2}") int poolSize) {
        this.jobStore = jobStore;
        this.executor = new ThreadPoolExecutor(
                poolSize, poolSize,
                60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(100),
                r -> {
                    Thread t = new Thread(r, "infer-worker");
                    t.setDaemon(true);
                    return t;
                },
                new ThreadPoolExecutor.AbortPolicy()
        );
    }

    public void submit(InferenceJob job, Path filePath) {
        executor.submit(() -> executeJob(job, filePath));
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    private void executeJob(InferenceJob job, Path filePath) {
        job.markRunning();
        log.info(String.format("Job %s RUNNING: file=%s model=%s",
                job.getJobId(), job.getFileName(), job.getModelId()));

        try {

            String uid = UUID.randomUUID().toString().substring(0, 8);
            String boundary = "----SalyntAsync" + uid;

            URL url = new URL(sidecarBaseUrl + "/segment");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
            if (sidecarSecret != null && !sidecarSecret.isBlank()) {
                conn.setRequestProperty("X-Sidecar-Key", sidecarSecret);
            }
            conn.setConnectTimeout(120_000);
            conn.setReadTimeout(600_000);

            try (OutputStream os = conn.getOutputStream()) {
                PrintWriter writer = new PrintWriter(new OutputStreamWriter(os, "UTF-8"), true);
                writer.append("--").append(boundary).append("\r\n");
                writer.append("Content-Disposition: form-data; name=\"file\"; filename=\"")
                      .append(job.getFileName()).append("\"\r\n");
                writer.append("Content-Type: application/octet-stream\r\n\r\n");
                writer.flush();
                Files.copy(filePath, os);
                os.flush();
                writer.append("\r\n--").append(boundary).append("--\r\n");
                writer.flush();
            }

            int status = conn.getResponseCode();
            InputStream is = (status >= 200 && status < 300)
                    ? conn.getInputStream() : conn.getErrorStream();
            String respBody = new String(is.readAllBytes(), "UTF-8");
            is.close();

            if (status >= 400) {
                job.markFailed("SIDECAR_ERROR",
                        "Sidecar returned " + status + ": " + truncate(respBody, 500));
                log.warning(String.format("Job %s FAILED: sidecar %d", job.getJobId(), status));
                return;
            }

            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = mapper.readValue(respBody,
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});

            Boolean ok = (Boolean) parsed.get("ok");
            if (ok == null || !ok) {
                job.markFailed("INFERENCE_ERROR",
                        String.valueOf(parsed.getOrDefault("error", "unknown error")));
                return;
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> meta = (Map<String, Object>) parsed.getOrDefault("meta", Map.of());
            String backend = String.valueOf(meta.getOrDefault("backend", "unknown"));

            @SuppressWarnings("unchecked")
            Map<String, Object> savedCase = (Map<String, Object>) meta.getOrDefault("savedCase", Map.of());
            String caseId = String.valueOf(savedCase.getOrDefault("caseId", ""));

            job.getMetadata().put("inputShape", String.valueOf(meta.getOrDefault("shape", "?")));
            job.getMetadata().put("axialMaxZ", String.valueOf(meta.getOrDefault("axialMaxZ", "?")));

            job.markCompleted(caseId, backend, parsed);
            log.info(String.format("Job %s COMPLETED: case=%s backend=%s elapsed=%dms",
                    job.getJobId(), caseId, backend, job.getElapsedMs()));

        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            job.markFailed("WORKER_ERROR", truncate(msg, 500));
            log.log(Level.WARNING, "Job " + job.getJobId() + " FAILED with exception", e);
        } finally {

            try { Files.deleteIfExists(filePath); } catch (Exception ignored) {}
            try {
                Path parent = filePath.getParent();
                if (parent != null && parent.getFileName() != null
                        && parent.getFileName().toString().startsWith("salynt_")) {
                    Files.deleteIfExists(parent);
                }
            } catch (Exception ignored) {}
        }
    }

    private static String truncate(String s, int maxLen) {
        return (s != null && s.length() > maxLen) ? s.substring(0, maxLen) + "..." : s;
    }
}
