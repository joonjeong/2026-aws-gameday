package com.gameday.unicornrental.config;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "app")
public record AppProperties(
  @NotBlank String awsRegion,
  @NotBlank String sessionTableName,
  @Min(1) int sessionTtlHours
) {
}
