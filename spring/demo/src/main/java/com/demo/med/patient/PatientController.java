package com.demo.med.patient;

import com.demo.med.auth.DemoUser;
import com.demo.med.auth.RequireRole;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/patient")
@RequireRole({DemoUser.Role.DOCTOR, DemoUser.Role.ADMIN})
public class PatientController {

    private final PatientProfileService profileService;

    public PatientController(PatientProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping("/me")
    public Map<String, Object> me(HttpServletRequest request) {
        return profileService.getProfile();
    }
}
