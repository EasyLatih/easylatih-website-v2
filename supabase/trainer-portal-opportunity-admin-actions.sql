-- Admin lifecycle controls for trainer opportunities.
alter table public.opportunity_responses
  add column if not exists is_shortlisted boolean not null default false,
  add column if not exists shortlisted_at timestamptz;

alter table public.opportunities drop constraint if exists opportunities_status_check;
alter table public.opportunities add constraint opportunities_status_check
  check (status=any(array['DRAFT','OPEN','AWARDED','CLOSED','CANCELLED','ARCHIVED']));

create or replace function private.protect_response_award_fields()
returns trigger language plpgsql security invoker set search_path=public,auth,pg_temp as $$
begin
  if not private.is_admin() and (
    new.is_awarded is distinct from old.is_awarded
    or new.awarded_at is distinct from old.awarded_at
    or new.is_shortlisted is distinct from old.is_shortlisted
    or new.shortlisted_at is distinct from old.shortlisted_at
  ) then raise exception 'Trainer cannot modify award or shortlist fields'; end if;
  new.updated_at:=now(); return new;
end $$;
revoke all on function private.protect_response_award_fields() from public,anon,authenticated;

create or replace function private.queue_shortlist_notification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare trainer_email text; opportunity_title text;
begin
  if new.is_shortlisted=true and old.is_shortlisted is distinct from new.is_shortlisted then
    select p.email,o.title into trainer_email,opportunity_title
    from public.profiles p join public.opportunities o on o.id=new.opportunity_id
    where p.id=new.trainer_id;
    insert into public.notification_outbox(recipient_user_id,recipient_email,notification_type,subject,payload)
    values(new.trainer_id,trainer_email,'OPPORTUNITY_SHORTLISTED','EasyLatih Training Opportunity Shortlisted',jsonb_build_object('opportunity_id',new.opportunity_id,'title',opportunity_title));
  end if;
  return new;
end $$;
revoke all on function private.queue_shortlist_notification() from public,anon,authenticated;
drop trigger if exists queue_shortlist_notification on public.opportunity_responses;
create trigger queue_shortlist_notification after update of is_shortlisted on public.opportunity_responses
for each row execute function private.queue_shortlist_notification();
