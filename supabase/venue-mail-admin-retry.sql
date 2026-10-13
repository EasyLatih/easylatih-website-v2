
-- Admin-only insight into mail delivery, with a safe retry action for failed messages.
grant select on public.venue_email_outbox to authenticated;
drop policy if exists venue_mail_admin_read on public.venue_email_outbox;
create policy venue_mail_admin_read on public.venue_email_outbox
for select to authenticated using (private.is_admin());

create or replace function public.venue_retry_failed_mail(p_id uuid)
returns boolean language plpgsql volatile security definer
set search_path=public,pg_temp as $$
declare
 v_booking uuid;
begin
 if not private.is_admin() then raise exception 'Forbidden'; end if;
 update public.venue_email_outbox
 set status='PENDING', attempts=0, claimed_at=null, last_error=null
 where id=p_id and status='FAILED'
 returning booking_id into v_booking;
 if v_booking is null then return false; end if;
 perform public.venue_dispatch_mail(v_booking);
 return true;
end;
$$;
revoke all on function public.venue_retry_failed_mail(uuid) from public,anon,authenticated;
grant execute on function public.venue_retry_failed_mail(uuid) to authenticated;
