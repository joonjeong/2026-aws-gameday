package com.gameday.unicornrental.web;

import jakarta.validation.constraints.NotBlank;

public record RentalActionRequest(@NotBlank String rentalId) {
}
