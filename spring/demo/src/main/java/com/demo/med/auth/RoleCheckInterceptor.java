package com.demo.med.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Set;

@Component
public class RoleCheckInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        if (!(handler instanceof HandlerMethod hm)) {
            return true;
        }

        RequireRole annotation = hm.getMethodAnnotation(RequireRole.class);
        if (annotation == null) {
            annotation = hm.getBeanType().getAnnotation(RequireRole.class);
        }
        if (annotation == null) {
            return true;
        }

        DemoUser user = (DemoUser) request.getAttribute("demoUser");
        if (user == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":\"UNAUTHORIZED\"}");
            return false;
        }

        Set<DemoUser.Role> allowed = Set.of(annotation.value());
        if (!allowed.contains(user.getRole())) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":\"FORBIDDEN\",\"message\":\"Role "
                    + user.getRole() + " is not allowed. Required: " + allowed + "\"}");
            return false;
        }

        return true;
    }
}
