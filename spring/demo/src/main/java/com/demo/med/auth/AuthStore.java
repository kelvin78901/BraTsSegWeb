package com.demo.med.auth;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class AuthStore {
  private static final Map<String, DemoUser> TOKENS = new ConcurrentHashMap<>();

  public static String issueToken(DemoUser user) {
    String token = UUID.randomUUID().toString();
    TOKENS.put(token, user);
    return token;
  }

  public static DemoUser getUserByToken(String token) {
    if (token == null || token.isBlank()) return null;
    return TOKENS.get(token);
  }
}
