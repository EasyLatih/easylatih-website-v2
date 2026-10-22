-- EasyLatih-owned training blocks use the same confirmed-calendar protection
-- as customer reservations, while remaining out of customer email and invoice flows.

alter table public.venue_bookings
  add column if not exists booking_source text not null default 'CUSTOMER';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venue_bookings_source_check'
      and conrelid = 'public.venue_bookings'::regclass
  ) then
    alter table public.venue_bookings
      add constraint venue_bookings_source_check
      check (booking_source in ('CUSTOMER','INTERNAL'));
  end if;
end $$;

comment on column public.venue_bookings.booking_source is
  'CUSTOMER for external requests; INTERNAL for EasyLatih-owned training calendar blocks.';

create or replace function public.venue_enqueue_mail_event()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  -- Internal EasyLatih training blocks must never create customer/admin email jobs.
  if new.booking_source = 'INTERNAL' then
    return new;
  end if;

  if TG_OP='INSERT' then
    insert into public.venue_email_outbox(booking_id,notification_kind)
    values(new.id,'NEW_ADMIN'),(new.id,'RECEIVED_CUSTOMER');
  elsif TG_OP='UPDATE' and old.status is distinct from new.status then
    if new.status='CONFIRMED' then
      insert into public.venue_email_outbox(booking_id,notification_kind)
      values(new.id,'CONFIRMED_CUSTOMER');
    elsif new.status='REJECTED' then
      insert into public.venue_email_outbox(booking_id,notification_kind)
      values(new.id,'REJECTED_CUSTOMER');
    elsif new.status='CANCELLED' then
      insert into public.venue_email_outbox(booking_id,notification_kind)
      values(new.id,'CANCELLED_CUSTOMER');
    end if;
  end if;
  perform public.venue_dispatch_mail(new.id);
  return new;
end;
$$;
