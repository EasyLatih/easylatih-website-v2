-- EasyLatih Trainer Portal production hardening
-- Run after trainer-portal-schema.sql and trainer-portal-security-fixes.sql.
-- This file mirrors the additional rules applied to the dedicated EasyLatih Supabase project.

-- Proposal approval unlocks approved trainer onboarding.
create or replace function private.sync_approved_trainer()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='APPROVED_TO_COLLAB' and old.status is distinct from new.status then
    update public.profiles
      set collaboration_status='APPROVED_TO_COLLAB',approved_at=coalesce(approved_at,now()),updated_at=now()
      where id=new.trainer_id and collaboration_status in ('APPLICANT','SHORTLISTED');
  end if;
  return new;
end $$;
revoke all on function private.sync_approved_trainer() from public,anon,authenticated;
drop trigger if exists sync_approved_trainer on public.programme_proposals;
create trigger sync_approved_trainer after update of status on public.programme_proposals for each row execute function private.sync_approved_trainer();

-- Minimise Data API grants. RLS remains the row-level authority.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
grant select on public.portal_stats,public.training_categories to anon;
grant select on public.portal_stats to authenticated;
grant select,insert,update,delete on public.training_categories to authenticated;
grant select,update on public.profiles to authenticated;
grant select,insert,update on public.trainer_preferences to authenticated;
grant select,insert,update on public.programme_proposals to authenticated;
grant select,insert on public.proposal_comments to authenticated;
grant select,insert on public.trainer_agreements to authenticated;
grant select,insert,update on public.trainer_onboarding to authenticated;
grant select,insert,update on public.trainer_documents to authenticated;
grant select,insert,update,delete on public.programmes to authenticated;
grant select,insert,update,delete on public.programme_versions to authenticated;
grant select,insert,update,delete on public.opportunities to authenticated;
grant select,insert,update,delete on public.opportunity_recipients to authenticated;
grant select,insert,update on public.opportunity_responses to authenticated;
grant select,insert,update,delete on public.notification_outbox to authenticated;
grant usage,select on all sequences in schema public to authenticated;

-- FK/query indexes used by admin and trainer workflows.
create index if not exists idx_notification_outbox_recipient_user on public.notification_outbox(recipient_user_id);
create index if not exists idx_opportunities_awarded_trainer on public.opportunities(awarded_trainer_id);
create index if not exists idx_opportunities_created_by on public.opportunities(created_by);
create index if not exists idx_opportunity_responses_trainer on public.opportunity_responses(trainer_id);
create index if not exists idx_programme_versions_created_by on public.programme_versions(created_by);
create index if not exists idx_proposal_comments_author on public.proposal_comments(author_id);

-- Avoid overlapping broad ALL policies for admin-only tables.
drop policy if exists "admin manages categories" on public.training_categories;
create policy "admin inserts categories" on public.training_categories for insert to authenticated with check (private.is_admin());
create policy "admin updates categories" on public.training_categories for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admin deletes categories" on public.training_categories for delete to authenticated using (private.is_admin());

drop policy if exists "admin manages programme versions" on public.programme_versions;
create policy "admin inserts programme versions" on public.programme_versions for insert to authenticated with check (private.is_admin());
create policy "admin updates programme versions" on public.programme_versions for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admin deletes programme versions" on public.programme_versions for delete to authenticated using (private.is_admin());

drop policy if exists "admin manages opportunities" on public.opportunities;
create policy "admin inserts opportunities" on public.opportunities for insert to authenticated with check (private.is_admin());
create policy "admin updates opportunities" on public.opportunities for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admin deletes opportunities" on public.opportunities for delete to authenticated using (private.is_admin());

drop policy if exists "admin manages recipients" on public.opportunity_recipients;
create policy "admin inserts recipients" on public.opportunity_recipients for insert to authenticated with check (private.is_admin());
create policy "admin updates recipients" on public.opportunity_recipients for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admin deletes recipients" on public.opportunity_recipients for delete to authenticated using (private.is_admin());

