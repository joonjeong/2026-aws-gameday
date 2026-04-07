package com.gameday.unicornrental.session;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Optional;
import org.springframework.util.StringUtils;

public final class SessionTokenResolver {
  public static final String COOKIE_NAME = "unicorn-rental-session";
  public static final String HEADER_NAME = "X-Session-Id";

  private SessionTokenResolver() {
  }

  public static Optional<String> resolve(HttpServletRequest request) {
    String headerValue = request.getHeader(HEADER_NAME);
    if (StringUtils.hasText(headerValue)) {
      return Optional.of(headerValue);
    }

    Cookie[] cookies = request.getCookies();
    if (cookies == null || cookies.length == 0) {
      return Optional.empty();
    }

    return Arrays.stream(cookies)
      .filter((cookie) -> COOKIE_NAME.equals(cookie.getName()))
      .map(Cookie::getValue)
      .filter(StringUtils::hasText)
      .findFirst();
  }
}
