package com.demo.med.infer;

import com.demo.med.auth.DemoUser;
import com.demo.med.auth.RequireRole;
import com.demo.med.config.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/models")
@RequireRole({DemoUser.Role.DOCTOR, DemoUser.Role.RESEARCHER, DemoUser.Role.ADMIN})
public class ModelRegistryController {

    private final ModelRegistry modelRegistry;

    public ModelRegistryController(ModelRegistry modelRegistry) {
        this.modelRegistry = modelRegistry;
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> listModels(HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        List<Map<String, Object>> models = modelRegistry.listActive().stream()
                .map(ModelRegistry.ModelInfo::toMap)
                .toList();
        return ApiResponse.ok(Map.of("models", models), reqId);
    }

    @GetMapping(value = "/{modelId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> getModel(
            @PathVariable String modelId, HttpServletRequest request) {
        String reqId = ApiResponse.requestId(request);
        ModelRegistry.ModelInfo model = modelRegistry.get(modelId);
        if (model == null) {
            return ApiResponse.error("NOT_FOUND", "Model not found: " + modelId, reqId);
        }
        return ApiResponse.ok(model.toMap(), reqId);
    }
}
