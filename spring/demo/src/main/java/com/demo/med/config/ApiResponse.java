package com.demo.med.config;

import java.util.LinkedHashMap;
import java.util.Map;

public final class ApiResponse {

    private ApiResponse() {}

    public static Map<String, Object> error(String code, String message, String requestId) {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("ok", false);
        resp.put("error", Map.of("code", code, "message", message != null ? message : "unknown error"));
        if (requestId != null) resp.put("requestId", requestId);
        return resp;
    }

    public static Map<String, Object> error(String code, String message) {
        return error(code, message, null);
    }

    public static Map<String, Object> ok(Map<String, Object> data, String requestId) {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("ok", true);
        if (data != null) resp.putAll(data);
        if (requestId != null) resp.put("requestId", requestId);
        return resp;
    }

    public static Map<String, Object> ok(Map<String, Object> data) {
        return ok(data, null);
    }

    public static String requestId(jakarta.servlet.http.HttpServletRequest request) {
        Object id = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
        return id != null ? id.toString() : null;
    }
}
