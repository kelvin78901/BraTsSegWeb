package com.demo.med.auth;

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

  // Demo doctor accounts — each maps to a case-set root path
  // doctor  / salynt      → /viewer/cases  (default)
  // doctor  / doctor123   → /viewer/cases  (legacy compat)
  // dr.chen / chen2025    → /viewer/cases
  // dr.smith / smith2025  → /viewer/cases
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

  /**
   * Upload a .nii.gz file → forward to Python sidecar for segmentation,
   * return the sidecar JSON response (base64 PNG keyframes).
   */
  @PostMapping(value = "/upload-segment", consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> uploadAndSegment(@RequestParam("file") MultipartFile file) {
    if (file.isEmpty()) {
      return ResponseEntity.badRequest().body("{\"error\":\"empty file\"}");
    }
    try {
      // Save uploaded file to a temp directory
      String tmpDir = System.getProperty("java.io.tmpdir");
      String uid = UUID.randomUUID().toString().substring(0, 8);
      Path uploadDir = Paths.get(tmpDir, "salynt_uploads", uid);
      Files.createDirectories(uploadDir);
      String origName = file.getOriginalFilename();
      if (origName == null || origName.isBlank()) origName = "upload.nii.gz";
      Path dest = uploadDir.resolve(origName);
      file.transferTo(dest.toFile());

      // Call Python sidecar /segment endpoint
      String sidecarUrl = System.getenv("SIDECAR_URL");
      if (sidecarUrl == null || sidecarUrl.isBlank()) sidecarUrl = "http://127.0.0.1:8000";
      URL url = new URL(sidecarUrl + "/segment");
      HttpURLConnection conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("POST");
      conn.setDoOutput(true);
      String boundary = "----SalyntBoundary" + uid;
      conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
      conn.setConnectTimeout(120_000);
      conn.setReadTimeout(300_000);

      try (OutputStream os = conn.getOutputStream()) {
        // write multipart body
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

      // Cleanup temp file
      try { Files.deleteIfExists(dest); Files.deleteIfExists(uploadDir); } catch (Exception ignored) {}

      return ResponseEntity.status(status)
          .contentType(MediaType.APPLICATION_JSON)
          .body(respBody);
    } catch (Exception e) {
      return ResponseEntity.internalServerError()
          .body("{\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}");
    }
  }
}
