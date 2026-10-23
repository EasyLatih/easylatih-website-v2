-- Central EasyLatih schedule for programmes held outside the training room.

create table if not exists public.training_schedules (
  id uuid primary key default gen_random_uuid(),
  programme_title text not null check (char_length(trim(programme_title)) between 3 and 180),
  venue_type text not null default 'EXTERNAL' check (venue_type in ('EXTERNAL')),
  venue_name text not null check (char_length(trim(venue_name)) between 2 and 180),
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  participants integer not null check (participants > 0 and participants <= 5000),
  goodies_required boolean not null default true,
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED','CANCELLED')),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_time is null or start_time is null or end_time > start_time)
);

create index if not exists training_schedules_active_dates_idx
  on public.training_schedules (start_date, end_date)
  where status = 'CONFIRMED';

alter table public.training_schedules enable row level security;

drop policy if exists training_schedules_admin_all on public.training_schedules;
create policy training_schedules_admin_all on public.training_schedules
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

revoke all on table public.training_schedules from anon;
revoke all on table public.training_schedules from authenticated;
grant select, insert, update on table public.training_schedules to authenticated;
