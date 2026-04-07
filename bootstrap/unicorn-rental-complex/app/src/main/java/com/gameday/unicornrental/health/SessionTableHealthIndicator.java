package com.gameday.unicornrental.health;

import com.gameday.unicornrental.session.UserSessionService;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

@Component
public class SessionTableHealthIndicator implements HealthIndicator {
  private final UserSessionService sessionService;

  public SessionTableHealthIndicator(UserSessionService sessionService) {
    this.sessionService = sessionService;
  }

  @Override
  public Health health() {
    try {
      return Health.up()
        .withDetails(sessionService.sessionStoreStatus())
        .build();
    } catch (Exception error) {
      return Health.down(error).build();
    }
  }
}
