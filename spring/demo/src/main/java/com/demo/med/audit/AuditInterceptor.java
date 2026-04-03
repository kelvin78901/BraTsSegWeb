package com.demo.med.audit;

import com.demo.med.auth.DemoUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AuditInterceptor implements HandlerInterceptor {

    private static final String START_TIME_ATTR = "__audit_start";

    private final AuditService auditService;

    public AuditInterceptor(AuditService auditService) {
        this.auditService = auditService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute(START_TIME_ATTR, System.currentTimeMillis());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {

        if (!(handler instanceof HandlerMethod)) return;

        String path = request.getRequestURI();
        String method = request.getMethod();
        int status = response.getStatus();

        Long durationMs = null;
        Object startObj = request.getAttribute(START_TIME_ATTR);
        if (startObj instanceof Long start) {
            durationMs = System.currentTimeMillis() - start;
        }

        DemoUser user = (DemoUser) request.getAttribute("demoUser");
        String userId = user != null ? user.getUserId() : "anonymous";
        String role = user != null ? user.getRole().name() : null;

        String action = classifyAction(path, method);

        String detail = null;
        if (ex != null) {
            detail = "exception: " + (ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName());
        } else if (status >= 400) {
            detail = "http_error_" + status;
        }

        auditService.record(action, userId, role, path, method, status, durationMs, detail);
    }

    private String classifyAction(String path, String method) {
        if (path.startsWith("/api/auth/login")) return "LOGIN";
        if (path.startsWith("/api/auth/logout")) return "LOGOUT";
        if (path.startsWith("/api/auth/upload-segment")) return "UPLOAD_SEGMENT";
        if (path.startsWith("/api/auth/me")) return "AUTH_CHECK";
        if (path.startsWith("/api/infer/submit")) return "INFER_SUBMIT";
        if (path.startsWith("/api/infer/status")) return "INFER_STATUS";
        if (path.startsWith("/api/infer/result")) return "INFER_RESULT";
        if (path.startsWith("/api/infer/jobs")) return "INFER_LIST";
        if (path.startsWith("/api/agent/chat")) return "AI_CHAT";
        if (path.startsWith("/api/ai/consult")) return "AI_CONSULT";
        if (path.startsWith("/api/ai/background")) return "AI_BACKGROUND";
        if (path.startsWith("/api/ai/selfcheck")) return "AI_SELFCHECK";
        if (path.startsWith("/api/patient")) return "PATIENT_QUERY";
        if (path.startsWith("/api/models")) return "MODEL_QUERY";
        if (path.startsWith("/api/audit")) return "AUDIT_QUERY";
        return method + "_" + path;
    }
}
