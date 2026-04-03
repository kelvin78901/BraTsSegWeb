package com.demo.med.config;

import com.demo.med.audit.AuditInterceptor;
import com.demo.med.auth.RoleCheckInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final RoleCheckInterceptor roleCheckInterceptor;
    private final AuditInterceptor auditInterceptor;

    public WebConfig(RoleCheckInterceptor roleCheckInterceptor, AuditInterceptor auditInterceptor) {
        this.roleCheckInterceptor = roleCheckInterceptor;
        this.auditInterceptor = auditInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {

        registry.addInterceptor(auditInterceptor)
                .addPathPatterns("/api/**");

        registry.addInterceptor(roleCheckInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/auth/**", "/api/ai/selfcheck");
    }

    @Value("${cases.dir:}")
    private String casesDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/data/**")
                .addResourceLocations("classpath:/static/viewer/cases/")
                .setCachePeriod(0);

        String dir = casesDir;
        if (dir == null || dir.isBlank()) {
            dir = System.getenv("CASES_DIR");
        }

        if (dir != null && !dir.isBlank()) {
            if (!dir.endsWith("/")) dir += "/";
            registry.addResourceHandler("/viewer/cases/**")
                    .addResourceLocations("file:" + dir, "classpath:/static/viewer/cases/")
                    .setCachePeriod(0);
        } else {

            registry.addResourceHandler("/viewer/cases/**")
                    .addResourceLocations("classpath:/static/viewer/cases/")
                    .setCachePeriod(0);
        }
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/login").setViewName("forward:/index.html");
        registry.addViewController("/patient").setViewName("forward:/index.html");
        registry.addViewController("/doctor").setViewName("forward:/index.html");
        registry.addViewController("/records").setViewName("forward:/index.html");
    }
}
