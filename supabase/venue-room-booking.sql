
-- EasyLatih venue rental: standalone public requests and private admin management.
-- Existing trainer portal tables/functions are not changed.
create extension if not exists btree_gist;

create table if not exists public.venue_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 120),
  capacity integer not null default 26 check (capacity between 1 and 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.venue_bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.venue_rooms(id),
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  applicant_name text not null,
  company_name text not null default '',
  applicant_email text not null,
  applicant_phone text not null,
  programme_title text not null,
  participants integer not null check (participants between 1 and 200),
  notes text not null default '',
  status text not null default 'PENDING' check (status in ('PENDING','CONFIRMED','REJECTED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_time_valid check (start_time < end_time)
);

-- Database-level conflict protection, including concurrent admin confirmations.
alter table public.venue_bookings
  add constraint venue_confirmed_no_overlap exclude using gist (
    room_id with =,
    tsrange(booking_date + start_time, booking_date + end_time, '[)') with &&
  ) where (status = 'CONFIRMED');

create index if not exists venue_bookings_calendar_idx
  on public.venue_bookings(room_id, booking_date, status);

alter table public.venue_rooms enable row level security;
alter table public.venue_bookings enable row level security;

create policy venue_rooms_public_read on public.venue_rooms
 for select to anon, authenticated using (is_active);
create policy venue_rooms_admin_all on public.venue_rooms
 for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy venue_bookings_admin_all on public.venue_bookings
 for all to authenticated using (private.is_admin()) with check (private.is_admin());

revoke all on public.venue_rooms from anon, authenticated;
revoke all on public.venue_bookings from anon, authenticated;
grant select on public.venue_rooms to anon, authenticated;
grant insert, update, delete on public.venue_rooms to authenticated;
grant select, insert, update, delete on public.venue_bookings to authenticated;

insert into public.venue_rooms(name, capacity, is_active)
 values ('EasyLatih Training Room', 26, true)
 on conflict (name) do nothing;

-- Public calendar deliberately contains no customer-identifying information.
create or replace function public.venue_get_calendar(
  p_room_id uuid,
  p_from date,
  p_to date
) returns table(booking_date date, start_time time, end_time time)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if p_room_id is null or p_from is null or p_to is null
     or p_to < p_from or p_to > p_from + 93 then
    raise exception 'Invalid calendar selection';
  end if;
  if not exists(select 1 from public.venue_rooms r where r.id=p_room_id and r.is_active) then
    raise exception 'Room unavailable';
  end if;
  return query
  select b.booking_date, b.start_time, b.end_time
  from public.venue_bookings b
  where b.room_id=p_room_id
    and b.status='CONFIRMED'
    and b.booking_date between p_from and p_to
  order by b.booking_date,b.start_time;
end;
$$;

-- Public can submit a REQUEST, not self-confirm a reservation.
create or replace function public.venue_submit_request(
 p_room_id uuid,
 p_date date,
 p_start time,
 p_end time,
 p_name text,
 p_company text,
 p_email text,
 p_phone text,
 p_title text,
 p_participants integer,
 p_notes text default '',
 p_website text default ''
) returns uuid
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_capacity integer;
  v_now timestamp := timezone('Asia/Kuala_Lumpur',now());
begin
  if length(trim(coalesce(p_website,''))) > 0 then
    raise exception 'Invalid request';
  end if;
  select capacity into v_capacity from public.venue_rooms
   where id=p_room_id and is_active=true;
  if v_capacity is null then raise exception 'Room unavailable'; end if;
  if p_date is null or p_start is null or p_end is null
     or p_date < v_now::date or p_date > v_now::date + 365
     or p_date + p_start <= v_now
     or p_start < time '08:00' or p_end > time '20:00' or p_end <= p_start then
    raise exception 'Invalid date or time';
  end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 120
   or char_length(trim(coalesce(p_title,''))) not between 3 and 180
   or char_length(trim(coalesce(p_company,''))) > 150
   or char_length(trim(coalesce(p_email,''))) not between 5 and 180
   or position('@' in coalesce(p_email,'')) <= 1
   or char_length(trim(coalesce(p_phone,''))) not between 7 and 30
   or char_length(trim(coalesce(p_notes,''))) > 1000
   or p_participants not between 1 and v_capacity then
    raise exception 'Please check your booking information';
  end if;
  if exists (
    select 1 from public.venue_bookings b
    where b.room_id=p_room_id and b.booking_date=p_date and b.status='CONFIRMED'
      and b.start_time < p_end and b.end_time > p_start
  ) then raise exception 'This slot is already booked'; end if;
  if (
    select count(*) from public.venue_bookings b
    where lower(b.applicant_email)=lower(trim(p_email))
      and b.created_at > now()-interval '1 hour'
  ) >= 3 then
    raise exception 'Too many requests. Please contact EasyLatih directly.';
  end if;
  insert into public.venue_bookings(
    room_id,booking_date,start_time,end_time,applicant_name,company_name,
    applicant_email,applicant_phone,programme_title,participants,notes
  ) values(
    p_room_id,p_date,p_start,p_end,trim(p_name),trim(coalesce(p_company,'')),
    lower(trim(p_email)),trim(p_phone),trim(p_title),p_participants,trim(coalesce(p_notes,''))
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.venue_get_calendar(uuid,date,date) from public;
revoke all on function public.venue_submit_request(uuid,date,time,time,text,text,text,text,text,integer,text,text) from public;
grant execute on function public.venue_get_calendar(uuid,date,date) to anon,authenticated;
grant execute on function public.venue_submit_request(uuid,date,time,time,text,text,text,text,text,integer,text,text) to anon,authenticated;
