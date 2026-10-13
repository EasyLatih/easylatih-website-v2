
-- EasyLatih room rental pricing, stored centrally and checked server-side.
create table if not exists public.venue_rental_rates (
  code text primary key check (code in ('HALF_DAY','FULL_DAY','NIGHT')),
  label text not null,
  weekday_price numeric(10,2) not null check (weekday_price>=0),
  weekend_holiday_price numeric(10,2) not null check (weekend_holiday_price>=0),
  updated_at timestamptz not null default now()
);
insert into public.venue_rental_rates (code,label,weekday_price,weekend_holiday_price)
values
 ('HALF_DAY','Half Day (4 hours)',250,350),
 ('FULL_DAY','Full Day (9:00 AM – 5:00 PM)',350,450),
 ('NIGHT','Evening / Night (per hour)',75,100)
on conflict (code) do nothing;
alter table public.venue_rental_rates enable row level security;
revoke all on public.venue_rental_rates from public,anon,authenticated;
grant select on public.venue_rental_rates to anon,authenticated;
grant update on public.venue_rental_rates to authenticated;
create policy venue_rates_public_read on public.venue_rental_rates
 for select to anon,authenticated using (true);
create policy venue_rates_admin_update on public.venue_rental_rates
 for update to authenticated using (private.is_admin()) with check (private.is_admin());

create table if not exists public.venue_public_holidays (
  holiday_date date primary key,
  name text not null check (char_length(trim(name)) between 2 and 150),
  created_at timestamptz not null default now()
);
alter table public.venue_public_holidays enable row level security;
revoke all on public.venue_public_holidays from public,anon,authenticated;
grant select on public.venue_public_holidays to anon,authenticated;
grant insert,update,delete on public.venue_public_holidays to authenticated;
create policy venue_holidays_public_read on public.venue_public_holidays
 for select to anon,authenticated using (true);
create policy venue_holidays_admin_manage on public.venue_public_holidays
 for all to authenticated using (private.is_admin()) with check (private.is_admin());

alter table public.venue_bookings
 add column if not exists booking_package text,
 add column if not exists estimated_price numeric(10,2);
alter table public.venue_bookings
 add constraint venue_estimated_price_nonnegative check(estimated_price is null or estimated_price>=0);

-- Never accept a customer-provided rental amount.
-- For day hire, we offer two exact 4-hour slots and one 8-hour slot.
-- For night hire, existing booking operating hours are 17:00 to 20:00.
create or replace function public.venue_get_quote(p_date date,p_start time,p_end time)
returns jsonb language plpgsql stable security definer
set search_path=public,pg_temp as $$
declare
  v_code text; v_hours integer; v_weekend_holiday boolean;
  v_weekday numeric; v_weekend numeric; v_amount numeric;
begin
  if p_date is null or p_start is null or p_end is null
     or p_start>=p_end then
    raise exception 'Invalid booking date or time';
  end if;
  if (p_start=time '09:00' and p_end=time '13:00')
     or (p_start=time '13:00' and p_end=time '17:00') then
    v_code:='HALF_DAY'; v_hours:=4;
  elsif p_start=time '09:00' and p_end=time '17:00' then
    v_code:='FULL_DAY'; v_hours:=8;
  elsif p_start>=time '17:00' and p_end<=time '20:00'
     and (extract(epoch from p_end-p_start)::integer % 3600)=0 then
    v_code:='NIGHT';
    v_hours:=extract(epoch from p_end-p_start)::integer/3600;
    if v_hours<1 then raise exception 'Evening bookings have a one-hour minimum';end if;
  else
    raise exception 'Select an available half-day, full-day or evening package';
  end if;
  v_weekend_holiday :=
    extract(isodow from p_date)::integer in (6,7)
    or exists(select 1 from public.venue_public_holidays h where h.holiday_date=p_date);
  select weekday_price, weekend_holiday_price into v_weekday,v_weekend
  from public.venue_rental_rates where code=v_code;
  if v_weekday is null or v_weekend is null then raise exception 'Rental rate unavailable';end if;
  v_amount:=case when v_weekend_holiday then v_weekend else v_weekday end;
  if v_code='NIGHT' then v_amount:=v_amount*v_hours;end if;
  return jsonb_build_object(
    'package',v_code,'hours',v_hours,'day_type',case when v_weekend_holiday then 'WEEKEND_OR_HOLIDAY' else 'WEEKDAY' end,
    'estimated_price',v_amount,'currency','MYR'
  );
end;
$$;
revoke all on function public.venue_get_quote(date,time,time) from public;
grant execute on function public.venue_get_quote(date,time,time) to anon,authenticated;

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
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
  v_capacity integer;
  v_quote jsonb;
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
     or p_date + p_start <= v_now then
    raise exception 'Invalid date or time';
  end if;
  v_quote:=public.venue_get_quote(p_date,p_start,p_end);
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
    applicant_email,applicant_phone,programme_title,participants,notes,
    booking_package,estimated_price
  ) values(
    p_room_id,p_date,p_start,p_end,trim(p_name),trim(coalesce(p_company,'')),
    lower(trim(p_email)),trim(p_phone),trim(p_title),p_participants,
    trim(coalesce(p_notes,'')),v_quote->>'package',(v_quote->>'estimated_price')::numeric
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.venue_submit_request(uuid,date,time,time,text,text,text,text,text,integer,text,text) from public;
grant execute on function public.venue_submit_request(uuid,date,time,time,text,text,text,text,text,integer,text,text) to anon,authenticated;
