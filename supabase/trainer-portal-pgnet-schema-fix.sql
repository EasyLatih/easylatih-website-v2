-- Keep pg_net extension metadata outside the public schema so the Supabase security advisor remains clean.
-- Run after trainer-portal-production-hardening.sql.

drop trigger if exists invoke_trainer_notification_worker on public.notification_outbox;
drop function if exists private.invoke_trainer_notification_worker();
drop extension if exists pg_net;
create extension pg_net with schema extensions;

create or replace function private.invoke_trainer_notification_worker()
returns trigger
language plpgsql
security definer
set search_path=public,vault,net,pg_temp
as $$
declare worker_token text;
begin
  select decrypted_secret into worker_token from vault.decrypted_secrets where name='trainer_notification_worker_token' limit 1;
  perform net.http_post(
    url:='https://uxplxejkegommcandldj.supabase.co/functions/v1/trainer-notification-worker',
    headers:=jsonb_build_object('Content-Type','application/json','x-trainer-worker-token',worker_token),
    body:=jsonb_build_object('source','notification_outbox','notification_id',new.id),
    timeout_milliseconds:=5000
  );
  return new;
end $$;
revoke all on function private.invoke_trainer_notification_worker() from public,anon,authenticated;
create trigger invoke_trainer_notification_worker
after insert on public.notification_outbox
for each row execute function private.invoke_trainer_notification_worker();
