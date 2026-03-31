package com.demo.med.agent;

import com.demo.med.patient.PatientController;
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

@RestController
@RequestMapping("/api/ai")
public class AiConsultController {

    private final GeminiClient geminiClient;
    private final PatientController patientController;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final Map<String, String> backgroundCache = new ConcurrentHashMap<>();

    @Value("${sidecar.baseUrl:http://localhost:8000}")
    private String sidecarBaseUrl;

    public AiConsultController(GeminiClient geminiClient, PatientController patientController) {
        this.geminiClient = geminiClient;
        this.patientController = patientController;
    }

    @PostMapping(value = "/consult", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> consult(@RequestBody Map<String, Object> body) {
        String caseId = String.valueOf(body.getOrDefault("caseId", "BraTS2021_00012"));
        String question = String.valueOf(body.getOrDefault("question", "")).trim();
        String modelOverride = null;
        Object modelVal = body.get("model");
        if (modelVal != null) modelOverride = String.valueOf(modelVal);

        String background = null;
        Object bgVal = body.get("background");
        if (bgVal != null) background = String.valueOf(bgVal);
        if (background == null || background.isBlank()) {
            background = backgroundCache.get(caseId);
        }

        Integer sliceZ = null;
        Object sliceVal = body.get("sliceZ");
        if (sliceVal instanceof Number) sliceZ = ((Number) sliceVal).intValue();

        try {
            Map<String, Object> patient = patientController.me(null);
            Map<String, Object> metrics = loadMetrics(caseId);
            Map<String, Object> frames = fetchKeyframes(caseId, sliceZ);
            @SuppressWarnings("unchecked")
            List<Map<String, String>> images = (List<Map<String, String>>) frames.getOrDefault("images", List.of());

            String prompt = buildConsultPrompt(caseId, question, patient, metrics, images, background);
            Map<String, Object> gemini = geminiClient.generateConsult(prompt, images, modelOverride);

            Map<String, Object> resp = new HashMap<>();
            resp.put("ok", true);
            resp.put("caseId", caseId);
            resp.put("answer", gemini.get("answer"));
            resp.put("rawText", gemini.get("rawText"));
            resp.put("rawBody", gemini.get("rawBody"));
            resp.put("model", gemini.get("model"));
            resp.put("images", images);
            resp.put("metrics", metrics);
            if (background != null && !background.isBlank()) resp.put("background", background);
            return resp;
        } catch (Exception e) {
            return Map.of(
                    "ok", false,
                    "error", e.getMessage() == null ? "AI consult failed" : e.getMessage()
            );
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

    @PostMapping(value = "/background", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> background(@RequestBody Map<String, Object> body) {
        String caseId = String.valueOf(body.getOrDefault("caseId", "BraTS2021_00012"));
        String modelOverride = null;
        Object modelVal = body.get("model");
        if (modelVal != null) modelOverride = String.valueOf(modelVal);

        Integer sliceZ = null;
        Object sliceVal = body.get("sliceZ");
        if (sliceVal instanceof Number) sliceZ = ((Number) sliceVal).intValue();

        try {
            Map<String, Object> patient = patientController.me(null);
            Map<String, Object> metrics = loadMetrics(caseId);
            Map<String, Object> frames = fetchKeyframes(caseId, sliceZ);
            @SuppressWarnings("unchecked")
            List<Map<String, String>> images = (List<Map<String, String>>) frames.getOrDefault("images", List.of());

            String prompt = buildBackgroundPrompt(caseId, patient, metrics, images);

            // IMPORTANT: background schema is different from consult schema.
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
            backgroundCache.put(caseId, background);

            Map<String, Object> resp = new HashMap<>();
            resp.put("ok", true);
            resp.put("caseId", caseId);
            resp.put("background", background);
            resp.put("model", gemini.get("model"));
            return resp;
        } catch (Exception e) {
            return Map.of(
                    "ok", false,
                    "error", e.getMessage() == null ? "AI background failed" : e.getMessage()
            );
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
                                     String background) {
        String patientSummary = buildPatientSummary(patient);
        String metricsSummary = buildMetricsSummary(metrics);
        String imgSummary = images == null ? "0" : String.valueOf(images.size());

        if (question == null || question.isBlank()) {
            question = "Provide key imaging findings, differential, and next steps for a clinician.";
        }

        return "You are a clinical decision support (CDS) assistant for doctors. "
                + "Be helpful and concise, but not robotic. "
                + "Do NOT provide medication dosing or a definitive diagnosis. "
                + "If information is insufficient, ask focused questions instead of guessing. "
                + "Respond in JSON matching the provided schema (no extra keys).\n\n"
                + "Case: " + caseId + "\n"
                + "Patient summary (de-identified): " + patientSummary + "\n"
                + "Metrics: " + metricsSummary + "\n"
                + "Images provided: " + imgSummary + " PNG keyframes with segmentation overlay.\n"
                + (background == null || background.isBlank() ? "" : "Background context (do not restate verbatim): " + background + "\n")
                + "Clinician question: " + question + "\n";
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
