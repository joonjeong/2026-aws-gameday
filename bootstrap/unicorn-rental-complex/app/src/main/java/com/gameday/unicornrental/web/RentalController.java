package com.gameday.unicornrental.web;

import com.gameday.unicornrental.rental.RentalOrderView;
import com.gameday.unicornrental.rental.RentalRepository;
import com.gameday.unicornrental.rental.RentalView;
import com.gameday.unicornrental.session.SessionTokenResolver;
import com.gameday.unicornrental.session.UserSession;
import com.gameday.unicornrental.session.UserSessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class RentalController {
  private final RentalRepository rentalRepository;
  private final UserSessionService sessionService;

  public RentalController(RentalRepository rentalRepository, UserSessionService sessionService) {
    this.rentalRepository = rentalRepository;
    this.sessionService = sessionService;
  }

  @GetMapping("/rentals")
  public List<RentalView> listRentals() {
    return rentalRepository.listRentals();
  }

  @GetMapping("/orders")
  public List<RentalOrderView> listOrders(HttpServletRequest request) {
    UserSession session = requireSession(request);
    return rentalRepository.listOrdersForSession(session.sessionId());
  }

  @PostMapping("/orders/reserve")
  public RentalOrderView reserveRental(
    @Valid @RequestBody RentalActionRequest request,
    HttpServletRequest httpRequest
  ) {
    return rentalRepository.reserveRental(request.rentalId(), requireSession(httpRequest));
  }

  @PostMapping("/orders/return")
  public RentalOrderView returnRental(
    @Valid @RequestBody RentalActionRequest request,
    HttpServletRequest httpRequest
  ) {
    return rentalRepository.returnRental(request.rentalId(), requireSession(httpRequest));
  }

  private UserSession requireSession(HttpServletRequest request) {
    String sessionId = SessionTokenResolver.resolve(request)
      .orElseThrow(() -> new UnauthorizedException("A valid session is required."));
    return sessionService.findSession(sessionId)
      .orElseThrow(() -> new UnauthorizedException("The session is missing or expired."));
  }
}
