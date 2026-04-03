package com.demo.med.auth;

import java.util.logging.Logger;

public final class ResourcePolicy {

    private static final Logger log = Logger.getLogger(ResourcePolicy.class.getName());

    private ResourcePolicy() {}

    public static void checkOwnership(DemoUser user, String resourceOwner) {
        if (user == null) {
            throw new AccessDeniedException("Authentication required");
        }

        if (user.getRole() == DemoUser.Role.ADMIN) return;

        if (!user.getUserId().equals(resourceOwner)) {
            log.warning(String.format(
                    "[POLICY] User '%s' (%s) denied access to resource owned by '%s'",
                    user.getUserId(), user.getRole(), resourceOwner));
            throw new AccessDeniedException(
                    "Access denied: you do not have permission to access this resource");
        }
    }

    public static boolean isOwnerOrAdmin(DemoUser user, String resourceOwner) {
        if (user == null) return false;
        if (user.getRole() == DemoUser.Role.ADMIN) return true;
        return user.getUserId().equals(resourceOwner);
    }

    public static class AccessDeniedException extends RuntimeException {
        public AccessDeniedException(String message) {
            super(message);
        }
    }
}
