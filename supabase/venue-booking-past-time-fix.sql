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
     or p_date < v_now::date or p_date > v_now::date + 365 then
    raise exception 'Please choose a valid future booking date';
  end if;
  if p_date + p_start <= v_now then
    raise exception 'Selected start time has already passed in Malaysia. Please choose a future session.';
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
