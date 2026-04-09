package com.gameday.unicornrental;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.http.MediaType.TEXT_HTML;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gameday.unicornrental.rental.RentalRepository;
import com.gameday.unicornrental.session.UserSessionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
  "spring.autoconfigure.exclude="
    + "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,"
    + "org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration,"
    + "org.springframework.boot.autoconfigure.sql.init.SqlInitializationAutoConfiguration"
})
@AutoConfigureMockMvc
class HomePageTests {

  @Autowired
  private MockMvc mockMvc;

  @MockitoBean
  private RentalRepository rentalRepository;

  @MockitoBean
  private UserSessionService sessionService;

  @Test
  void rootServesScenarioLandingPage() throws Exception {
    mockMvc.perform(get("/"))
      .andExpect(status().isOk())
      .andExpect(forwardedUrl("index.html"));

    mockMvc.perform(get("/index.html"))
      .andExpect(status().isOk())
      .andExpect(content().contentTypeCompatibleWith(TEXT_HTML))
      .andExpect(content().string(containsString("Unicorn Rental Control Deck")))
      .andExpect(content().string(containsString("POST /api/sessions")));
  }
}
