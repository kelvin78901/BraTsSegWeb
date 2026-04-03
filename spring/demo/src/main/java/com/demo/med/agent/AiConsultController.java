package com.demo.med.agent;

import com.demo.med.config.ApiResponse;
import com.demo.med.patient.PatientProfileService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.demo.med.auth.DemoUser;
import com.demo.med.auth.RequireRole;
import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/ai")
@RequireRole({DemoUser.Role.DOCTOR, DemoUser.Role.ADMIN})
public class AiConsultController {

    private final GeminiClient geminiClient;
    private final PatientProfileService patientProfileService;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    private static final long BG_CACHE_TTL_MS = 60 * 60 * 1000L;
    private record BgEntry(String value, long expiresAt) {}
    private final Map<String, BgEntry> backgroundCache = new ConcurrentHashMap<>();
    {

        java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "bg-cache-cleanup");
            t.setDaemon(true);
            return t;
        }).scheduleAtFixedRate(() -> {
            long now = System.currentTimeMillis();
            backgroundCache.entrySet().removeIf(e -> e.getValue().expiresAt() < now);
        }, 15, 15, java.util.concurrent.TimeUnit.MINUTES);
    }

    @Value("${sidecar.baseUrl:http://localhost:8000}")
    private String sidecarBaseUrl;

    @Value("${sidecar.secret:}")
    private String sidecarSecret;

    public AiConsultController(GeminiClient geminiClient, PatientProfileService patientProfileService) {
        this.geminiClient = geminiClient;
        this.patientProfileService = patientProfileService;
    }

    @PostMapping(value = "/consult", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> consult(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        String caseId = String.valueOf(body.getOrDefault("caseId", "BraTS2021_00012"));
        String question = String.valueOf(body.getOrDefault("question", "")).trim();
        String modelOverride = null;
        Object modelVal = body.get("model");
        if (modelVal != null) modelOverride = String.valueOf(modelVal);

        String background = null;
        Object bgVal = body.get("background");
        if (bgVal != null) background = String.valueOf(bgVal);
        if (background == null || background.isBlank()) {
            BgEntry cached = backgroundCache.get(caseId);
            if (cached != null && cached.expiresAt() > System.currentTimeMillis()) {
                background = cached.value();
            } else if (cached != null) {
                backgroundCache.remove(caseId);
            }
        }

        Integer sliceZ = null;
        Object sliceVal = body.get("sliceZ");
        if (sliceVal instanceof Number) sliceZ = ((Number) sliceVal).intValue();

        String patientContext = null;
        Object pcVal = body.get("patientContext");
        if (pcVal != null) patientContext = String.valueOf(pcVal);

        try {
            Map<String, Object> patient = patientProfileService.getProfile();
            Map<String, Object> metrics = loadMetrics(caseId);
            Map<String, Object> frames = fetchKeyframes(caseId, sliceZ);
            @SuppressWarnings("unchecked")
            List<Map<String, String>> images = (List<Map<String, String>>) frames.getOrDefault("images", List.of());

            String prompt = buildConsultPrompt(caseId, question, patient, metrics, images, background, patientContext);
            Map<String, Object> gemini = geminiClient.generateConsult(prompt, images, modelOverride);

            Map<String, Object> resp = new HashMap<>();
            resp.put("caseId", caseId);
            resp.put("answer", gemini.get("answer"));
            resp.put("rawText", gemini.get("rawText"));
            resp.put("rawBody", gemini.get("rawBody"));
            resp.put("model", gemini.get("model"));
            resp.put("images", images);
            resp.put("metrics", metrics);
            if (background != null && !background.isBlank()) resp.put("background", background);
            return ApiResponse.ok(resp, reqId);
        } catch (Exception e) {
            return ApiResponse.error("CONSULT_ERROR",
                    e.getMessage() == null ? "AI consult failed" : e.getMessage(), reqId);
        }
    }

    @GetMapping(value = "/selfcheck", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> selfcheck(@RequestParam(name = "testGemini", defaultValue = "true") boolean testGemini) {
        Map<String, Object> out = new HashMap<>();
        Map<String, Object> gem = new HashMap<>();
        Map<String, Object> sc = new HashMap<>();

        gem.put("configured", geminiClient.hasApiKey());
        gem.put("model", geminiClient.getModel());
        gem.put("baseUrl", geminiClient.getBaseUrl());

        String key = geminiClient.getApiKey();
        if (key != null && key.length() > 4) {
            gem.put("apiKeyMasked", key.substring(0, 4) + "****");
        } else {
            gem.put("apiKeyMasked", "MISSING_OR_SHORT");
        }

        sc.put("baseUrl", sidecarBaseUrl);

        try {
            String url = sidecarBaseUrl + "/health";
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .header("X-Sidecar-Key", sidecarSecret != null ? sidecarSecret : "")
                    .GET()
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            sc.put("ok", resp.statusCode() < 400);
            sc.put("status", resp.statusCode());
            sc.put("body", resp.body());
        } catch (Exception e) {
            sc.put("ok", false);
            sc.put("error", e.getMessage());
        }

        if (testGemini && geminiClient.hasApiKey()) {
            try {
                String prompt = "Return minimal valid JSON. Use empty arrays where appropriate.";
                Map<String, Object> g = geminiClient.generateConsult(prompt, List.of());
                gem.put("tested", true);
                gem.put("rawText", g.get("rawText"));
            } catch (Exception e) {
                gem.put("tested", false);
                gem.put("error", e.getMessage());
            }
        } else {
            gem.put("tested", false);
        }

        out.put("ok", Boolean.TRUE.equals(sc.get("ok")) && (Boolean.TRUE.equals(gem.get("tested")) || !testGemini));
        out.put("sidecar", sc);
        out.put("gemini", gem);
        return out;
    }

    @GetMapping(value = "/models", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> listModels(HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        try {
            List<Map<String, Object>> models = geminiClient.listModels();
            Map<String, Object> payload = new HashMap<>();
            payload.put("models", models);
            payload.put("default", geminiClient.getModel());
            return ApiResponse.ok(payload, reqId);
        } catch (Exception e) {
            return ApiResponse.error("MODELS_ERROR",
                    e.getMessage() == null ? "Failed to list models" : e.getMessage(), reqId);
        }
    }

    @PostMapping(value = "/background", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> background(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        String caseId = String.valueOf(body.getOrDefault("caseId", "BraTS2021_00012"));
        String modelOverride = null;
        Object modelVal = body.get("model");
        if (modelVal != null) modelOverride = String.valueOf(modelVal);

        Integer sliceZ = null;
        Object sliceVal = body.get("sliceZ");
        if (sliceVal instanceof Number) sliceZ = ((Number) sliceVal).intValue();

        try {
            Map<String, Object> patient = patientProfileService.getProfile();
            Map<String, Object> metrics = loadMetrics(caseId);
            Map<String, Object> frames = fetchKeyframes(caseId, sliceZ);
            @SuppressWarnings("unchecked")
            List<Map<String, String>> images = (List<Map<String, String>>) frames.getOrDefault("images", List.of());

            String prompt = buildBackgroundPrompt(caseId, patient, metrics, images);

            Map<String, Object> gemini = geminiClient.generateBackground(prompt, images, modelOverride);

            String background = null;
            Object ans = gemini.get("answer");
            if (ans instanceof Map) {
                Object bg = ((Map<?, ?>) ans).get("background");
                if (bg != null) background = String.valueOf(bg);
            }
            if (background == null || background.isBlank()) {
                Object raw = gemini.get("rawText");
                if (raw != null) background = String.valueOf(raw);
            }
            if (background == null) background = "";
            backgroundCache.put(caseId, new BgEntry(background, System.currentTimeMillis() + BG_CACHE_TTL_MS));

            Map<String, Object> resp = new HashMap<>();
            resp.put("caseId", caseId);
            resp.put("background", background);
            resp.put("model", gemini.get("model"));
            return ApiResponse.ok(resp, reqId);
        } catch (Exception e) {
            return ApiResponse.error("BACKGROUND_ERROR",
                    e.getMessage() == null ? "AI background failed" : e.getMessage(), reqId);
        }
    }

    private Map<String, Object> loadMetrics(String caseId) {
        try {
            String path = String.format("static/viewer/cases/%s/metrics.json", caseId);
            ClassPathResource res = new ClassPathResource(path);
            if (!res.exists()) return null;
            try (InputStream in = res.getInputStream()) {
                return mapper.readValue(in, new TypeReference<>() {});
            }
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, Object> fetchKeyframes(String caseId, Integer sliceZ) {
        try {
            String url = sidecarBaseUrl + "/render/keyframes?caseId=" + URLEncoder.encode(caseId, StandardCharsets.UTF_8);
            if (sliceZ != null) url += "&sliceZ=" + sliceZ;

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    .header("X-Sidecar-Key", sidecarSecret != null ? sidecarSecret : "")
                    .GET()
                    .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() >= 400) {
                return Map.of("images", List.of());
            }
            return mapper.readValue(resp.body(), new TypeReference<>() {});
        } catch (Exception e) {
            return Map.of("images", List.of());
        }
    }

    private String buildConsultPrompt(String caseId,
                                     String question,
                                     Map<String, Object> patient,
                                     Map<String, Object> metrics,
                                     List<Map<String, String>> images,
                                     String background,
                                     String patientContext) {
        String patientSummary = (patientContext != null && !patientContext.isBlank())
                ? patientContext
                : buildPatientSummary(patient);
        String metricsSummary = buildMetricsSummary(metrics);
        String imgSummary = images == null ? "0" : String.valueOf(images.size());

        if (question == null || question.isBlank()) {
            question = "Provide key imaging findings, differential, and next steps for a clinician.";
        }

        return "You are a clinical decision support (CDS) assistant for doctors.\n"
                + "IMPORTANT INSTRUCTION: You MUST ONLY base your analysis and answers on the patient data, "
                + "imaging metrics, keyframe images, uploaded documents, and background context provided below. "
                + "Do NOT assume, fabricate, or infer information beyond what is explicitly given. "
                + "If the provided data is insufficient to answer the question, clearly state what additional "
                + "information would be needed.\n\n"
                + "Be helpful and concise, but not robotic. "
                + "Do NOT provide medication dosing or a definitive diagnosis. "
                + "Respond in JSON matching the provided schema (no extra keys).\n\n"
                + "=== CASE DATA ===\n"
                + "Case ID: " + caseId + "\n\n"
                + "-- Patient Information --\n" + patientSummary + "\n\n"
                + "-- Segmentation Metrics --\n" + metricsSummary + "\n\n"
                + "-- Imaging --\n" + imgSummary + " PNG keyframes with segmentation overlay provided.\n"
                + (background == null || background.isBlank() ? "" : "\n-- Background Context --\n" + background + "\n")
                + "\n=== CLINICIAN QUESTION ===\n" + question + "\n";
    }

    private String buildBackgroundPrompt(String caseId,
                                        Map<String, Object> patient,
                                        Map<String, Object> metrics,
                                        List<Map<String, String>> images) {
        String patientSummary = buildPatientSummary(patient);
        String metricsSummary = buildMetricsSummary(metrics);
        String imgSummary = images == null ? "0" : String.valueOf(images.size());

        return "You are a clinical decision support (CDS) assistant for doctors. "
                + "Write a concise case background in natural language without diagnosis or treatment. "
                + "Return JSON matching the provided schema.\n\n"
                + "Case: " + caseId + "\n"
                + "Patient summary (de-identified): " + patientSummary + "\n"
                + "Metrics: " + metricsSummary + "\n"
                + "Images provided: " + imgSummary + " PNG keyframes with segmentation overlay.\n";
    }

    private String buildPatientSummary(Map<String, Object> patient) {
        if (patient == null) return "unknown";
        Object age = patient.get("age");
        Object gender = patient.get("gender");
        String study = "";
        Object studies = patient.get("studies");
        if (studies instanceof List && !((List<?>) studies).isEmpty()) {
            Object s0 = ((List<?>) studies).get(0);
            if (s0 instanceof Map) {
                Map<?, ?> sm = (Map<?, ?>) s0;
                study = String.format("studyId=%s, modality=%s, bodyPart=%s, status=%s",
                        safeStr(sm.get("studyId"), "-"),
                        safeStr(sm.get("modality"), "-"),
                        safeStr(sm.get("bodyPart"), "-"),
                        safeStr(sm.get("status"), "-"));
            }
        }
        return String.format("age=%s, gender=%s, %s", age == null ? "-" : age, gender == null ? "-" : gender, study);
    }

    private String safeStr(Object v, String def) {
        if (v == null) return def;
        String s = String.valueOf(v);
        return s.isBlank() ? def : s;
    }

    private String buildMetricsSummary(Map<String, Object> metrics) {
        if (metrics == null) return "not available";
        try {
            if (metrics.containsKey("regions")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> regions = (Map<String, Object>) metrics.get("regions");
                return String.format("WT dice=%s, TC dice=%s, ET dice=%s",
                        getDice(regions, "WT"), getDice(regions, "TC"), getDice(regions, "ET"));
            }
            Object wt = metrics.get("WT_dice");
            Object tc = metrics.get("TC_dice");
            Object et = metrics.get("ET_dice");
            return String.format("WT dice=%s, TC dice=%s, ET dice=%s", wt, tc, et);
        } catch (Exception e) {
            return "not available";
        }
    }

    private Object getDice(Map<String, Object> regions, String key) {
        Object r = regions.get(key);
        if (r instanceof Map) return ((Map<?, ?>) r).get("dice");
        return null;
    }
}
