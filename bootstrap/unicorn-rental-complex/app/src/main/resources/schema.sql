create table if not exists rentals (
  rental_id varchar(64) primary key,
  asset_name varchar(255) not null,
  category varchar(64) not null,
  status varchar(32) not null,
  hourly_rate numeric(10, 2) not null,
  updated_at timestamp with time zone not null default current_timestamp
);

create table if not exists rental_orders (
  order_id uuid primary key,
  rental_id varchar(64) not null references rentals (rental_id),
  customer_name varchar(255) not null,
  session_id varchar(128) not null,
  status varchar(32) not null,
  created_at timestamp with time zone not null default current_timestamp,
  returned_at timestamp with time zone
);

create index if not exists rental_orders_session_created_idx
  on rental_orders (session_id, created_at desc);
