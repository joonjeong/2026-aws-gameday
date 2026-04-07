package com.gameday.unicornrental.session;

import com.gameday.unicornrental.config.AppProperties;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.DescribeTableRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

@Service
public class DynamoDbSessionService implements UserSessionService {
  private static final String SESSION_ID_ATTRIBUTE = "sessionId";
  private static final String USER_NAME_ATTRIBUTE = "userName";
  private static final String CREATED_AT_ATTRIBUTE = "createdAt";
  private static final String LAST_ACCESSED_AT_ATTRIBUTE = "lastAccessedAt";
  private static final String EXPIRES_AT_ATTRIBUTE = "expiresAt";

  private final DynamoDbClient dynamoDbClient;
  private final AppProperties properties;

  public DynamoDbSessionService(DynamoDbClient dynamoDbClient, AppProperties properties) {
    this.dynamoDbClient = dynamoDbClient;
    this.properties = properties;
  }

  @Override
  public UserSession createSession(String userName) {
    String normalizedUserName = userName.strip();
    if (normalizedUserName.isEmpty()) {
      throw new IllegalArgumentException("userName must not be blank.");
    }

    Instant now = Instant.now();
    UserSession session = new UserSession(
      UUID.randomUUID().toString(),
      normalizedUserName,
      now,
      now,
      now.plus(sessionTtl())
    );

    dynamoDbClient.putItem(PutItemRequest.builder()
      .tableName(properties.sessionTableName())
      .item(toItem(session))
      .build());

    return session;
  }

  @Override
  public Optional<UserSession> findSession(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      return Optional.empty();
    }

    var response = dynamoDbClient.getItem(GetItemRequest.builder()
      .tableName(properties.sessionTableName())
      .key(sessionKey(sessionId))
      .consistentRead(true)
      .build());

    if (!response.hasItem() || response.item().isEmpty()) {
      return Optional.empty();
    }

    UserSession session = fromItem(response.item());
    if (session.expiresAt().isBefore(Instant.now())) {
      deleteSession(session.sessionId());
      return Optional.empty();
    }

    Instant now = Instant.now();
    UserSession refreshedSession = new UserSession(
      session.sessionId(),
      session.userName(),
      session.createdAt(),
      now,
      now.plus(sessionTtl())
    );
    dynamoDbClient.putItem(PutItemRequest.builder()
      .tableName(properties.sessionTableName())
      .item(toItem(refreshedSession))
      .build());

    return Optional.of(refreshedSession);
  }

  @Override
  public void deleteSession(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      return;
    }

    dynamoDbClient.deleteItem(DeleteItemRequest.builder()
      .tableName(properties.sessionTableName())
      .key(sessionKey(sessionId))
      .build());
  }

  @Override
  public Map<String, Object> sessionStoreStatus() {
    var response = dynamoDbClient.describeTable(DescribeTableRequest.builder()
      .tableName(properties.sessionTableName())
      .build());
    Map<String, Object> status = new LinkedHashMap<>();
    status.put("tableName", response.table().tableName());
    status.put("tableStatus", response.table().tableStatusAsString());
    status.put("itemCount", response.table().itemCount());
    return status;
  }

  private Duration sessionTtl() {
    return Duration.ofHours(properties.sessionTtlHours());
  }

  private Map<String, AttributeValue> sessionKey(String sessionId) {
    return Map.of(SESSION_ID_ATTRIBUTE, AttributeValue.builder().s(sessionId).build());
  }

  private Map<String, AttributeValue> toItem(UserSession session) {
    return Map.of(
      SESSION_ID_ATTRIBUTE, AttributeValue.builder().s(session.sessionId()).build(),
      USER_NAME_ATTRIBUTE, AttributeValue.builder().s(session.userName()).build(),
      CREATED_AT_ATTRIBUTE, AttributeValue.builder().s(session.createdAt().toString()).build(),
      LAST_ACCESSED_AT_ATTRIBUTE, AttributeValue.builder().s(session.lastAccessedAt().toString()).build(),
      EXPIRES_AT_ATTRIBUTE, AttributeValue.builder().n(Long.toString(session.expiresAt().getEpochSecond())).build()
    );
  }

  private UserSession fromItem(Map<String, AttributeValue> item) {
    Instant createdAt = Instant.parse(item.get(CREATED_AT_ATTRIBUTE).s());
    Instant lastAccessedAt = Instant.parse(item.get(LAST_ACCESSED_AT_ATTRIBUTE).s());
    Instant expiresAt = Instant.ofEpochSecond(Long.parseLong(item.get(EXPIRES_AT_ATTRIBUTE).n()));
    return new UserSession(
      item.get(SESSION_ID_ATTRIBUTE).s(),
      item.get(USER_NAME_ATTRIBUTE).s(),
      createdAt,
      lastAccessedAt,
      expiresAt
    );
  }
}
