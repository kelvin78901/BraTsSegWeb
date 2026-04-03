package com.demo.med.auth;

import java.util.Iterator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class AuthStore {

    private static final long TTL_MS = 8 * 60 * 60 * 1000L;

    private static final int MAX_TOKENS = 10_000;

    private record TokenEntry(DemoUser user, long expiresAt) {}

    private static final ConcurrentHashMap<String, TokenEntry> TOKENS = new ConcurrentHashMap<>();

    static {

        Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "auth-token-cleanup");
            t.setDaemon(true);
            return t;
        }).scheduleAtFixedRate(() -> {
            long now = System.currentTimeMillis();
            Iterator<Map.Entry<String, TokenEntry>> it = TOKENS.entrySet().iterator();
            while (it.hasNext()) {
                if (it.next().getValue().expiresAt() < now) it.remove();
            }
        }, 30, 30, TimeUnit.MINUTES);
    }

    private static final Object ISSUE_LOCK = new Object();

    public static String issueToken(DemoUser user) {
        synchronized (ISSUE_LOCK) {

            if (TOKENS.size() >= MAX_TOKENS) {
                long now = System.currentTimeMillis();
                TOKENS.entrySet().removeIf(e -> e.getValue().expiresAt() < now);
            }
            String token = UUID.randomUUID().toString();
            TOKENS.put(token, new TokenEntry(user, System.currentTimeMillis() + TTL_MS));
            return token;
        }
    }

    public static DemoUser getUserByToken(String token) {
        if (token == null || token.isBlank()) return null;
        TokenEntry entry = TOKENS.get(token);
        if (entry == null) return null;
        if (System.currentTimeMillis() > entry.expiresAt()) {
            TOKENS.remove(token);
            return null;
        }
        return entry.user();
    }

    public static void revokeToken(String token) {
        if (token != null) TOKENS.remove(token);
    }
}
