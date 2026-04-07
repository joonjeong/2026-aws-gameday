insert into rentals (rental_id, asset_name, category, status, hourly_rate, updated_at)
values
  ('rainbow-1', 'Rainbow Chariot', 'Chariot', 'AVAILABLE', 120.00, current_timestamp),
  ('pegasus-2', 'Pegasus Glider', 'Flying', 'AVAILABLE', 210.00, current_timestamp),
  ('aurora-3', 'Aurora Sleigh', 'Sleigh', 'AVAILABLE', 180.00, current_timestamp),
  ('mist-4', 'Misty Unicorn', 'Ride', 'AVAILABLE', 95.00, current_timestamp)
on conflict (rental_id) do nothing;
