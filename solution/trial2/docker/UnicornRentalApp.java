import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

public class UnicornRentalApp {
  private static final String APP_NAME = "unicorn-rental";
  private static final String RENTAL_PARTITION_KEY = "RENTAL";
  private static final String ORDER_PARTITION_KEY = "ORDER";

  private static String tableName;
  private static String bootstrapStatus = "PENDING";
  private static String bootstrapMessage = "Bootstrap sequence has not run yet.";

  public static void main(String[] args) throws Exception {
    int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
    tableName = System.getenv().getOrDefault("TABLE_NAME", "unknown");

    bootstrapDemoData();

    HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
    server.createContext("/", exchange -> respondJson(exchange, 200, overviewJson(port)));
    server.createContext("/actuator/health", UnicornRentalApp::handleHealth);
    server.createContext("/api/rentals", UnicornRentalApp::handleRentals);
    server.createContext("/api/rentals/reserve", UnicornRentalApp::handleReserve);
    server.createContext("/api/rentals/return", UnicornRentalApp::handleReturn);
    server.createContext("/api/rentals/maintenance/complete", UnicornRentalApp::handleMaintenanceComplete);
    server.createContext("/api/orders", UnicornRentalApp::handleOrders);
    server.createContext("/api/orders/create", UnicornRentalApp::handleCreateOrder);
    server.createContext("/api/orders/cancel", UnicornRentalApp::handleCancelOrder);
    server.setExecutor(Executors.newFixedThreadPool(8));
    server.start();
  }

  private static void handleHealth(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }

