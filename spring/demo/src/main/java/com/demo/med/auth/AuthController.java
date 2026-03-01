package com.demo.med.auth;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

  // Demo doctor accounts — each maps to a case-set root path
  // doctor  / doctor123   → /viewer/cases
  // dr.chen / chen2025    → /viewer/cases  (same dataset, separate account)
  // dr.smith / smith2025  → /viewer/cases
  @PostMapping(value = "/login", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
  public Map<String, Object> login(@RequestBody Map<String, String> body) {
    String username = body.getOrDefault("username", "");
    String password = body.getOrDefault("password", "");

    DemoUser user;
    if ("doctor".equals(username) && "doctor123".equals(password)) {
      user = new DemoUser("D001", "Dr. Demo", DemoUser.Role.DOCTOR,
          "/viewer/cases", "Salynt Medical Center");
    } else if ("dr.chen".equals(username) && "chen2025".equals(password)) {
      user = new DemoUser("D002", "Dr. Chen", DemoUser.Role.DOCTOR,
          "/viewer/cases", "Johns Hopkins Neuro-Oncology");
    } else if ("dr.smith".equals(username) && "smith2025".equals(password)) {
      user = new DemoUser("D003", "Dr. Smith", DemoUser.Role.DOCTOR,
          "/viewer/cases", "UCSF Brain Tumor Center");
    } else {
      return Map.of("ok", false, "error", "BAD_CREDENTIALS");
    }

    String token = AuthStore.issueToken(user);
    return Map.of(
        "ok",          true,
        "token",       token,
        "userId",      user.getUserId(),
        "displayName", user.getDisplayName(),
        "institution", user.getInstitution(),
        "caseRoot",    user.getCaseRoot()
    );
  }
}
