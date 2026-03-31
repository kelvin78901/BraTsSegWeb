package com.demo.med.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class GeminiClient {
    @Value("${gemini.apiKey:}")
    private String apiKey;

    @Value("${gemini.model:gemini-3-flash-preview}")
    private String model;

    @Value("${gemini.baseUrl:https://generativelanguage.googleapis.com}")
    private String baseUrl;

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public boolean hasApiKey() {
        return apiKey != null && !apiKey.isBlank();
    }

    public String getApiKey() {
        return apiKey;
    }

    public String getModel() {
        return model;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public Map<String, Object> generateConsult(String prompt, List<Map<String, String>> images) throws Exception {
        return generateConsult(prompt, images, null);
    }

    public Map<String, Object> generateConsult(String prompt, List<Map<String, String>> images, String modelOverride) throws Exception {
        return generateJson(prompt, images, modelOverride, 0.2, 4096, consultJsonSchema());
    }

    public Map<String, Object> generateBackground(String prompt, List<Map<String, String>> images, String modelOverride) throws Exception {
        return generateJson(prompt, images, modelOverride, 0.3, 2048, backgroundJsonSchema());
    }

    private Map<String, Object> generateJson(String prompt,
                                             List<Map<String, String>> images,
                                             String modelOverride,
                                             double temperature,
                                             int maxOutputTokens,
                                             Map<String, Object> responseJsonSchema) throws Exception {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("GEMINI_API_KEY is missing.");
        }

        List<Map<String, Object>> parts = new ArrayList<>();
        parts.add(Map.of("text", prompt));

        if (images != null) {
            for (Map<String, String> img : images) {
                String mime = img.getOrDefault("mime", "image/png");
                String b64 = img.getOrDefault("b64", "");
                if (!b64.isBlank()) {
                    parts.add(Map.of("inlineData", Map.of(
                            "mimeType", mime,
                            "data", b64
                    )));
                }
            }
        }

        Map<String, Object> body = new HashMap<>();
        body.put("contents", List.of(Map.of("role", "user", "parts", parts)));
        body.put("generationConfig", Map.of(
                "temperature", temperature,
                "maxOutputTokens", maxOutputTokens,
                "responseMimeType", "application/json",
                "responseJsonSchema", responseJsonSchema,
                "thinkingConfig", Map.of("includeThoughts", false)
        ));

        String effectiveModel = (modelOverride == null || modelOverride.isBlank()) ? model : modelOverride;
        String url = String.format("%s/v1beta/models/%s:generateContent?key=%s", baseUrl, effectiveModel, apiKey);
        String payload = mapper.writeValueAsString(body);

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("Gemini API error: " + resp.statusCode() + " - " + resp.body());
        }

        Map<String, Object> raw = mapper.readValue(resp.body(), new TypeReference<>() {});
        String text = extractText(raw);

        Map<String, Object> parsed = null;
        if (text != null && !text.isBlank()) {
            try {
                parsed = mapper.readValue(text, new TypeReference<>() {});
            } catch (Exception ignored) {}
        }

        Map<String, Object> out = new HashMap<>();
        out.put("rawText", text);
        out.put("answer", parsed);
        out.put("model", effectiveModel);
        out.put("rawBody", resp.body());
        return out;
    }

    public Map<String, Object> generateChat(List<Map<String, Object>> contents,
                                            String systemInstruction,
                                            String modelOverride,
                                            double temperature,
                                            int maxOutputTokens) throws Exception {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("GEMINI_API_KEY is missing.");
        }
        if (contents == null || contents.isEmpty()) {
            throw new IllegalArgumentException("contents is required");
        }

        Map<String, Object> body = new HashMap<>();
        body.put("contents", contents);

        if (systemInstruction != null && !systemInstruction.isBlank()) {
            body.put("systemInstruction", Map.of(
                    "role", "system",
                    "parts", List.of(Map.of("text", systemInstruction))
            ));
        }

        body.put("generationConfig", Map.of(
                "temperature", temperature,
                "maxOutputTokens", maxOutputTokens,
                "thinkingConfig", Map.of("includeThoughts", false)
        ));

        String effectiveModel = (modelOverride == null || modelOverride.isBlank()) ? model : modelOverride;
        String url = String.format("%s/v1beta/models/%s:generateContent?key=%s", baseUrl, effectiveModel, apiKey);
        String payload = mapper.writeValueAsString(body);

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("Gemini API error: " + resp.statusCode() + " - " + resp.body());
        }

        Map<String, Object> raw = mapper.readValue(resp.body(), new TypeReference<>() {});
        String text = extractText(raw);

        Map<String, Object> out = new HashMap<>();
        out.put("rawText", text);
        out.put("model", effectiveModel);
        out.put("rawBody", resp.body());
        return out;
    }


    private Map<String, Object> consultJsonSchema() {
        Map<String, Object> differentialItem = Map.of(
                "type", "object",
                "properties", Map.of(
                        "diagnosis", Map.of("type", "string", "description", "A plausible diagnosis label."),
                        "supporting", Map.of("type", "string", "description", "Key supporting evidence from provided inputs."),
                        "missing", Map.of("type", "string", "description", "What is missing or uncertain."),
                        "confidence", Map.of("type", "string", "description", "low|moderate|high (or similar)")
                ),
                "required", List.of("diagnosis", "supporting", "missing", "confidence"),
                "additionalProperties", false
        );

        Map<String, Object> nextStepItem = Map.of(
                "type", "object",
                "properties", Map.of(
                        "priority", Map.of("type", "string", "description", "high|medium|low"),
                        "action", Map.of("type", "string", "description", "The recommended action."),
                        "rationale", Map.of("type", "string", "description", "Why this action is recommended.")
                ),
                "required", List.of("priority", "action", "rationale"),
                "additionalProperties", false
        );

        return Map.of(
                "type", "object",
                "properties", Map.of(
                        "key_imaging_findings", Map.of("type", "array", "items", Map.of("type", "string")),
                        "differential", Map.of("type", "array", "items", differentialItem),
                        "recommended_next_steps", Map.of("type", "array", "items", nextStepItem),
                        "red_flags", Map.of("type", "array", "items", Map.of("type", "string")),
                        "missing_info_questions", Map.of("type", "array", "items", Map.of("type", "string")),
                        "limitations", Map.of("type", "array", "items", Map.of("type", "string"))
                ),
                "required", List.of(
                        "key_imaging_findings",
                        "differential",
                        "recommended_next_steps",
                        "red_flags",
                        "missing_info_questions",
                        "limitations"
                ),
                "additionalProperties", false
        );
    }

    private Map<String, Object> backgroundJsonSchema() {
        return Map.of(
                "type", "object",
                "properties", Map.of(
                        "background", Map.of("type", "string", "description", "A short case background for clinicians."),
                        "key_points", Map.of("type", "array", "items", Map.of("type", "string"), "description", "6-10 bullet points.")
                ),
                "required", List.of("background", "key_points"),
                "additionalProperties", false
        );
    }


    private String extractText(Map<String, Object> raw) {
        try {
            List<?> candidates = (List<?>) raw.get("candidates");
            if (candidates == null || candidates.isEmpty()) return null;
            Map<?, ?> first = (Map<?, ?>) candidates.get(0);
            Map<?, ?> content = (Map<?, ?>) first.get("content");
            List<?> parts = (List<?>) content.get("parts");
            if (parts == null || parts.isEmpty()) return null;

            StringBuilder sb = new StringBuilder();
            for (Object partObj : parts) {
                if (!(partObj instanceof Map)) continue;
                Map<?, ?> part = (Map<?, ?>) partObj;
                Object text = part.get("text");
                if (text != null) {
                    if (!sb.isEmpty()) sb.append("\n");
                    sb.append(String.valueOf(text));
                }
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
