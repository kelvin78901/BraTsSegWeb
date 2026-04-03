package com.demo.med.infer;

import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ModelRegistry {

    public record ModelInfo(
            String id,
            String name,
            String version,
            String backend,
            String checksum,
            Map<String, Double> metrics,
            boolean active
    ) {
        public Map<String, Object> toMap() {
            var m = new LinkedHashMap<String, Object>();
            m.put("id", id);
            m.put("name", name);
            m.put("version", version);
            m.put("backend", backend);
            if (checksum != null) m.put("checksum", checksum);
            if (metrics != null && !metrics.isEmpty()) m.put("metrics", metrics);
            m.put("active", active);
            return m;
        }
    }

    private final ConcurrentHashMap<String, ModelInfo> registry = new ConcurrentHashMap<>();

    public ModelRegistry() {

        register(new ModelInfo(
                "default",
                "MONAI SegResNet (auto-select)",
                "1.0.0",
                "auto",
                null,
                Map.of("WT_dice", 0.89, "TC_dice", 0.82, "ET_dice", 0.78),
                true
        ));
        register(new ModelInfo(
                "onnx-segresnet-v1",
                "MONAI SegResNet ONNX",
                "1.0.0",
                "onnx",
                null,
                Map.of("WT_dice", 0.89, "TC_dice", 0.82, "ET_dice", 0.78),
                true
        ));
        register(new ModelInfo(
                "monai-segresnet-v1",
                "MONAI SegResNet PyTorch",
                "1.0.0",
                "open-monai",
                null,
                Map.of("WT_dice", 0.89, "TC_dice", 0.82, "ET_dice", 0.78),
                true
        ));
        register(new ModelInfo(
                "nnunet-brats2021",
                "nnU-Net BraTS 2021",
                "2.0.0",
                "nnunet",
                null,
                Map.of("WT_dice", 0.92, "TC_dice", 0.87, "ET_dice", 0.83),
                true
        ));
    }

    public void register(ModelInfo model) {
        registry.put(model.id(), model);
    }

    public ModelInfo get(String id) {
        return registry.get(id);
    }

    public List<ModelInfo> listAll() {
        return registry.values().stream()
                .sorted(Comparator.comparing(ModelInfo::id))
                .toList();
    }

    public List<ModelInfo> listActive() {
        return registry.values().stream()
                .filter(ModelInfo::active)
                .sorted(Comparator.comparing(ModelInfo::id))
                .toList();
    }
}