drop policy if exists "admin manages notification queue" on public.notification_outbox;
create policy "admin inserts notification queue" on public.notification_outbox for insert to authenticated with check (private.is_admin());
create policy "admin updates notification queue" on public.notification_outbox for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admin deletes notification queue" on public.notification_outbox for delete to authenticated using (private.is_admin());

-- Trainer profile photos: public marketing asset, but only an accepted collaborator can upload to their own folder.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('trainer-profile-photos','trainer-profile-photos',true,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "approved trainer uploads own profile photo" on storage.objects;
create policy "approved trainer uploads own profile photo" on storage.objects for insert to authenticated with check (
  bucket_id='trainer-profile-photos'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.collaboration_status in ('ONBOARDING','ACTIVE'))
);
drop policy if exists "trainer reads own profile photo objects" on storage.objects;
create policy "trainer reads own profile photo objects" on storage.objects for select to authenticated using (
  bucket_id='trainer-profile-photos' and (storage.foldername(name))[1]=(select auth.uid()::text)
);
drop policy if exists "approved trainer updates own profile photo" on storage.objects;
create policy "approved trainer updates own profile photo" on storage.objects for update to authenticated
using(bucket_id='trainer-profile-photos' and (storage.foldername(name))[1]=(select auth.uid()::text))
with check(
  bucket_id='trainer-profile-photos'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.collaboration_status in ('ONBOARDING','ACTIVE'))
);
drop policy if exists "trainer deletes own profile photo" on storage.objects;
create policy "trainer deletes own profile photo" on storage.objects for delete to authenticated using (
  bucket_id='trainer-profile-photos' and (storage.foldername(name))[1]=(select auth.uid()::text)
);

-- Admin-controlled trainer preference/document fields.
create or replace function private.protect_preference_admin_fields()
returns trigger language plpgsql security invoker set search_path=public,auth,pg_temp as $$
begin
  if not private.is_admin() and (new.proposal_limit_override is distinct from old.proposal_limit_override or new.categories is distinct from old.categories) then
    raise exception 'Trainer cannot modify admin-controlled matching or proposal limit fields';
  end if;
  new.updated_at:=now(); return new;
end $$;
revoke all on function private.protect_preference_admin_fields() from public,anon,authenticated;
drop trigger if exists protect_preference_admin_fields on public.trainer_preferences;
create trigger protect_preference_admin_fields before update on public.trainer_preferences for each row execute function private.protect_preference_admin_fields();

create or replace function private.protect_document_verification()
returns trigger language plpgsql security invoker set search_path=public,auth,pg_temp as $$
begin
  if not private.is_admin() and new.verification_status is distinct from old.verification_status then raise exception 'Trainer cannot verify own documents'; end if;
  new.updated_at:=now(); return new;
end $$;
revoke all on function private.protect_document_verification() from public,anon,authenticated;
drop trigger if exists protect_document_verification on public.trainer_documents;
create trigger protect_document_verification before update on public.trainer_documents for each row execute function private.protect_document_verification();

-- Onboarding completion is derived server-side, not trusted from browser input.
create or replace function private.normalize_onboarding_completion()
returns trigger language plpgsql security invoker set search_path=public,auth,pg_temp as $$
begin
  new.updated_at:=now();
  if not private.is_admin() then
    if coalesce(new.academic_qualification,'')<>'' and coalesce(new.working_experience,'')<>'' and coalesce(new.training_experience,'')<>'' and coalesce(new.ttt_status,'')<>'' and coalesce(new.profile_photo_url,'')<>'' and new.photo_consent_at is not null
      then new.onboarding_completed_at:=case when tg_op='UPDATE' then coalesce(old.onboarding_completed_at,now()) else now() end;
      else new.onboarding_completed_at:=null;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.normalize_onboarding_completion() from public,anon,authenticated;
drop trigger if exists normalize_onboarding_completion on public.trainer_onboarding;
create trigger normalize_onboarding_completion before insert or update on public.trainer_onboarding for each row execute function private.normalize_onboarding_completion();

do $$ begin
  if not exists(select 1 from pg_constraint where conname='programme_proposals_max_learning_points') then
    alter table public.programme_proposals add constraint programme_proposals_max_learning_points check(cardinality(key_learning_points)<=5);
  end if;
end $$;

