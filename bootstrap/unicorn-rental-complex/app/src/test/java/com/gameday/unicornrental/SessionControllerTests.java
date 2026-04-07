package com.gameday.unicornrental;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.BDDMockito.given;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gameday.unicornrental.session.UserSession;
import com.gameday.unicornrental.session.UserSessionService;
import com.gameday.unicornrental.web.ApiExceptionHandler;
import com.gameday.unicornrental.web.SessionController;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = SessionController.class)
@Import(ApiExceptionHandler.class)
class SessionControllerTests {

  @Autowired
  private MockMvc mockMvc;

  @MockBean
  private UserSessionService sessionService;

  @Test
  void createSessionSetsSessionCookie() throws Exception {
    Instant now = Instant.parse("2026-04-08T00:00:00Z");
    UserSession session = new UserSession("session-123", "rainbow", now, now, now.plusSeconds(28_800));
    given(sessionService.createSession("rainbow")).willReturn(session);

    mockMvc.perform(post("/api/sessions")
        .contentType(APPLICATION_JSON)
        .content("""
          {
            "userName": "rainbow"
          }
          """))
      .andExpect(status().isCreated())
      .andExpect(header().string("Set-Cookie", containsString("unicorn-rental-session=session-123")))
      .andExpect(jsonPath("$.userName").value("rainbow"));
  }

  @Test
  void currentSessionRequiresAuthentication() throws Exception {
    mockMvc.perform(get("/api/sessions/current"))
      .andExpect(status().isUnauthorized())
      .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
  }
}
