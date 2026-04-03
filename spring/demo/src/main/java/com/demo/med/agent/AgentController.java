package com.demo.med.agent;

import com.demo.med.auth.DemoUser;
import com.demo.med.auth.RequireRole;
import com.demo.med.config.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/agent")
@RequireRole({DemoUser.Role.DOCTOR, DemoUser.Role.ADMIN})
public class AgentController {

  private final GeminiClient geminiClient;

  private final Map<String, List<Map<String, Object>>> chatHistory = new ConcurrentHashMap<>();

  public AgentController(GeminiClient geminiClient) {
    this.geminiClient = geminiClient;
  }

  @PostMapping(value="/chat", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
  public Map<String, Object> chat(@RequestBody Map<String, Object> body, HttpServletRequest request) {
    String reqId = ApiResponse.requestId(request);
    DemoUser user = (DemoUser) request.getAttribute("demoUser");
    String userId = user == null ? "guest" : user.getUserId();

    String msg = String.valueOf(body.getOrDefault("message", "")).trim();
    String caseId = String.valueOf(body.getOrDefault("caseId", "general"));
    String modelOverride = body.get("model") == null ? null : String.valueOf(body.get("model"));
    String background = body.get("background") == null ? "" : String.valueOf(body.get("background"));

    if (msg.isBlank()) {
      return ApiResponse.error("INVALID_INPUT", "message is empty", reqId);
    }
    if (!geminiClient.hasApiKey()) {
      return ApiResponse.error("CONFIG_ERROR", "Missing API Key (gemini.apiKey)", reqId);
    }
    String lower = msg.toLowerCase();
    if (isGreetingOnly(lower) && (background == null || background.isBlank())) {
          String reply = "Hi! I'm your clinical assistant. 🙂\n\n"
              + "What would you like to do?\n"
              + "- Review current imaging/segmentation results\n"
              + "- Discuss differential diagnosis and next steps\n"
              + "- Draft a radiology or clinical note\n\n"
            + "You can also tell me the main symptoms and what you want to focus on.";
      Map<String, Object> data = new HashMap<>();
      data.put("from", "agent");
      data.put("to", userId);
      data.put("reply", reply);
      return ApiResponse.ok(data, reqId);
    }

    String historyKey = userId + ":" + caseId;

    List<Map<String, Object>> snapshot = new ArrayList<>(chatHistory.getOrDefault(historyKey, List.of()));
    snapshot.add(Map.of("role", "user", "parts", List.of(Map.of("text", msg))));
    List<Map<String, Object>> forGemini = trimToLastTurns(snapshot, 20);

    String system = buildSystemInstruction(background);

    try {
      Map<String, Object> g = geminiClient.generateChat(
              forGemini,
              system,
              modelOverride,
              0.75,
              4800
      );

      String reply = g.get("rawText") == null ? "" : String.valueOf(g.get("rawText")).trim();
      if (reply.isBlank()) reply = "(No response)";

      final String finalMsg = msg;
      final String finalReply = reply;
      chatHistory.compute(historyKey, (k, existing) -> {
          List<Map<String, Object>> updated = new ArrayList<>(existing != null ? existing : List.of());
          updated.add(Map.of("role", "user",  "parts", List.of(Map.of("text", finalMsg))));
          updated.add(Map.of("role", "model", "parts", List.of(Map.of("text", finalReply))));
          return trimToLastTurns(updated, 20);
      });

      Map<String, Object> data = new HashMap<>();
      data.put("from", "agent");
      data.put("to", userId);
      data.put("reply", reply);
      data.put("model", g.get("model"));
      return ApiResponse.ok(data, reqId);
    } catch (Exception e) {
      return ApiResponse.error("GEMINI_ERROR",
              e.getMessage() == null ? "Gemini chat failed" : e.getMessage(), reqId);
    }
  }

  private boolean isGreetingOnly(String s) {
    return s.equals("hi") || s.equals("hello") || s.equals("hey")
            || s.equals("good morning") || s.equals("good evening");
  }

  private String buildSystemInstruction(String background) {
        String base =
          "You are a clinician-facing clinical decision support (CDS) assistant. Keep the tone natural and professional.\n"
            + "Guidelines:\n"
            + "- First clarify user intent: casual chat, imaging interpretation, differential diagnosis, or next-step suggestions.\n"
            + "- If the user is greeting/small talk, respond normally and ask 1-2 questions to steer toward a clinical task.\n"
            + "- For medical judgment: separate facts/inference/recommendations; ask follow-ups when information is missing.\n"
            + "- Do not provide exact medication dosing or definitive diagnosis; remind that a clinician must confirm.\n"
            + "- Output concise, readable English paragraphs; use bullets when helpful.\n";

    if (background != null && !background.isBlank()) {
      base += "\nCurrent case background (for reference, do not repeat verbatim):\n" + background + "\n";
    }
    return base;
  }

  private List<Map<String, Object>> trimToLastTurns(List<Map<String, Object>> contents, int maxTurns) {
    if (contents == null) return List.of();
    if (contents.size() <= maxTurns) return contents;
    return new ArrayList<>(contents.subList(contents.size() - maxTurns, contents.size()));
  }
}
