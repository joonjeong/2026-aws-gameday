package com.gameday.unicornrental;

import static org.mockito.BDDMockito.given;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gameday.unicornrental.rental.RentalOrderView;
import com.gameday.unicornrental.rental.RentalRepository;
import com.gameday.unicornrental.rental.RentalView;
import com.gameday.unicornrental.session.UserSession;
import com.gameday.unicornrental.session.UserSessionService;
import com.gameday.unicornrental.web.ApiExceptionHandler;
import com.gameday.unicornrental.web.RentalController;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = RentalController.class)
@Import(ApiExceptionHandler.class)
class RentalControllerTests {

  @Autowired
  private MockMvc mockMvc;

  @MockBean
  private RentalRepository rentalRepository;

  @MockBean
  private UserSessionService sessionService;

  @Test
  void listRentalsReturnsPostgresInventory() throws Exception {
    given(rentalRepository.listRentals()).willReturn(List.of(
      new RentalView(
        "rainbow-1",
        "Rainbow Chariot",
        "Chariot",
        "AVAILABLE",
        new BigDecimal("120.00"),
        Instant.parse("2026-04-08T00:00:00Z")
      )
    ));

    mockMvc.perform(get("/api/rentals"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$[0].rentalId").value("rainbow-1"))
      .andExpect(jsonPath("$[0].status").value("AVAILABLE"));
  }

  @Test
  void reserveRentalUsesResolvedSession() throws Exception {
    UserSession session = new UserSession(
      "session-123",
      "rainbow",
      Instant.parse("2026-04-08T00:00:00Z"),
      Instant.parse("2026-04-08T00:00:00Z"),
      Instant.parse("2026-04-08T08:00:00Z")
    );
    RentalOrderView order = new RentalOrderView(
      UUID.fromString("11111111-1111-1111-1111-111111111111"),
      "rainbow-1",
      "Rainbow Chariot",
      "rainbow",
      "RESERVED",
      Instant.parse("2026-04-08T00:01:00Z"),
      null
    );

    given(sessionService.findSession("session-123")).willReturn(Optional.of(session));
    given(rentalRepository.reserveRental("rainbow-1", session)).willReturn(order);

    mockMvc.perform(post("/api/orders/reserve")
        .header("X-Session-Id", "session-123")
        .contentType(APPLICATION_JSON)
        .content("""
          {
            "rentalId": "rainbow-1"
          }
          """))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.status").value("RESERVED"))
      .andExpect(jsonPath("$.customerName").value("rainbow"));
  }
}