-- Full programme submission: trainer can create/edit only their own draft; review/eTRiS/publication remain admin controlled.
create or replace function private.protect_programme_admin_fields()
returns trigger language plpgsql security invoker set search_path=public,auth,pg_temp as $$
declare allowed_submit boolean:=false;
begin
  if not private.is_admin() then
    if new.trainer_id is distinct from old.trainer_id or new.proposal_id is distinct from old.proposal_id then raise exception 'Trainer cannot reassign programme ownership'; end if;
    allowed_submit:=old.publish_status='DRAFT' and new.publish_status='UNDER_REVIEW'
      and new.etris_status is not distinct from old.etris_status and new.etris_reference is not distinct from old.etris_reference
      and new.current_version is not distinct from old.current_version and new.published_at is not distinct from old.published_at;
    if (new.publish_status is distinct from old.publish_status or new.etris_status is distinct from old.etris_status or new.etris_reference is distinct from old.etris_reference or new.current_version is distinct from old.current_version or new.published_at is distinct from old.published_at) and not allowed_submit then
      raise exception 'Trainer cannot modify programme review, eTRiS or publication fields';
    end if;
  end if;
  new.updated_at:=now(); return new;
end $$;
revoke all on function private.protect_programme_admin_fields() from public,anon,authenticated;
drop trigger if exists protect_programme_admin_fields on public.programmes;
create trigger protect_programme_admin_fields before update on public.programmes for each row execute function private.protect_programme_admin_fields();

drop policy if exists "admin inserts programmes" on public.programmes;
drop policy if exists "approved trainer creates programme draft" on public.programmes;
drop policy if exists "programme insert access" on public.programmes;
create policy "programme insert access" on public.programmes for insert to authenticated with check (
  private.is_admin() or (
    (select auth.uid())=trainer_id and publish_status='DRAFT' and etris_status='NOT_SUBMITTED' and etris_reference is null and published_at is null and current_version=1
    and exists(select 1 from public.profiles p where p.id=trainer_id and p.collaboration_status in ('ONBOARDING','ACTIVE'))
    and exists(select 1 from public.programme_proposals pp where pp.id=proposal_id and pp.trainer_id=trainer_id and pp.status in ('APPROVED_TO_COLLAB','ONBOARDING','FULL_DETAILS_SUBMITTED','APPROVED_FOR_ETRIS','PUBLISHED'))
  )
);
drop policy if exists "admin updates programmes" on public.programmes;
drop policy if exists "trainer edits own programme draft" on public.programmes;
drop policy if exists "programme update access" on public.programmes;
create policy "programme update access" on public.programmes for update to authenticated
using(private.is_admin() or ((select auth.uid())=trainer_id and publish_status='DRAFT'))
with check(private.is_admin() or ((select auth.uid())=trainer_id and publish_status in ('DRAFT','UNDER_REVIEW')));
drop policy if exists "admin deletes programmes" on public.programmes;
create policy "admin deletes programmes" on public.programmes for delete to authenticated using(private.is_admin());

grant insert,update on public.programmes to authenticated;

create or replace function private.sync_full_programme_submission()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.publish_status='UNDER_REVIEW' and old.publish_status is distinct from new.publish_status and new.proposal_id is not null then
    update public.programme_proposals set status='FULL_DETAILS_SUBMITTED',updated_at=now()
      where id=new.proposal_id and trainer_id=new.trainer_id and status in ('APPROVED_TO_COLLAB','ONBOARDING');
  end if;
  return new;
end $$;
revoke all on function private.sync_full_programme_submission() from public,anon,authenticated;
drop trigger if exists sync_full_programme_submission on public.programmes;
create trigger sync_full_programme_submission after update of publish_status on public.programmes for each row execute function private.sync_full_programme_submission();

