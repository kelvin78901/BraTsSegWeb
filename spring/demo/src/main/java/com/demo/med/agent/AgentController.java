package com.demo.med.agent;

import com.demo.med.auth.DemoUser;
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
public class AgentController {

  private final GeminiClient geminiClient;

  private final Map<String, List<Map<String, Object>>> chatHistory = new ConcurrentHashMap<>();

  public AgentController(GeminiClient geminiClient) {
    this.geminiClient = geminiClient;
  }

  @PostMapping(value="/chat", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
  public Map<String, Object> chat(@RequestBody Map<String, Object> body, HttpServletRequest request) {
    DemoUser user = (DemoUser) request.getAttribute("demoUser");
    String userId = user == null ? "guest" : user.getUserId();

    String msg = String.valueOf(body.getOrDefault("message", "")).trim();
    String caseId = String.valueOf(body.getOrDefault("caseId", "general"));
    String modelOverride = body.get("model") == null ? null : String.valueOf(body.get("model"));
    String background = body.get("background") == null ? "" : String.valueOf(body.get("background"));

    if (msg.isBlank()) {
      return Map.of("ok", false, "error", "message is empty");
    }
    if (!geminiClient.hasApiKey()) {
      return Map.of("ok", false, "error", "Missing API Key (gemini.apiKey)");
    }
    String lower = msg.toLowerCase();
    if (isGreetingOnly(lower) && (background == null || background.isBlank())) {
          String reply = "Hi! I'm your clinical assistant. 🙂\n\n"
              + "What would you like to do?\n"
              + "- Review current imaging/segmentation results\n"
              + "- Discuss differential diagnosis and next steps\n"
              + "- Draft a radiology or clinical note\n\n"
            + "You can also tell me the main symptoms and what you want to focus on.";
      return Map.of("ok", true, "from", "agent", "to", userId, "reply", reply);
    }

    String historyKey = userId + ":" + caseId;
    List<Map<String, Object>> contents = new ArrayList<>(chatHistory.getOrDefault(historyKey, List.of()));

    // append user turn
    contents.add(Map.of(
            "role", "user",
            "parts", List.of(Map.of("text", msg))
    ));

    String system = buildSystemInstruction(background);

    try {
      Map<String, Object> g = geminiClient.generateChat(
              contents,
              system,
              modelOverride,
              0.75,     
              4800    
      );

      String reply = g.get("rawText") == null ? "" : String.valueOf(g.get("rawText")).trim();
      if (reply.isBlank()) reply = "(No response)";

      contents.add(Map.of(
              "role", "model",
              "parts", List.of(Map.of("text", reply))
      ));

      contents = trimToLastTurns(contents, 20);
      chatHistory.put(historyKey, contents);

      Map<String, Object> out = new HashMap<>();
      out.put("ok", true);
      out.put("from", "agent");
      out.put("to", userId);
      out.put("reply", reply);
      out.put("model", g.get("model"));
      return out;
    } catch (Exception e) {
      return Map.of(
              "ok", false,
              "error", e.getMessage() == null ? "Gemini chat failed" : e.getMessage()
      );
    }
  }

  private boolean isGreetingOnly(String s) {
    return s.equals("hi") || s.equals("hello") || s.equals("hey")
            || s.equals("你好") || s.equals("您好") || s.equals("嗨")
            || s.equals("哈喽") || s.equals("早") || s.equals("早上好")
            || s.equals("晚上好");
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
