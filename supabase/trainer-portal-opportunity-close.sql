-- Close all recipient cards and queue a final notification when an opportunity is awarded, closed or cancelled.
create or replace function private.close_opportunity_recipients_on_status()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  recipient record;
  subject_text text;
  notification_type_text text;
begin
  if new.status in ('AWARDED','CLOSED','CANCELLED') and old.status is distinct from new.status then
    update public.opportunity_recipients set recipient_status='CLOSED' where opportunity_id=new.id;

    for recipient in
      select r.trainer_id,p.email
      from public.opportunity_recipients r
      join public.profiles p on p.id=r.trainer_id
      where r.opportunity_id=new.id
    loop
      if new.status='AWARDED' and recipient.trainer_id=new.awarded_trainer_id then
        subject_text:='EasyLatih Training Opportunity Awarded';
        notification_type_text:='OPPORTUNITY_AWARDED';
      else
        subject_text:=case when new.status='CANCELLED' then 'EasyLatih Training Opportunity Cancelled' else 'EasyLatih Training Opportunity Closed' end;
        notification_type_text:=case when new.status='CANCELLED' then 'OPPORTUNITY_CANCELLED' else 'OPPORTUNITY_CLOSED' end;
      end if;

      insert into public.notification_outbox(recipient_user_id,recipient_email,notification_type,subject,payload)
      values(recipient.trainer_id,recipient.email,notification_type_text,subject_text,jsonb_build_object('opportunity_id',new.id,'title',new.title,'status',new.status));
    end loop;
  end if;
  return new;
end $$;
revoke all on function private.close_opportunity_recipients_on_status() from public,anon,authenticated;
drop trigger if exists close_opportunity_recipients_on_status on public.opportunities;
create trigger close_opportunity_recipients_on_status
after update of status on public.opportunities
for each row execute function private.close_opportunity_recipients_on_status();
