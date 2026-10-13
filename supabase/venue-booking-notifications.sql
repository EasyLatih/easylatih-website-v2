
-- EasyLatih venue notification queue. Additive, does not alter unrelated portal tables.
create table if not exists public.venue_email_outbox (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.venue_bookings(id) on delete cascade,
 notification_kind text not null check (notification_kind in ('NEW_ADMIN','RECEIVED_CUSTOMER','CONFIRMED_CUSTOMER','REJECTED_CUSTOMER','CANCELLED_CUSTOMER')),
 status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','SENT','FAILED')),
 attempts integer not null default 0 check (attempts between 0 and 10),
 created_at timestamptz not null default now(),
 claimed_at timestamptz,
 sent_at timestamptz,
 last_error text
);
create index if not exists venue_email_outbox_pending_idx on public.venue_email_outbox (status, created_at);
create index if not exists venue_email_outbox_booking_idx on public.venue_email_outbox (booking_id);
alter table public.venue_email_outbox enable row level security;
revoke all on public.venue_email_outbox from public, anon, authenticated;

create schema if not exists private;
create table if not exists private.venue_mailer_secret (
 id boolean primary key default true check (id),
 token text not null check(length(token)=64)
);
revoke all on private.venue_mailer_secret from public, anon, authenticated, service_role;
insert into private.venue_mailer_secret(id,token)
values (true,encode(gen_random_bytes(32),'hex'))
on conflict (id) do nothing;

-- Called only by trusted Supabase Edge Function with service-role credentials.
create or replace function public.venue_verify_mailer_token(p_token text)
returns boolean language plpgsql security definer
set search_path=private,public,pg_temp as $$
begin
 if auth.role() <> 'service_role' then return false; end if;
 return length(coalesce(p_token,''))=64
   and exists(select 1 from private.venue_mailer_secret s where s.id=true and s.token=p_token);
end;
$$;
revoke all on function public.venue_verify_mailer_token(text) from public, anon, authenticated;
grant execute on function public.venue_verify_mailer_token(text) to service_role;

create or replace function public.venue_claim_mail_queue(
 p_booking_id uuid default null,
 p_limit integer default 20
) returns setof public.venue_email_outbox
language plpgsql volatile security definer set search_path=public,pg_temp as $$
begin
 if auth.role() <> 'service_role' then raise exception 'Forbidden'; end if;
 return query
 with candidates as (
   select id from public.venue_email_outbox
    where attempts < 5
      and (status='PENDING' or (status='PROCESSING' and claimed_at < now()-interval '10 minutes'))
      and (p_booking_id is null or booking_id=p_booking_id)
    order by created_at, id
    for update skip locked
    limit least(greatest(coalesce(p_limit,20),1),20)
 )
 update public.venue_email_outbox m
 set status='PROCESSING', claimed_at=now(), attempts=m.attempts+1
 from candidates where m.id=candidates.id
 returning m.*;
end;
$$;
revoke all on function public.venue_claim_mail_queue(uuid,integer) from public,anon,authenticated;
grant execute on function public.venue_claim_mail_queue(uuid,integer) to service_role;

create or replace function public.venue_finish_mail(
 p_id uuid, p_success boolean, p_error text default null
) returns void language plpgsql volatile security definer
set search_path=public,pg_temp as $$
begin
 if auth.role() <> 'service_role' then raise exception 'Forbidden'; end if;
 update public.venue_email_outbox
 set status=case when p_success then 'SENT' when attempts>=5 then 'FAILED' else 'PENDING' end,
     sent_at=case when p_success then now() else null end,
     claimed_at=null,
     last_error=case when p_success then null else left(coalesce(p_error,'Email delivery failed'),500) end
 where id=p_id and status='PROCESSING';
end;
$$;
revoke all on function public.venue_finish_mail(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.venue_finish_mail(uuid,boolean,text) to service_role;

-- Supabase pg_net asynchronously calls the mailer after the transaction commits.
-- Worker token remains private in Postgres; it never reaches the website or public code.
create or replace function public.venue_dispatch_mail(p_booking_id uuid default null)
returns void language plpgsql volatile security definer
set search_path=public,private,net,pg_temp as $$
declare
 v_token text;
begin
 select token into v_token from private.venue_mailer_secret where id=true;
 if v_token is null then raise exception 'Venue mailer not configured'; end if;
 perform net.http_post(
   url:='https://uxplxejkegommcandldj.supabase.co/functions/v1/venue-mailer',
   body:=jsonb_build_object('booking_id',p_booking_id),
   headers:=jsonb_build_object('Content-Type','application/json','x-venue-mailer-token',v_token),
   timeout_milliseconds:=20000
 );
end;
$$;
revoke all on function public.venue_dispatch_mail(uuid) from public,anon,authenticated,service_role;

create or replace function public.venue_enqueue_mail_event()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
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

drop trigger if exists venue_mail_new_request on public.venue_bookings;
create trigger venue_mail_new_request after insert on public.venue_bookings
 for each row execute function public.venue_enqueue_mail_event();
drop trigger if exists venue_mail_status_change on public.venue_bookings;
create trigger venue_mail_status_change after update of status on public.venue_bookings
 for each row when (old.status is distinct from new.status)
 execute function public.venue_enqueue_mail_event();

-- Backup retry: pending or timed-out jobs are re-dispatched within five minutes.
select cron.schedule(
 'easylatih-venue-mailer-retry',
 '*/5 * * * *',
 'select public.venue_dispatch_mail(null::uuid);'
);
