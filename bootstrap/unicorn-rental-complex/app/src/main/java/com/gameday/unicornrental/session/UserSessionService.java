package com.gameday.unicornrental.session;

import java.util.Map;
import java.util.Optional;

public interface UserSessionService {

  UserSession createSession(String userName);

  Optional<UserSession> findSession(String sessionId);

  void deleteSession(String sessionId);

  Map<String, Object> sessionStoreStatus();
}
