package com.demo.med.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;


@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // /data/ will serve files from src/main/resources/static/viewer/cases/
        registry.addResourceHandler("/data/**")
                .addResourceLocations("classpath:/static/viewer/cases/")
                .setCachePeriod(0);

        // Serve /viewer/cases/ from filesystem so newly-written cases are visible
        // without rebuilding the JAR.  Falls back to classpath for pre-packaged cases.
        String casesDir = System.getenv("CASES_DIR");
        if (casesDir == null || casesDir.isBlank()) {
            // Derive from working directory (same convention as sidecar)
            casesDir = System.getProperty("user.dir")
                     + "/src/main/resources/static/viewer/cases";
        }
        if (!casesDir.endsWith("/")) casesDir += "/";
        registry.addResourceHandler("/viewer/cases/**")
                .addResourceLocations("file:" + casesDir, "classpath:/static/viewer/cases/")
                .setCachePeriod(0);
    }
}
