
-- EasyLatih: daytime hourly pricing and night window 20:00–24:00 (midnight).
-- Keep existing half-day/full-day rates and historical booking price snapshots.
alter table public.venue_rental_rates
  drop constraint if exists venue_rental_rates_code_check;
alter table public.venue_rental_rates
  add constraint venue_rental_rates_code_check
  check (code in ('DAY_HOURLY','HALF_DAY','FULL_DAY','NIGHT'));

insert into public.venue_rental_rates(code,label,weekday_price,weekend_holiday_price)
values ('DAY_HOURLY','Daytime Hourly (1–3 hours)',80,110)
on conflict (code) do nothing;

create or replace function public.venue_get_quote(p_date date,p_start time,p_end time)
returns jsonb language plpgsql stable security definer
set search_path=public,pg_temp as $$
declare
  v_code text;
  v_hours integer;
  v_weekend_holiday boolean;
  v_weekday numeric;
  v_weekend numeric;
  v_amount numeric;
  v_length_seconds numeric;
begin
  if p_date is null or p_start is null or p_end is null
     or p_start>=p_end then
    raise exception 'Invalid booking date or time';
  end if;
  v_length_seconds := extract(epoch from (p_end - p_start));
  -- Every hourly reservation has a whole-hour duration and starts on the hour.
  if (p_start=time '09:00' and p_end=time '13:00')
     or (p_start=time '13:00' and p_end=time '17:00') then
    v_code:='HALF_DAY'; v_hours:=4;
  elsif p_start=time '09:00' and p_end=time '17:00' then
    v_code:='FULL_DAY'; v_hours:=8;
  elsif p_start>=time '09:00' and p_end<=time '17:00'
        and mod(extract(epoch from p_start)::integer,3600)=0
        and mod(v_length_seconds::integer,3600)=0
        and v_length_seconds between 3600 and 10800 then
    v_code:='DAY_HOURLY'; v_hours:=v_length_seconds::integer/3600;
  elsif p_start>=time '20:00' and p_end<=time '24:00'
        and mod(extract(epoch from p_start)::integer,3600)=0
        and mod(v_length_seconds::integer,3600)=0
        and v_length_seconds between 3600 and 14400 then
    v_code:='NIGHT'; v_hours:=v_length_seconds::integer/3600;
  else
    raise exception 'Please choose an eligible daytime or night booking slot';
  end if;
  v_weekend_holiday :=
    extract(isodow from p_date)::integer in (6,7)
    or exists(select 1 from public.venue_public_holidays h where h.holiday_date=p_date);
  select weekday_price,weekend_holiday_price into v_weekday,v_weekend
  from public.venue_rental_rates where code=v_code;
  if v_weekday is null or v_weekend is null then
    raise exception 'Rental rate unavailable';
  end if;
  v_amount:=case when v_weekend_holiday then v_weekend else v_weekday end;
  if v_code in ('NIGHT','DAY_HOURLY') then v_amount:=v_amount*v_hours; end if;
  return jsonb_build_object(
    'package',v_code,
    'hours',v_hours,
    'day_type',case when v_weekend_holiday then 'WEEKEND_OR_HOLIDAY' else 'WEEKDAY' end,
    'estimated_price',v_amount,
    'currency','MYR'
  );
end;
$$;
revoke all on function public.venue_get_quote(date,time,time) from public;
grant execute on function public.venue_get_quote(date,time,time) to anon,authenticated;

-- venue_submit_request already delegates to venue_get_quote and inherits these
-- booking-window and rate rules. No customer-supplied price is accepted.
