package com.demo.med.config;

import com.demo.med.auth.ResourcePolicy;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourcePolicy.AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(
            ResourcePolicy.AccessDeniedException ex, HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        return ResponseEntity.status(403)
                .body(ApiResponse.error("FORBIDDEN", ex.getMessage(), reqId));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(
            IllegalArgumentException ex, HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        return ResponseEntity.badRequest()
                .body(ApiResponse.error("BAD_REQUEST", ex.getMessage(), reqId));
    }
}
