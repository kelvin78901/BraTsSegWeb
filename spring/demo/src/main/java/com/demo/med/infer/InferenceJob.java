package com.demo.med.infer;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class InferenceJob {

    public enum Status {
        QUEUED, RUNNING, COMPLETED, FAILED
    }

    private final String jobId;
    private final String userId;
    private final String fileName;
    private final long fileSizeBytes;
    private final String modelId;
    private volatile Status status;
    private final Instant createdAt;
    private volatile Instant startedAt;
    private volatile Instant completedAt;
    private volatile String errorMessage;
    private volatile String errorCode;
    private volatile String backendUsed;
    private volatile String caseId;
    private volatile Map<String, Object> result;
    private final Map<String, String> metadata;

    public InferenceJob(String jobId, String userId, String fileName, long fileSizeBytes, String modelId) {
        this.jobId = jobId;
        this.userId = userId;
        this.fileName = fileName;
        this.fileSizeBytes = fileSizeBytes;
        this.modelId = modelId;
        this.status = Status.QUEUED;
        this.createdAt = Instant.now();
        this.metadata = new ConcurrentHashMap<>();
    }

    public void markRunning() {
        this.status = Status.RUNNING;
        this.startedAt = Instant.now();
    }

    public void markCompleted(String caseId, String backendUsed, Map<String, Object> result) {
        this.status = Status.COMPLETED;
        this.completedAt = Instant.now();
        this.caseId = caseId;
        this.backendUsed = backendUsed;
        this.result = result;
    }

    public void markFailed(String errorCode, String errorMessage) {
        this.status = Status.FAILED;
        this.completedAt = Instant.now();
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    public Long getElapsedMs() {
        if (startedAt == null) return null;
        Instant end = completedAt != null ? completedAt : Instant.now();
        return end.toEpochMilli() - startedAt.toEpochMilli();
    }

    public String getJobId()        { return jobId; }
    public String getUserId()       { return userId; }
    public String getFileName()     { return fileName; }
    public long getFileSizeBytes()  { return fileSizeBytes; }
    public String getModelId()      { return modelId; }
    public Status getStatus()       { return status; }
    public Instant getCreatedAt()   { return createdAt; }
    public Instant getStartedAt()   { return startedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public String getErrorMessage() { return errorMessage; }
    public String getErrorCode()    { return errorCode; }
    public String getBackendUsed()  { return backendUsed; }
    public String getCaseId()       { return caseId; }
    public Map<String, Object> getResult() { return result; }
    public Map<String, String> getMetadata() { return metadata; }

    public Map<String, Object> toStatusMap() {
        var m = new java.util.LinkedHashMap<String, Object>();
        m.put("jobId", jobId);
        m.put("status", status.name());
        m.put("fileName", fileName);
        m.put("fileSizeBytes", fileSizeBytes);
        m.put("modelId", modelId);
        m.put("createdAt", createdAt.toString());
        if (startedAt != null) m.put("startedAt", startedAt.toString());
        if (completedAt != null) m.put("completedAt", completedAt.toString());
        if (getElapsedMs() != null) m.put("elapsedMs", getElapsedMs());
        if (backendUsed != null) m.put("backendUsed", backendUsed);
        if (caseId != null) m.put("caseId", caseId);
        if (errorCode != null) m.put("errorCode", errorCode);
        if (errorMessage != null) m.put("errorMessage", errorMessage);
        if (!metadata.isEmpty()) m.put("metadata", Map.copyOf(metadata));
        return m;
    }

    public Map<String, Object> toResultMap() {
        var m = toStatusMap();
        if (result != null) m.put("result", result);
        return m;
    }
}
