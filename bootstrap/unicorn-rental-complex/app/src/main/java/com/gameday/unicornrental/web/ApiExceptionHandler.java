package com.gameday.unicornrental.web;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

  @ExceptionHandler(UnauthorizedException.class)
  public ResponseEntity<Map<String, String>> handleUnauthorized(UnauthorizedException error) {
    return error(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", error.getMessage());
  }

  @ExceptionHandler(ConflictException.class)
  public ResponseEntity<Map<String, String>> handleConflict(ConflictException error) {
    return error(HttpStatus.CONFLICT, "CONFLICT", error.getMessage());
  }

  @ExceptionHandler(NotFoundException.class)
  public ResponseEntity<Map<String, String>> handleNotFound(NotFoundException error) {
    return error(HttpStatus.NOT_FOUND, "NOT_FOUND", error.getMessage());
  }

  @ExceptionHandler({IllegalArgumentException.class, MethodArgumentNotValidException.class})
  public ResponseEntity<Map<String, String>> handleBadRequest(Exception error) {
    return error(HttpStatus.BAD_REQUEST, "BAD_REQUEST", error.getMessage());
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, String>> handleGenericError(Exception error) {
    return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", error.getMessage());
  }

  private ResponseEntity<Map<String, String>> error(HttpStatus status, String code, String message) {
    return ResponseEntity.status(status).body(Map.of(
      "code", code,
      "message", message
    ));
  }
}
