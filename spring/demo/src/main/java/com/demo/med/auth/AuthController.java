package com.demo.med.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.*;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

  @Value("${sidecar.baseUrl:http://localhost:8000}")
  private String sidecarBaseUrl;

  @Value("${sidecar.secret:}")
  private String sidecarSecret;

  @PostMapping(value = "/login", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
  public Map<String, Object> login(@RequestBody Map<String, String> body) {
    String username = body.getOrDefault("username", "");
    String password = body.getOrDefault("password", "");

    DemoUser user;
    if ("doctor".equals(username) && ("salynt".equals(password) || "doctor123".equals(password))) {
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

  @RequireRole({DemoUser.Role.DOCTOR, DemoUser.Role.ADMIN})
  @PostMapping(value = "/upload-segment", consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> uploadAndSegment(@RequestParam("file") MultipartFile file) {
    if (file.isEmpty()) {
      return ResponseEntity.badRequest().body("{\"error\":\"empty file\"}");
    }

    String origName = file.getOriginalFilename();
    if (origName == null || origName.isBlank()) origName = "upload.nii.gz";
    String nameLower = origName.toLowerCase();
    if (!nameLower.endsWith(".nii.gz") && !nameLower.endsWith(".nii")) {
      return ResponseEntity.badRequest()
          .body("{\"error\":\"Only NIfTI files (.nii, .nii.gz) are accepted\"}");
    }

    if (file.getSize() > 512L * 1024 * 1024) {
      return ResponseEntity.badRequest()
          .body("{\"error\":\"File too large (max 512 MB)\"}");
    }

    try {

      String tmpDir = System.getProperty("java.io.tmpdir");
      String uid = UUID.randomUUID().toString().substring(0, 8);
      Path uploadDir = Paths.get(tmpDir, "salynt_uploads", uid);
      Files.createDirectories(uploadDir);
      Path dest = uploadDir.resolve(origName);
      file.transferTo(dest.toFile());

      String sidecarUrl = sidecarBaseUrl;
      URL url = new URL(sidecarUrl + "/segment");
      HttpURLConnection conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("POST");
      conn.setDoOutput(true);
      String boundary = "----SalyntBoundary" + uid;
      conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
      if (sidecarSecret != null && !sidecarSecret.isBlank()) {
        conn.setRequestProperty("X-Sidecar-Key", sidecarSecret);
      }
      conn.setConnectTimeout(120_000);
      conn.setReadTimeout(300_000);

      try (OutputStream os = conn.getOutputStream()) {

        PrintWriter writer = new PrintWriter(new OutputStreamWriter(os, "UTF-8"), true);
        writer.append("--").append(boundary).append("\r\n");
        writer.append("Content-Disposition: form-data; name=\"file\"; filename=\"")
            .append(origName).append("\"\r\n");
        writer.append("Content-Type: application/octet-stream\r\n\r\n");
        writer.flush();
        Files.copy(dest, os);
        os.flush();
        writer.append("\r\n--").append(boundary).append("--\r\n");
        writer.flush();
      }

      int status = conn.getResponseCode();
      InputStream is = (status >= 200 && status < 300) ? conn.getInputStream() : conn.getErrorStream();
      String respBody = new String(is.readAllBytes(), "UTF-8");
      is.close();

      try { Files.deleteIfExists(dest); Files.deleteIfExists(uploadDir); } catch (Exception ignored) {}

      return ResponseEntity.status(status)
          .contentType(MediaType.APPLICATION_JSON)
          .body(respBody);
    } catch (Exception e) {
      String safeMsg = e.getMessage() == null ? "upload-segment failed" : e.getMessage().replace("\"", "'");
      return ResponseEntity.internalServerError()
          .body("{\"error\":\"" + safeMsg + "\"}");
    }
  }

  @PostMapping("/logout")
  public Map<String, Object> logout(@RequestHeader(value = "Authorization", required = false) String auth) {
    if (auth != null && auth.startsWith("Bearer ")) {
      String token = auth.substring("Bearer ".length()).trim();
      AuthStore.revokeToken(token);
    }
    return Map.of("ok", true);
  }

  @GetMapping(value = "/me", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Map<String, Object>> me(
      @RequestHeader(value = "Authorization", required = false) String auth) {
    String token = null;
    if (auth != null && auth.startsWith("Bearer ")) {
      token = auth.substring("Bearer ".length()).trim();
    }
    DemoUser user = AuthStore.getUserByToken(token);
    if (user == null) {
      return ResponseEntity.status(401)
          .body(Map.of("ok", false, "error", "INVALID_OR_EXPIRED_TOKEN"));
    }
    return ResponseEntity.ok(Map.of(
        "ok", true,
        "userId", user.getUserId(),
        "displayName", user.getDisplayName(),
        "institution", user.getInstitution()
    ));
  }
}
