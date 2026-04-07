package com.gameday.unicornrental.rental;

import java.time.Instant;
import java.util.UUID;

public record RentalOrderView(
  UUID orderId,
  String rentalId,
  String assetName,
  String customerName,
  String status,
  Instant createdAt,
  Instant returnedAt
) {
}
