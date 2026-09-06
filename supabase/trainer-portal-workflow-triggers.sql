-- Apply after trainer-portal-schema.sql and trainer-portal-security-fixes.sql.
-- Workflow automation kept inside the database so admin actions remain
-- consistent even if the frontend changes later.

create or replace function private.sync_trainer_collaboration_from_proposal()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.status = 'APPROVED_TO_COLLAB' and old.status is distinct from new.status then
    update public.profiles
       set collaboration_status = case
             when collaboration_status in ('APPLICANT','SHORTLISTED') then 'APPROVED_TO_COLLAB'
             else collaboration_status
           end,
           approved_at = coalesce(approved_at, now()),
           updated_at = now()
     where id = new.trainer_id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_trainer_collaboration_from_proposal() from public, anon, authenticated;

drop trigger if exists sync_trainer_collaboration_from_proposal on public.programme_proposals;
create trigger sync_trainer_collaboration_from_proposal
  after update of status on public.programme_proposals
  for each row execute function private.sync_trainer_collaboration_from_proposal();

create or replace function private.queue_visible_proposal_comment_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  trainer_id_value uuid;
  trainer_email text;
  proposal_title text;
begin
  if new.visibility <> 'TRAINER' or new.author_role <> 'ADMIN' then
    return new;
  end if;

  select p.trainer_id, p.title into trainer_id_value, proposal_title
    from public.programme_proposals p where p.id = new.proposal_id;
  select email into trainer_email from public.profiles where id = trainer_id_value;

  insert into public.notification_outbox(
    recipient_user_id, recipient_email, notification_type, subject, payload
  ) values (
    trainer_id_value,
    trainer_email,
    'PROPOSAL_COMMENT',
    'Update on your EasyLatih programme proposal',
    jsonb_build_object('proposal_id', new.proposal_id, 'title', proposal_title, 'comment_id', new.id)
  );
  return new;
end;
$$;
revoke all on function private.queue_visible_proposal_comment_email() from public, anon, authenticated;

drop trigger if exists queue_visible_proposal_comment_email on public.proposal_comments;
create trigger queue_visible_proposal_comment_email
  after insert on public.proposal_comments
  for each row execute function private.queue_visible_proposal_comment_email();

create or replace function private.sync_opportunity_recipient_response()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.opportunity_recipients
     set recipient_status = 'RESPONDED'
   where opportunity_id = new.opportunity_id
     and trainer_id = new.trainer_id;
  return new;
end;
$$;
revoke all on function private.sync_opportunity_recipient_response() from public, anon, authenticated;

drop trigger if exists sync_opportunity_recipient_response on public.opportunity_responses;
create trigger sync_opportunity_recipient_response
  after insert or update of response on public.opportunity_responses
  for each row execute function private.sync_opportunity_recipient_response();

create or replace function private.close_other_opportunity_recipients_on_award()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'AWARDED' and old.status is distinct from new.status then
    update public.opportunity_recipients
       set recipient_status = 'CLOSED'
     where opportunity_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.close_other_opportunity_recipients_on_award() from public, anon, authenticated;

drop trigger if exists close_other_opportunity_recipients_on_award on public.opportunities;
create trigger close_other_opportunity_recipients_on_award
  after update of status on public.opportunities
  for each row execute function private.close_other_opportunity_recipients_on_award();
