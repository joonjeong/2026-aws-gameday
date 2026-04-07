package com.gameday.unicornrental.rental;

import com.gameday.unicornrental.session.UserSession;
import com.gameday.unicornrental.web.ConflictException;
import com.gameday.unicornrental.web.NotFoundException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class RentalRepository {
  private static final RowMapper<RentalView> RENTAL_ROW_MAPPER = RentalRepository::mapRental;
  private static final RowMapper<RentalOrderView> ORDER_ROW_MAPPER = RentalRepository::mapOrder;

  private final JdbcClient jdbcClient;

  public RentalRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public List<RentalView> listRentals() {
    return jdbcClient.sql("""
      select rental_id, asset_name, category, status, hourly_rate, updated_at
      from rentals
      order by rental_id
      """)
      .query(RENTAL_ROW_MAPPER)
      .list();
  }

  public List<RentalOrderView> listOrdersForSession(String sessionId) {
    return jdbcClient.sql("""
      select o.order_id, o.rental_id, r.asset_name, o.customer_name, o.status, o.created_at, o.returned_at
      from rental_orders o
      join rentals r on r.rental_id = o.rental_id
      where o.session_id = :sessionId
      order by o.created_at desc
      """)
      .param("sessionId", sessionId)
      .query(ORDER_ROW_MAPPER)
      .list();
  }

  @Transactional
  public RentalOrderView reserveRental(String rentalId, UserSession session) {
    int updatedRows = jdbcClient.sql("""
      update rentals
      set status = 'RESERVED', updated_at = current_timestamp
      where rental_id = :rentalId and status = 'AVAILABLE'
      """)
      .param("rentalId", rentalId)
      .update();

    if (updatedRows == 0) {
      throw new ConflictException("Rental is not available.");
    }

    UUID orderId = UUID.randomUUID();
    jdbcClient.sql("""
      insert into rental_orders (order_id, rental_id, customer_name, session_id, status, created_at)
      values (:orderId, :rentalId, :customerName, :sessionId, 'RESERVED', current_timestamp)
      """)
      .param("orderId", orderId)
      .param("rentalId", rentalId)
      .param("customerName", session.userName())
      .param("sessionId", session.sessionId())
      .update();

    return loadOrder(orderId);
  }

  @Transactional
  public RentalOrderView returnRental(String rentalId, UserSession session) {
    UUID orderId = jdbcClient.sql("""
      select order_id
      from rental_orders
      where rental_id = :rentalId and session_id = :sessionId and status = 'RESERVED'
      order by created_at desc
      limit 1
      """)
      .param("rentalId", rentalId)
      .param("sessionId", session.sessionId())
      .query(UUID.class)
      .optional()
      .orElseThrow(() -> new NotFoundException("No reserved order was found for this session."));

    jdbcClient.sql("""
      update rental_orders
      set status = 'RETURNED', returned_at = current_timestamp
      where order_id = :orderId
      """)
      .param("orderId", orderId)
      .update();

    jdbcClient.sql("""
      update rentals
      set status = 'AVAILABLE', updated_at = current_timestamp
      where rental_id = :rentalId
      """)
      .param("rentalId", rentalId)
      .update();

    return loadOrder(orderId);
  }

  private RentalOrderView loadOrder(UUID orderId) {
    return jdbcClient.sql("""
      select o.order_id, o.rental_id, r.asset_name, o.customer_name, o.status, o.created_at, o.returned_at
      from rental_orders o
      join rentals r on r.rental_id = o.rental_id
      where o.order_id = :orderId
      """)
      .param("orderId", orderId)
      .query(ORDER_ROW_MAPPER)
      .optional()
      .orElseThrow(() -> new NotFoundException("Order not found after write."));
  }

  private static RentalView mapRental(ResultSet resultSet, int rowNum) throws SQLException {
    return new RentalView(
      resultSet.getString("rental_id"),
      resultSet.getString("asset_name"),
      resultSet.getString("category"),
      resultSet.getString("status"),
      resultSet.getBigDecimal("hourly_rate"),
      resultSet.getTimestamp("updated_at").toInstant()
    );
  }

  private static RentalOrderView mapOrder(ResultSet resultSet, int rowNum) throws SQLException {
    var returnedAt = resultSet.getTimestamp("returned_at");
    return new RentalOrderView(
      UUID.fromString(resultSet.getString("order_id")),
      resultSet.getString("rental_id"),
      resultSet.getString("asset_name"),
      resultSet.getString("customer_name"),
      resultSet.getString("status"),
      resultSet.getTimestamp("created_at").toInstant(),
      returnedAt == null ? null : returnedAt.toInstant()
    );
  }
}
