package com.gameday.unicornrental.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

@Configuration
public class AwsConfiguration {

  @Bean
  DynamoDbClient dynamoDbClient(AppProperties properties) {
    return DynamoDbClient.builder()
      .httpClientBuilder(UrlConnectionHttpClient.builder())
      .region(Region.of(properties.awsRegion()))
      .build();
  }
}
