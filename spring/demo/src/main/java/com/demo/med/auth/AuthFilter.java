package com.demo.med.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class AuthFilter extends OncePerRequestFilter {

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String path = request.getRequestURI();
    // 放行静态资源、登录接口
    return path.equals("/")
      || path.equals("/index.html")
      || path.equals("/login.html")
      || path.equals("/1.html")
      || path.equals("/patient.html")
      || path.equals("/doctor.html")
      || path.equals("/nifti-reader.js")
      || path.equals("/viewer")
      || path.startsWith("/viewer/")
      || path.startsWith("/assets/")
      || path.startsWith("/favicon")
      || path.startsWith("/api/auth/")
      || path.startsWith("/api/ai/")
      || path.startsWith("/api/agent/");
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String path = request.getRequestURI();

    String auth = request.getHeader(HttpHeaders.AUTHORIZATION);
    String token = null;
    if (auth != null && auth.startsWith("Bearer ")) {
      token = auth.substring("Bearer ".length()).trim();
    }

    DemoUser user = AuthStore.getUserByToken(token);
    if (user == null) {
      if (path.startsWith("/api/")) {
        response.setStatus(401);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"UNAUTHORIZED\"}");
      } else {
        response.sendRedirect("/login.html");
      }
      return;
    }

    request.setAttribute("demoUser", user);
    chain.doFilter(request, response);
  }
}
