package com.demo.med.audit;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.logging.Logger;

@Service
public class AuditService {

    private static final Logger log = Logger.getLogger(AuditService.class.getName());
    private static final int MAX_EVENTS = 10_000;

    private final Deque<AuditEvent> events = new ConcurrentLinkedDeque<>();

    public void record(AuditEvent event) {
        events.addFirst(event);

        while (events.size() > MAX_EVENTS) {
            events.pollLast();
        }

        log.info(formatLogLine(event));
    }

    public void record(String action, String userId, String role,
                       String resource, String method, int statusCode,
                       Long durationMs, String detail) {
        record(new AuditEvent(
                UUID.randomUUID().toString(),
                Instant.now(),
                action, userId, role, resource, method, statusCode, durationMs, detail
        ));
    }

    public List<AuditEvent> recent(int limit, String actionFilter) {
        return events.stream()
                .filter(e -> actionFilter == null || actionFilter.isBlank()
                          || e.action().equalsIgnoreCase(actionFilter))
                .limit(limit)
                .toList();
    }

    public List<AuditEvent> forUser(String userId, int limit) {
        return events.stream()
                .filter(e -> userId.equals(e.userId()))
                .limit(limit)
                .toList();
    }

    private String formatLogLine(AuditEvent e) {
        return String.format(
                "[AUDIT] action=%s user=%s role=%s resource=%s method=%s status=%d duration=%s detail=%s",
                e.action(), e.userId(), e.role(),
                e.resource(), e.method(), e.statusCode(),
                e.durationMs() != null ? e.durationMs() + "ms" : "-",
                e.detail() != null ? e.detail() : "-"
        );
    }
}
