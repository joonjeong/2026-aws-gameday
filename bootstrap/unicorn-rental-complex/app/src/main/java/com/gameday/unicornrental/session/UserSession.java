package com.gameday.unicornrental.session;

import java.time.Instant;

public record UserSession(
  String sessionId,
  String userName,
  Instant createdAt,
  Instant lastAccessedAt,
  Instant expiresAt
) {
}
