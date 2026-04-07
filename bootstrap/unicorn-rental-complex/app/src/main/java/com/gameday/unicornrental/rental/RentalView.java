package com.gameday.unicornrental.rental;

import java.math.BigDecimal;
import java.time.Instant;

public record RentalView(
  String rentalId,
  String assetName,
  String category,
  String status,
  BigDecimal hourlyRate,
  Instant updatedAt
) {
}