    try {
      String tableSummary = runAwsJsonCommand(List.of(
        "aws",
        "dynamodb",
        "describe-table",
        "--table-name",
        tableName,
        "--query",
        "{tableName: Table.TableName, tableStatus: Table.TableStatus, itemCount: Table.ItemCount}",
        "--output",
        "json"
      ));

      String body = """
        {
          "status": "UP",
          "service": "%s",
          "time": "%s",
          "bootstrap": {
            "status": "%s",
            "message": "%s"
          },
          "dynamo": %s
        }
        """.formatted(
        escapeJson(APP_NAME),
        escapeJson(Instant.now().toString()),
        escapeJson(bootstrapStatus),
        escapeJson(bootstrapMessage),
        indentJson(tableSummary, 2)
      );
      respondJson(exchange, 200, body);
    } catch (CommandFailure error) {
      String body = """
        {
          "status": "DEGRADED",
          "service": "%s",
          "time": "%s",
          "bootstrap": {
            "status": "%s",
            "message": "%s"
          },
          "error": {
            "type": "DYNAMODB_CHECK_FAILED",
            "message": "%s"
          }
        }
        """.formatted(
        escapeJson(APP_NAME),
        escapeJson(Instant.now().toString()),
        escapeJson(bootstrapStatus),
        escapeJson(bootstrapMessage),
        escapeJson(error.getMessage())
      );
      respondJson(exchange, 200, body);
    }
  }

  private static void handleRentals(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }

    try {
      String rentals = queryRentalsJson();
      String body = """
        {
          "tableName": "%s",
          "rentals": %s
        }
        """.formatted(escapeJson(tableName), indentJson(rentals, 2));
      respondJson(exchange, 200, body);
    } catch (CommandFailure error) {
      respondJson(exchange, 500, errorJson("LIST_RENTALS_FAILED", error.getMessage()));
    }
  }

  private static void handleReserve(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }
    Map<String, String> params = parseQuery(exchange.getRequestURI());
    String rentalId = params.get("id");
    String customer = params.get("customer");

    if (isBlank(rentalId) || isBlank(customer)) {
      respondJson(exchange, 400, errorJson("INVALID_REQUEST", "id and customer query parameters are required."));
      return;
    }

    try {
      String updatedRental = runAwsJsonCommand(List.of(
        "aws",
        "dynamodb",
        "update-item",
        "--table-name",
        tableName,
        "--key",
        rentalKeyJson(rentalId),
        "--update-expression",
        "SET #status = :reserved, customer = :customer, updatedAt = :updatedAt",
        "--condition-expression",
        "attribute_exists(pk) AND #status = :available",
        "--expression-attribute-names",
        "{\"#status\":\"status\"}",
        "--expression-attribute-values",
        """
        {
          ":reserved": {"S":"RESERVED"},
          ":available": {"S":"AVAILABLE"},
          ":customer": {"S":"%s"},
          ":updatedAt": {"S":"%s"}
        }
        """.formatted(escapeJson(customer), escapeJson(Instant.now().toString())),
        "--return-values",
        "ALL_NEW",
        "--query",
        "Attributes.{rentalId: sk.S, asset: asset.S, status: status.S, customer: customer.S, updatedAt: updatedAt.S}",
        "--output",
        "json"
      ));

      String body = """
        {
          "action": "reserve",
          "result": %s
        }
        """.formatted(indentJson(updatedRental, 2));
      respondJson(exchange, 200, body);
    } catch (CommandFailure error) {
      respondJson(exchange, 409, errorJson("RESERVE_FAILED", error.getMessage()));
    }
  }

  private static void handleReturn(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }
    Map<String, String> params = parseQuery(exchange.getRequestURI());
    String rentalId = params.get("id");

    if (isBlank(rentalId)) {
      respondJson(exchange, 400, errorJson("INVALID_REQUEST", "id query parameter is required."));
      return;
    }

    try {
      String updatedRental = runAwsJsonCommand(List.of(
        "aws",
        "dynamodb",
        "update-item",
        "--table-name",
        tableName,
        "--key",
        rentalKeyJson(rentalId),
        "--update-expression",
        "SET #status = :available, updatedAt = :updatedAt REMOVE customer",
        "--condition-expression",
        "attribute_exists(pk)",
        "--expression-attribute-names",
        "{\"#status\":\"status\"}",
        "--expression-attribute-values",
        """
        {
          ":available": {"S":"AVAILABLE"},
          ":updatedAt": {"S":"%s"}
        }
        """.formatted(escapeJson(Instant.now().toString())),
        "--return-values",
        "ALL_NEW",
        "--query",
        "Attributes.{rentalId: sk.S, asset: asset.S, status: status.S, customer: customer.S, updatedAt: updatedAt.S}",
        "--output",
        "json"
      ));

      String body = """
        {
          "action": "return",
          "result": %s
        }
        """.formatted(indentJson(updatedRental, 2));
      respondJson(exchange, 200, body);
    } catch (CommandFailure error) {
      respondJson(exchange, 409, errorJson("RETURN_FAILED", error.getMessage()));
    }
  }

  private static void handleMaintenanceComplete(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }

    Map<String, String> params = parseQuery(exchange.getRequestURI());
    String rentalId = params.get("id");

    if (isBlank(rentalId)) {
      respondJson(exchange, 400, errorJson("INVALID_REQUEST", "id query parameter is required."));
      return;
    }

    try {
      String updatedRental = markRentalAvailable(rentalId, "IN_MAINTENANCE");
      String body = """
        {
          "action": "maintenance-complete",
          "result": %s
        }
        """.formatted(indentJson(updatedRental, 2));
      respondJson(exchange, 200, body);
    } catch (CommandFailure error) {
      respondJson(exchange, 409, errorJson("MAINTENANCE_COMPLETE_FAILED", error.getMessage()));
    }
  }

  private static void handleOrders(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }

    try {
      String orders = queryOrdersJson();
      String body = """
        {
          "tableName": "%s",
          "orders": %s
        }
        """.formatted(escapeJson(tableName), indentJson(orders, 2));
      respondJson(exchange, 200, body);
    } catch (CommandFailure error) {
      respondJson(exchange, 500, errorJson("LIST_ORDERS_FAILED", error.getMessage()));
    }
  }

  private static void handleCreateOrder(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }

    Map<String, String> params = parseQuery(exchange.getRequestURI());
    String rentalId = params.get("rentalId");
    String customer = params.get("customer");
    int days = parsePositiveInt(params.getOrDefault("days", "1"), 1);

    if (isBlank(rentalId) || isBlank(customer)) {
      respondJson(exchange, 400, errorJson("INVALID_REQUEST", "rentalId and customer query parameters are required."));
      return;
    }

    String orderId = "order-" + Instant.now().toEpochMilli();

    try {
      String reservedRental = reserveRental(rentalId, customer, orderId);
      String order = createOrderRecord(orderId, rentalId, customer, days);
      String body = """
        {
          "action": "create-order",
          "order": %s,
          "rental": %s
        }
        """.formatted(indentJson(order, 2), indentJson(reservedRental, 2));
      respondJson(exchange, 200, body);
    } catch (CommandFailure error) {
      respondJson(exchange, 409, errorJson("CREATE_ORDER_FAILED", error.getMessage()));
    }
  }

  private static void handleCancelOrder(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }

    Map<String, String> params = parseQuery(exchange.getRequestURI());
    String orderId = params.get("id");

    if (isBlank(orderId)) {
      respondJson(exchange, 400, errorJson("INVALID_REQUEST", "id query parameter is required."));
      return;
    }

    try {
      String order = getOrderJson(orderId);
      String rentalId = extractJsonField(order, "rentalId");

      if (isBlank(rentalId)) {
        throw new CommandFailure("Order does not contain a rentalId.");
      }

      String cancelledOrder = cancelOrderRecord(orderId);
      String availableRental = clearRentalReservation(rentalId);
      String body = """
        {
          "action": "cancel-order",
          "order": %s,
          "rental": %s
        }
        """.formatted(indentJson(cancelledOrder, 2), indentJson(availableRental, 2));
      respondJson(exchange, 200, body);
    } catch (CommandFailure error) {
      respondJson(exchange, 409, errorJson("CANCEL_ORDER_FAILED", error.getMessage()));
    }
  }

  private static String overviewJson(int port) {
    return """
      {
        "service": "%s",
        "port": %d,
        "time": "%s",
        "tableName": "%s",
        "bootstrap": {
          "status": "%s",
          "message": "%s"
        },
        "endpoints": {
          "health": "/actuator/health",
          "listRentals": "/api/rentals",
          "listOrders": "/api/orders",
          "reserveRental": "/api/rentals/reserve?id=demo-1&customer=alice",
          "returnRental": "/api/rentals/return?id=demo-1",
          "createOrder": "/api/orders/create?rentalId=demo-1&customer=alice&days=3",
          "cancelOrder": "/api/orders/cancel?id=order-1234567890",
          "completeMaintenance": "/api/rentals/maintenance/complete?id=demo-3"
        }
      }
      """.formatted(
      escapeJson(APP_NAME),
      port,
      escapeJson(Instant.now().toString()),
      escapeJson(tableName),
      escapeJson(bootstrapStatus),
      escapeJson(bootstrapMessage)
    );
  }

  private static void bootstrapDemoData() {
    try {
      putRentalIfMissing("demo-1", "excavator", "AVAILABLE");
      putRentalIfMissing("demo-2", "forklift", "AVAILABLE");
      putRentalIfMissing("demo-3", "boom-lift", "IN_MAINTENANCE");
      bootstrapStatus = "SEEDED";
      bootstrapMessage = "Demo rental inventory is ready in DynamoDB.";
    } catch (CommandFailure error) {
      bootstrapStatus = "DEGRADED";
      bootstrapMessage = error.getMessage();
    }
  }

  private static void putRentalIfMissing(String rentalId, String asset, String status) throws CommandFailure {
    String itemJson = """
      {
        "pk": {"S":"%s"},
        "sk": {"S":"%s"},
        "asset": {"S":"%s"},
        "status": {"S":"%s"},
        "updatedAt": {"S":"%s"}
      }
      """.formatted(
      escapeJson(RENTAL_PARTITION_KEY),
      escapeJson(rentalId),
      escapeJson(asset),
      escapeJson(status),
      escapeJson(Instant.now().toString())
    );

    try {
      runAwsJsonCommand(List.of(
        "aws",
        "dynamodb",
        "put-item",
        "--table-name",
        tableName,
        "--item",
        itemJson,
        "--condition-expression",
        "attribute_not_exists(pk) AND attribute_not_exists(sk)",
        "--output",
        "json"
      ));
    } catch (CommandFailure error) {
      if (!error.getMessage().contains("ConditionalCheckFailedException")) {
        throw error;
      }
    }
  }

  private static String queryRentalsJson() throws CommandFailure {
    return runAwsJsonCommand(List.of(
      "aws",
      "dynamodb",
      "query",
      "--table-name",
      tableName,
      "--key-condition-expression",
      "pk = :pk",
      "--expression-attribute-values",
      """
      {
        ":pk": {"S":"%s"}
      }
      """.formatted(escapeJson(RENTAL_PARTITION_KEY)),
      "--query",
      "Items[].{rentalId: sk.S, asset: asset.S, status: status.S, customer: customer.S, currentOrderId: currentOrderId.S, updatedAt: updatedAt.S}",
      "--output",
      "json"
    ));
  }

  private static String queryOrdersJson() throws CommandFailure {
    return runAwsJsonCommand(List.of(
      "aws",
      "dynamodb",
      "query",
      "--table-name",
      tableName,
      "--key-condition-expression",
      "pk = :pk",
      "--expression-attribute-values",
      """
      {
        ":pk": {"S":"%s"}
      }
      """.formatted(escapeJson(ORDER_PARTITION_KEY)),
      "--query",
      "Items[].{orderId: sk.S, rentalId: rentalId.S, customer: customer.S, status: status.S, requestedDays: requestedDays.N, createdAt: createdAt.S, updatedAt: updatedAt.S}",
      "--output",
      "json"
    ));
  }

  private static String reserveRental(String rentalId, String customer, String orderId) throws CommandFailure {
    return runAwsJsonCommand(List.of(
      "aws",
      "dynamodb",
      "update-item",
      "--table-name",
      tableName,
      "--key",
      rentalKeyJson(rentalId),
      "--update-expression",
      "SET #status = :reserved, customer = :customer, currentOrderId = :orderId, updatedAt = :updatedAt",
      "--condition-expression",
      "attribute_exists(pk) AND #status = :available",
      "--expression-attribute-names",
      "{\"#status\":\"status\"}",
      "--expression-attribute-values",
      """
      {
        ":reserved": {"S":"RESERVED"},
        ":available": {"S":"AVAILABLE"},
        ":customer": {"S":"%s"},
        ":orderId": {"S":"%s"},
        ":updatedAt": {"S":"%s"}
      }
      """.formatted(
        escapeJson(customer),
        escapeJson(orderId),
        escapeJson(Instant.now().toString())
      ),
      "--return-values",
      "ALL_NEW",
      "--query",
      "Attributes.{rentalId: sk.S, asset: asset.S, status: status.S, customer: customer.S, currentOrderId: currentOrderId.S, updatedAt: updatedAt.S}",
      "--output",
      "json"
    ));
  }

  private static String createOrderRecord(String orderId, String rentalId, String customer, int days) throws CommandFailure {
    String now = Instant.now().toString();
    String itemJson = """
      {
        "pk": {"S":"%s"},
        "sk": {"S":"%s"},
        "rentalId": {"S":"%s"},
        "customer": {"S":"%s"},
        "status": {"S":"OPEN"},
        "requestedDays": {"N":"%d"},
        "createdAt": {"S":"%s"},
        "updatedAt": {"S":"%s"}
      }
      """.formatted(
      escapeJson(ORDER_PARTITION_KEY),
      escapeJson(orderId),
      escapeJson(rentalId),
      escapeJson(customer),
      days,
      escapeJson(now),
      escapeJson(now)
    );

    runAwsJsonCommand(List.of(
      "aws",
      "dynamodb",
      "put-item",
      "--table-name",
      tableName,
      "--item",
      itemJson,
      "--condition-expression",
      "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      "--output",
      "json"
    ));

    return """
      {
        "orderId": "%s",
        "rentalId": "%s",
        "customer": "%s",
        "status": "OPEN",
        "requestedDays": %d,
        "createdAt": "%s"
      }
      """.formatted(
      escapeJson(orderId),
      escapeJson(rentalId),
      escapeJson(customer),
      days,
      escapeJson(now)
    );
  }

  private static String getOrderJson(String orderId) throws CommandFailure {
    return runAwsJsonCommand(List.of(
      "aws",
      "dynamodb",
      "get-item",
      "--table-name",
      tableName,
      "--key",
      orderKeyJson(orderId),
      "--projection-expression",
      "pk, sk, rentalId, customer, #status, requestedDays, createdAt, updatedAt",
      "--expression-attribute-names",
      "{\"#status\":\"status\"}",
      "--query",
      "Item.{orderId: sk.S, rentalId: rentalId.S, customer: customer.S, status: status.S, requestedDays: requestedDays.N, createdAt: createdAt.S, updatedAt: updatedAt.S}",
      "--output",
      "json"
    ));
  }

  private static String cancelOrderRecord(String orderId) throws CommandFailure {
    return runAwsJsonCommand(List.of(
      "aws",
      "dynamodb",
      "update-item",
      "--table-name",
      tableName,
      "--key",
      orderKeyJson(orderId),
      "--update-expression",
      "SET #status = :cancelled, updatedAt = :updatedAt",
      "--condition-expression",
      "attribute_exists(pk)",
      "--expression-attribute-names",
      "{\"#status\":\"status\"}",
      "--expression-attribute-values",
      """
      {
        ":cancelled": {"S":"CANCELLED"},
        ":updatedAt": {"S":"%s"}
      }
      """.formatted(escapeJson(Instant.now().toString())),
      "--return-values",
      "ALL_NEW",
      "--query",
      "Attributes.{orderId: sk.S, rentalId: rentalId.S, customer: customer.S, status: status.S, requestedDays: requestedDays.N, createdAt: createdAt.S, updatedAt: updatedAt.S}",
      "--output",
      "json"
    ));
  }

  private static String clearRentalReservation(String rentalId) throws CommandFailure {
    return runAwsJsonCommand(List.of(
      "aws",
      "dynamodb",
      "update-item",
      "--table-name",
      tableName,
      "--key",
      rentalKeyJson(rentalId),
      "--update-expression",
      "SET #status = :available, updatedAt = :updatedAt REMOVE customer, currentOrderId",
      "--condition-expression",
      "attribute_exists(pk)",
      "--expression-attribute-names",
      "{\"#status\":\"status\"}",
      "--expression-attribute-values",
      """
      {
        ":available": {"S":"AVAILABLE"},
        ":updatedAt": {"S":"%s"}
      }
      """.formatted(escapeJson(Instant.now().toString())),
      "--return-values",
      "ALL_NEW",
      "--query",
      "Attributes.{rentalId: sk.S, asset: asset.S, status: status.S, customer: customer.S, currentOrderId: currentOrderId.S, updatedAt: updatedAt.S}",
      "--output",
      "json"
    ));
  }

  private static String markRentalAvailable(String rentalId, String expectedStatus) throws CommandFailure {
    return runAwsJsonCommand(List.of(
      "aws",
      "dynamodb",
      "update-item",
      "--table-name",
      tableName,
      "--key",
      rentalKeyJson(rentalId),
      "--update-expression",
      "SET #status = :available, updatedAt = :updatedAt REMOVE customer, currentOrderId",
      "--condition-expression",
      "attribute_exists(pk) AND #status = :expectedStatus",
      "--expression-attribute-names",
      "{\"#status\":\"status\"}",
      "--expression-attribute-values",
      """
      {
        ":available": {"S":"AVAILABLE"},
        ":expectedStatus": {"S":"%s"},
        ":updatedAt": {"S":"%s"}
      }
      """.formatted(
        escapeJson(expectedStatus),
        escapeJson(Instant.now().toString())
      ),
      "--return-values",
      "ALL_NEW",
      "--query",
      "Attributes.{rentalId: sk.S, asset: asset.S, status: status.S, customer: customer.S, currentOrderId: currentOrderId.S, updatedAt: updatedAt.S}",
      "--output",
      "json"
    ));
  }

  private static String rentalKeyJson(String rentalId) {
    return """
      {
        "pk": {"S":"%s"},
        "sk": {"S":"%s"}
      }
      """.formatted(escapeJson(RENTAL_PARTITION_KEY), escapeJson(rentalId));
  }

  private static String orderKeyJson(String orderId) {
    return """
      {
        "pk": {"S":"%s"},
        "sk": {"S":"%s"}
      }
      """.formatted(escapeJson(ORDER_PARTITION_KEY), escapeJson(orderId));
  }

  private static String runAwsJsonCommand(List<String> command) throws CommandFailure {
    ProcessBuilder builder = new ProcessBuilder(command);
    builder.environment().put("AWS_PAGER", "");

    try {
      Process process = builder.start();
      String stdout = readStream(process.getInputStream()).trim();
      String stderr = readStream(process.getErrorStream()).trim();
      int exitCode = process.waitFor();

      if (exitCode != 0) {
        throw new CommandFailure("AWS CLI command failed: " + String.join(" ", command) + " | " + stderr);
      }

      return stdout.isEmpty() ? "{}" : stdout;
    } catch (IOException | InterruptedException error) {
      if (error instanceof InterruptedException) {
        Thread.currentThread().interrupt();
      }
      throw new CommandFailure("AWS CLI invocation failed: " + error.getMessage());
    }
  }

  private static String readStream(InputStream input) throws IOException {
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    input.transferTo(buffer);
    return buffer.toString(StandardCharsets.UTF_8);
  }

  private static boolean ensureMethod(HttpExchange exchange, String expectedMethod) throws IOException {
    if (!expectedMethod.equalsIgnoreCase(exchange.getRequestMethod())) {
      respondJson(exchange, 405, errorJson("METHOD_NOT_ALLOWED", "Only " + expectedMethod + " is supported."));
      return false;
    }
    return true;
  }

  private static Map<String, String> parseQuery(URI uri) {
    Map<String, String> params = new LinkedHashMap<>();
    String rawQuery = uri.getRawQuery();
    if (rawQuery == null || rawQuery.isBlank()) {
      return params;
    }

    for (String pair : rawQuery.split("&")) {
      String[] tokens = pair.split("=", 2);
      String key = urlDecode(tokens[0]);
      String value = tokens.length > 1 ? urlDecode(tokens[1]) : "";
      params.put(key, value);
    }

    return params;
  }

  private static String urlDecode(String value) {
    return URLDecoder.decode(value, StandardCharsets.UTF_8);
  }

  private static boolean isBlank(String value) {
    return value == null || value.isBlank();
  }

  private static int parsePositiveInt(String value, int fallback) {
    if (isBlank(value)) {
      return fallback;
    }

    try {
      int parsed = Integer.parseInt(value);
      return parsed > 0 ? parsed : fallback;
    } catch (NumberFormatException error) {
      return fallback;
    }
  }

  private static String extractJsonField(String json, String fieldName) {
    String needle = "\"" + fieldName + "\": \"";
    int start = json.indexOf(needle);
    if (start < 0) {
      return null;
    }

    int from = start + needle.length();
    int end = json.indexOf("\"", from);
    if (end < 0) {
      return null;
    }

    return json.substring(from, end);
  }

  private static String errorJson(String code, String message) {
    return """
      {
        "error": {
          "code": "%s",
          "message": "%s"
        }
      }
      """.formatted(escapeJson(code), escapeJson(message));
  }

  private static String indentJson(String json, int spaces) {
    String indentation = " ".repeat(spaces);
    return json
      .stripTrailing()
      .lines()
      .map(line -> indentation + line)
      .reduce((left, right) -> left + "\n" + right)
      .orElse(indentation + json.stripTrailing());
  }

  private static String escapeJson(String value) {
    return value
      .replace("\\", "\\\\")
      .replace("\"", "\\\"")
      .replace("\n", "\\n");
  }

  private static void respondJson(HttpExchange exchange, int statusCode, String body) throws IOException {
    byte[] payload = body.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
    exchange.sendResponseHeaders(statusCode, payload.length);
    try (OutputStream output = exchange.getResponseBody()) {
      output.write(payload);
    }
  }

  private static final class CommandFailure extends Exception {
    private CommandFailure(String message) {
      super(message);
    }
  }
}
