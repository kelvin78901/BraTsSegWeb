package com.demo.med.audit;

import com.demo.med.auth.DemoUser;
import com.demo.med.auth.RequireRole;
import com.demo.med.config.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/audit")
@RequireRole({DemoUser.Role.ADMIN})
public class AuditController {

    private final AuditService auditService;

    public AuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> listEvents(
            @RequestParam(value = "limit", defaultValue = "100") int limit,
            @RequestParam(value = "action", required = false) String action,
            HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        List<Map<String, Object>> events = auditService.recent(Math.min(limit, 1000), action)
                .stream()
                .map(AuditEvent::toMap)
                .toList();
        return ApiResponse.ok(Map.of("events", events, "count", events.size()), reqId);
    }

    @GetMapping(value = "/user/{userId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> userEvents(
            @PathVariable String userId,
            @RequestParam(value = "limit", defaultValue = "50") int limit,
            HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        List<Map<String, Object>> events = auditService.forUser(userId, Math.min(limit, 500))
                .stream()
                .map(AuditEvent::toMap)
                .toList();
        return ApiResponse.ok(Map.of("userId", userId, "events", events, "count", events.size()), reqId);
    }
}
