package com.gameday.unicornrental.web;

import com.gameday.unicornrental.session.SessionTokenResolver;
import com.gameday.unicornrental.session.UserSession;
import com.gameday.unicornrental.session.UserSessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {
  private final UserSessionService sessionService;

  public SessionController(UserSessionService sessionService) {
    this.sessionService = sessionService;
  }

  @PostMapping
  public ResponseEntity<UserSession> createSession(
    @Valid @RequestBody CreateSessionRequest request,
    HttpServletResponse response
  ) {
    UserSession session = sessionService.createSession(request.userName());
    response.addHeader(HttpHeaders.SET_COOKIE, buildSessionCookie(session).toString());
    return ResponseEntity.status(HttpStatus.CREATED).body(session);
  }

  @GetMapping("/current")
  public UserSession currentSession(HttpServletRequest request) {
    return requireSession(request);
  }

  @DeleteMapping("/current")
  public ResponseEntity<Map<String, String>> deleteCurrentSession(
    HttpServletRequest request,
    HttpServletResponse response
  ) {
    String sessionId = SessionTokenResolver.resolve(request)
      .orElseThrow(() -> new UnauthorizedException("A valid session is required."));
    sessionService.deleteSession(sessionId);
    response.addHeader(HttpHeaders.SET_COOKIE, expireCookie().toString());
    return ResponseEntity.ok(Map.of("status", "deleted"));
  }

  private UserSession requireSession(HttpServletRequest request) {
    String sessionId = SessionTokenResolver.resolve(request)
      .orElseThrow(() -> new UnauthorizedException("A valid session is required."));
    return sessionService.findSession(sessionId)
      .orElseThrow(() -> new UnauthorizedException("The session is missing or expired."));
  }

  private ResponseCookie buildSessionCookie(UserSession session) {
    long secondsUntilExpiry = Math.max(0, Duration.between(Instant.now(), session.expiresAt()).getSeconds());
    return ResponseCookie.from(SessionTokenResolver.COOKIE_NAME, session.sessionId())
      .httpOnly(true)
      .path("/")
      .sameSite("Lax")
      .maxAge(Duration.ofSeconds(secondsUntilExpiry))
      .build();
  }

  private ResponseCookie expireCookie() {
    return ResponseCookie.from(SessionTokenResolver.COOKIE_NAME, "")
      .httpOnly(true)
      .path("/")
      .sameSite("Lax")
      .maxAge(Duration.ZERO)
      .build();
  }
}
