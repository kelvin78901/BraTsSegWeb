package com.demo.med.audit;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public record AuditEvent(
        String eventId,
        Instant timestamp,
        String action,
        String userId,
        String role,
        String resource,
        String method,
        int    statusCode,
        Long   durationMs,
        String detail
) {
    public Map<String, Object> toMap() {
        var m = new LinkedHashMap<String, Object>();
        m.put("eventId", eventId);
        m.put("timestamp", timestamp.toString());
        m.put("action", action);
        m.put("userId", userId);
        if (role != null) m.put("role", role);
        m.put("resource", resource);
        m.put("method", method);
        m.put("statusCode", statusCode);
        if (durationMs != null) m.put("durationMs", durationMs);
        if (detail != null && !detail.isBlank()) m.put("detail", detail);
        return m;
    }
}