-- Opportunity responses require an actual assignment and an open response window.
drop policy if exists "trainer inserts own response" on public.opportunity_responses;
create policy "trainer inserts own response" on public.opportunity_responses for insert to authenticated with check (
  ((select auth.uid())=trainer_id and is_awarded=false
    and exists(select 1 from public.opportunity_recipients r where r.opportunity_id=opportunity_id and r.trainer_id=(select auth.uid()))
    and exists(select 1 from public.opportunities o where o.id=opportunity_id and o.status='OPEN' and o.response_deadline>=now()))
  or private.is_admin()
);
drop policy if exists "trainer updates own response" on public.opportunity_responses;
create policy "trainer updates own response" on public.opportunity_responses for update to authenticated
using((select auth.uid())=trainer_id or private.is_admin())
with check((((select auth.uid())=trainer_id)
    and exists(select 1 from public.opportunity_recipients r where r.opportunity_id=opportunity_id and r.trainer_id=(select auth.uid()))
    and exists(select 1 from public.opportunities o where o.id=opportunity_id and o.status='OPEN' and o.response_deadline>=now()))
  or private.is_admin());

create or replace function private.sync_opportunity_response_recipient()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.opportunity_recipients set recipient_status='RESPONDED' where opportunity_id=new.opportunity_id and trainer_id=new.trainer_id;
  return new;
end $$;
revoke all on function private.sync_opportunity_response_recipient() from public,anon,authenticated;
drop trigger if exists sync_opportunity_response_recipient on public.opportunity_responses;
create trigger sync_opportunity_response_recipient after insert or update on public.opportunity_responses for each row execute function private.sync_opportunity_response_recipient();

-- Generic trainer portal email queue for admin comments and opportunity broadcasts.
create or replace function private.queue_trainer_comment_email()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare trainer_id_value uuid; trainer_email text; proposal_title text;
begin
  if new.visibility<>'TRAINER' or new.author_role<>'ADMIN' then return new; end if;
  select p.trainer_id,p.title,pr.email into trainer_id_value,proposal_title,trainer_email
  from public.programme_proposals p join public.profiles pr on pr.id=p.trainer_id where p.id=new.proposal_id;
  if trainer_email is not null then
    insert into public.notification_outbox(recipient_user_id,recipient_email,notification_type,subject,payload)
    values(trainer_id_value,trainer_email,'TRAINER_PORTAL_UPDATE','New EasyLatih Trainer Portal Update',jsonb_build_object('proposal_id',new.proposal_id,'title',proposal_title));
  end if;
  return new;
end $$;
revoke all on function private.queue_trainer_comment_email() from public,anon,authenticated;
drop trigger if exists queue_trainer_comment_email on public.proposal_comments;
create trigger queue_trainer_comment_email after insert on public.proposal_comments for each row execute function private.queue_trainer_comment_email();

-- Notification worker custom-auth token + pg_net invocation.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select vault.create_secret(
  replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  'trainer_notification_worker_token'
) where not exists(select 1 from vault.decrypted_secrets where name='trainer_notification_worker_token');

create or replace function public.verify_trainer_worker_token(candidate text)
returns boolean language sql stable security definer set search_path=vault,pg_temp as $$
  select exists(select 1 from vault.decrypted_secrets where name='trainer_notification_worker_token' and decrypted_secret=candidate)
$$;
revoke all on function public.verify_trainer_worker_token(text) from public,anon,authenticated;
grant execute on function public.verify_trainer_worker_token(text) to service_role;

create or replace function private.invoke_trainer_notification_worker()
returns trigger language plpgsql security definer set search_path=public,vault,net,pg_temp as $$
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
drop trigger if exists invoke_trainer_notification_worker on public.notification_outbox;
create trigger invoke_trainer_notification_worker after insert on public.notification_outbox for each row execute function private.invoke_trainer_notification_worker();

-- Retry pending notifications every 10 minutes. The Edge Function leaves rows pending when provider credentials are not configured.
select cron.schedule(
  'retry-easylatih-trainer-notifications',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url:='https://uxplxejkegommcandldj.supabase.co/functions/v1/trainer-notification-worker',
    headers:=jsonb_build_object('Content-Type','application/json','x-trainer-worker-token',(select decrypted_secret from vault.decrypted_secrets where name='trainer_notification_worker_token' limit 1)),
    body:=jsonb_build_object('source','cron-retry'),
    timeout_milliseconds:=5000
  ) where exists(select 1 from public.notification_outbox where delivery_status='PENDING' and attempts<5);
  $cron$
);
