package com.demo.med.patient;

import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class PatientProfileService {

    public Map<String, Object> getProfile() {
        String caseId = "BraTS2021_00000";

        Map<String, Object> studyInfo = new HashMap<>();
        studyInfo.put("studyId", "S001");
        studyInfo.put("dateTime", "2026-01-25 09:30");
        studyInfo.put("modality", "MRI-FLAIR");
        studyInfo.put("bodyPart", "Brain");
        studyInfo.put("caseId", caseId);
        studyInfo.put("status", "Segmented");
        studyInfo.put("summary", "High-grade glioma detected in left temporal lobe.");
        studyInfo.put("viewerUrl", "/viewer/index.html");

        Map<String, Object> response = new HashMap<>();
        response.put("patientId", "P-80249");
        response.put("name", "John Doe");
        response.put("gender", "Male");
        response.put("age", 54);
        response.put("careTeam", List.of(
            Map.of("role", "Neurosurgeon", "name", "Dr. Li"),
            Map.of("role", "Radiologist", "name", "Dr. Wang")
        ));
        response.put("visits", List.of(
            Map.of(
                "date", "2026-01-25",
                "department", "Neurosurgery",
                "summary", "Post-imaging review and symptom check.",
                "plan", "Continue observation; review segmentation metrics at next visit."
            ),
            Map.of(
                "date", "2026-01-24",
                "department", "Radiology",
                "summary", "MRI completed; automated segmentation generated.",
                "plan", "Finalize radiology report and share with care team."
            ),
            Map.of(
                "date", "2026-01-15",
                "department", "Oncology",
                "summary", "Discussed treatment options and risks/benefits.",
                "plan", "Schedule follow-up after tumor board review."
            ),
            Map.of(
                "date", "2026-01-10",
                "department", "Neurology",
                "summary", "Initial consultation for headaches and dizziness.",
                "plan", "Order MRI and baseline labs; provide symptom diary guidance."
            )
        ));
        response.put("studies", List.of(studyInfo));

        return response;
    }
}
