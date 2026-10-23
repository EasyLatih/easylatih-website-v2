-- Keep target pax separate from actual attendance for goodies planning.

alter table public.venue_bookings
  add column if not exists actual_participants integer
  check (actual_participants is null or actual_participants > 0);

alter table public.training_schedules
  add column if not exists actual_participants integer
  check (actual_participants is null or actual_participants > 0);
