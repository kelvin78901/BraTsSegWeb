package com.demo.med.infer;

import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Component
public class InferenceJobStore {

    public static final int MAX_JOBS_PER_USER = 5;

    private static final long GC_TTL_MS = 24 * 60 * 60 * 1000L;

    private final ConcurrentHashMap<String, InferenceJob> jobs = new ConcurrentHashMap<>();

    public InferenceJobStore() {

        Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "infer-job-gc");
            t.setDaemon(true);
            return t;
        }).scheduleAtFixedRate(this::gc, 30, 30, TimeUnit.MINUTES);
    }

    public void put(InferenceJob job) {
        jobs.put(job.getJobId(), job);
    }

    public InferenceJob get(String jobId) {
        return jobs.get(jobId);
    }

    public long countActiveForUser(String userId) {
        return jobs.values().stream()
                .filter(j -> j.getUserId().equals(userId))
                .filter(j -> j.getStatus() == InferenceJob.Status.QUEUED
                          || j.getStatus() == InferenceJob.Status.RUNNING)
                .count();
    }

    public List<InferenceJob> listForUser(String userId) {
        return jobs.values().stream()
                .filter(j -> j.getUserId().equals(userId))
                .sorted(Comparator.comparing(InferenceJob::getCreatedAt).reversed())
                .toList();
    }

    public List<InferenceJob> listAll() {
        return jobs.values().stream()
                .sorted(Comparator.comparing(InferenceJob::getCreatedAt).reversed())
                .toList();
    }

    private void gc() {
        long now = System.currentTimeMillis();
        jobs.entrySet().removeIf(e -> {
            InferenceJob j = e.getValue();
            if (j.getStatus() != InferenceJob.Status.COMPLETED
                && j.getStatus() != InferenceJob.Status.FAILED) return false;
            if (j.getCompletedAt() == null) return false;
            return now - j.getCompletedAt().toEpochMilli() > GC_TTL_MS;
        });
    }
}
