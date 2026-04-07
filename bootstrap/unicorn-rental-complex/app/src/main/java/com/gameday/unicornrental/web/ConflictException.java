package com.gameday.unicornrental.web;

public class ConflictException extends RuntimeException {
  public ConflictException(String message) {
    super(message);
  }
}
