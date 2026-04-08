package com.gameday.unicornrental.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

import org.junit.jupiter.api.Test;

class AwsConfigurationTests {

  @Test
  void dynamoDbClientBuildsWhenMultipleSdkHttpImplementationsArePresent() {
    AppProperties properties = new AppProperties("ap-northeast-2", "unicorn-rental-complex-sessions", 8);

    assertDoesNotThrow(() -> {
      try (var ignored = new AwsConfiguration().dynamoDbClient(properties)) {
        // Building the client used to fail because the SDK saw multiple HTTP providers.
      }
    });
  }
}
