package com.gameday.unicornrental.web;

import jakarta.validation.constraints.NotBlank;

public record CreateSessionRequest(@NotBlank String userName) {
}
