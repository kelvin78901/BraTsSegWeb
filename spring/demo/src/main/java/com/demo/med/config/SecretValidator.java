package com.demo.med.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

@Component
public class SecretValidator {

    private static final Logger log = Logger.getLogger(SecretValidator.class.getName());

    @Value("${gemini.apiKey:}")
    private String geminiApiKey;

    @Value("${sidecar.secret:}")
    private String sidecarSecret;

    @Value("${sidecar.baseUrl:http://localhost:8000}")
    private String sidecarBaseUrl;

    @Value("${spring.profiles.active:default}")
    private String activeProfile;

    @EventListener(ApplicationReadyEvent.class)
    public void validateSecrets() {
        List<String> warnings = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        boolean isProd = "prod".equalsIgnoreCase(activeProfile)
                      || "production".equalsIgnoreCase(activeProfile);

        if (geminiApiKey == null || geminiApiKey.isBlank()) {
            String msg = "GEMINI_API_KEY is not set. AI consult/chat features will be unavailable.";
            if (isProd) {
                errors.add(msg);
            } else {
                warnings.add(msg);
            }
        } else if (geminiApiKey.length() < 10) {
            warnings.add("GEMINI_API_KEY appears too short — verify the key is correct.");
        } else {
            log.info("GEMINI_API_KEY configured (masked: " + mask(geminiApiKey) + ")");
        }

        if (sidecarSecret == null || sidecarSecret.isBlank()) {
            warnings.add("SIDECAR_SECRET is not set. Spring↔Sidecar communication is unauthenticated.");
        } else {
            log.info("SIDECAR_SECRET configured (masked: " + mask(sidecarSecret) + ")");
        }

        if (sidecarBaseUrl != null && sidecarBaseUrl.startsWith("http://")
                && !sidecarBaseUrl.contains("localhost") && !sidecarBaseUrl.contains("127.0.0.1")) {
            warnings.add("sidecar.baseUrl uses plain HTTP for a non-localhost address: "
                    + sidecarBaseUrl + ". Consider using HTTPS.");
        }

        for (String w : warnings) {
            log.warning("[SECRET-CHECK] " + w);
        }
        for (String e : errors) {
            log.severe("[SECRET-CHECK] " + e);
        }

        if (!errors.isEmpty() && isProd) {
            throw new IllegalStateException(
                    "Startup aborted: " + errors.size() + " critical secret(s) missing in production mode. "
                    + String.join("; ", errors));
        }

        if (warnings.isEmpty() && errors.isEmpty()) {
            log.info("[SECRET-CHECK] All secrets validated OK.");
        }
    }

    private static String mask(String value) {
        if (value == null || value.length() <= 4) return "****";
        return value.substring(0, 4) + "****" + value.substring(value.length() - 2);
    }
}
