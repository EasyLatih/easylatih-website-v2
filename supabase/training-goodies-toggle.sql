-- Training-room blocks default to requiring goodies, but can be excluded per programme.
alter table public.venue_bookings
  add column if not exists goodies_required boolean not null default true;
