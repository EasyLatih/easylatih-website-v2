-- EasyLatih Trainer Collaboration Portal
-- Initial schema for a dedicated EasyLatih Supabase project.
-- Run on a NEW project, review with Supabase security/performance advisors,
-- then set the EasyLatih admin user's app_metadata.role to "admin".

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.portal_stats (
  id smallint primary key default 1 check (id = 1),
  registered_trainers integer not null default 0,
  approved_collaborators integer not null default 0,
  active_trainers integer not null default 0,
  proposals_under_review integer not null default 0,
  published_programmes integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.portal_stats (id) values (1) on conflict (id) do nothing;

create table if not exists public.training_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  intake_status text not null default 'OPEN' check (intake_status in ('OPEN','LIMITED','CLOSED')),
  active_trainer_count integer not null default 0,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.training_categories (name,sort_order) values
('Human Resource',10),('Finance & Accounting',20),('Leadership',30),('Sales & Marketing',40),
('Digital & AI',50),('Customer Service',60),('Quality & Productivity',70),('Safety & Technical',80),
('Administration',90),('Communication',100),('Entrepreneurship',110),('Other',999)
on conflict (name) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text not null,
  state text not null,
  expertise_summary text not null,
  linkedin_url text,
  professional_bio text,
  collaboration_status text not null default 'APPLICANT' check (collaboration_status in ('APPLICANT','SHORTLISTED','APPROVED_TO_COLLAB','ONBOARDING','ACTIVE','INACTIVE','REJECTED')),
  availability_status text not null default 'AVAILABLE' check (availability_status in ('AVAILABLE','LIMITED','UNAVAILABLE')),
  privacy_notice_version text,
  privacy_acknowledged_at timestamptz,
  marketing_consent boolean not null default false,
  terms_version text,
  terms_accepted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_preferences (
  trainer_id uuid primary key references public.profiles(id) on delete cascade,
  accepts_public boolean not null default true,
  accepts_inhouse boolean not null default true,
  accepts_online boolean not null default true,
  travel_states text[] not null default '{}',
  expertise_tags text[] not null default '{}',
  categories text[] not null default '{}',
  proposal_limit_override integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.programme_proposals (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null,
  training_type text not null check (training_type in ('PUBLIC','INHOUSE','BOTH')),
  target_audience text not null,
  problem_statement text not null,
  summary text not null,
  key_learning_points text[] not null default '{}',
  duration text not null,
  delivery_method text not null,
  preferred_location text,
  expected_fee numeric(12,2),
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED','UNDER_REVIEW','CLARIFICATION_REQUIRED','SHORTLISTED','KEEP_FOR_FUTURE','APPROVED_TO_COLLAB','ONBOARDING','FULL_DETAILS_SUBMITTED','APPROVED_FOR_ETRIS','PUBLISHED','REJECTED','WITHDRAWN','INACTIVE')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_programme_proposals_trainer_status on public.programme_proposals(trainer_id,status);
create index if not exists idx_programme_proposals_category on public.programme_proposals(category);

create table if not exists public.proposal_comments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.programme_proposals(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_role text not null check (author_role in ('TRAINER','ADMIN')),
  visibility text not null default 'TRAINER' check (visibility in ('TRAINER','INTERNAL')),
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists idx_proposal_comments_proposal on public.proposal_comments(proposal_id,created_at);

create table if not exists public.trainer_agreements (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  agreement_type text not null check (agreement_type in ('PRIVACY_NOTICE','TRAINER_COLLABORATION','PHOTO_MARKETING_CONSENT')),
  version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_trainer_agreements_trainer on public.trainer_agreements(trainer_id,agreement_type,accepted_at desc);

create table if not exists public.trainer_onboarding (
  trainer_id uuid primary key references public.profiles(id) on delete cascade,
  academic_qualification text,
  professional_certifications text,
  working_experience text,
  training_experience text,
  industry_experience text,
  ttt_status text,
  profile_photo_url text,
  profile_photo_storage_path text,
  photo_consent_version text,
  photo_consent_at timestamptz,
  onboarding_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_documents (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null,
  provider text not null default 'GOOGLE_DRIVE' check (provider in ('GOOGLE_DRIVE','SUPABASE_STORAGE')),
  file_name text not null,
  file_id text,
  file_url text,
  expiry_date date,
  verification_status text not null default 'PENDING' check (verification_status in ('PENDING','VERIFIED','REJECTED','EXPIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_trainer_documents_trainer on public.trainer_documents(trainer_id,document_type);

create table if not exists public.programmes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid unique references public.programme_proposals(id) on delete set null,
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null,
  training_type text not null check (training_type in ('PUBLIC','INHOUSE','BOTH')),
  programme_overview text,
  learning_objectives text[] not null default '{}',
  learning_outcomes text[] not null default '{}',
  target_participants text,
  prerequisites text,
  duration text,
  total_contact_hours numeric(6,2),
  delivery_method text,
  training_methodology text,
  modules jsonb not null default '[]'::jsonb,
  assessment_method text,
  maximum_participants integer,
  venue_requirements text,
  etris_status text not null default 'NOT_SUBMITTED' check (etris_status in ('NOT_SUBMITTED','READY','SUBMITTED','APPROVED','AMENDMENT_REQUIRED')),
  etris_reference text,
  publish_status text not null default 'DRAFT' check (publish_status in ('DRAFT','UNDER_REVIEW','APPROVED','PUBLISHED','UNPUBLISHED')),
  current_version integer not null default 1,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_programmes_trainer on public.programmes(trainer_id,publish_status);
create index if not exists idx_programmes_category on public.programmes(category);

create table if not exists public.programme_versions (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(programme_id,version_number)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  training_type text not null check (training_type in ('PUBLIC','INHOUSE')),
  category text not null,
  expertise_tags text[] not null default '{}',
  client_industry text,
  location text,
  training_date date,
  duration text,
  target_audience text,
  estimated_pax integer,
  trainer_fee_min numeric(12,2),
  trainer_fee_max numeric(12,2),
  special_requirements text,
  response_deadline timestamptz not null,
  status text not null default 'OPEN' check (status in ('DRAFT','OPEN','AWARDED','CLOSED','CANCELLED')),
  awarded_trainer_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_opportunities_status_deadline on public.opportunities(status,response_deadline);

create table if not exists public.opportunity_recipients (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz,
  recipient_status text not null default 'NOTIFIED' check (recipient_status in ('NOTIFIED','VIEWED','RESPONDED','CLOSED')),
  created_at timestamptz not null default now(),
  unique(opportunity_id,trainer_id)
);
create index if not exists idx_opportunity_recipients_trainer on public.opportunity_recipients(trainer_id,created_at desc);

create table if not exists public.opportunity_responses (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('INTERESTED','UNAVAILABLE','NOT_INTERESTED')),
  proposed_fee numeric(12,2),
  remarks text,
  responded_at timestamptz not null default now(),
  is_awarded boolean not null default false,
  awarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(opportunity_id,trainer_id)
);
create index if not exists idx_opportunity_responses_opportunity on public.opportunity_responses(opportunity_id,response);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_email text not null,
  notification_type text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'PENDING' check (delivery_status in ('PENDING','SENT','FAILED','CANCELLED')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists idx_notification_outbox_pending on public.notification_outbox(delivery_status,created_at);

-- Helpers
create or replace function private.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_temp
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;
revoke all on function private.is_admin() from public, anon, authenticated;

create or replace function private.handle_new_trainer()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles (
    id,email,full_name,phone,state,expertise_summary,linkedin_url,
    privacy_notice_version,privacy_acknowledged_at,marketing_consent
  ) values (
    new.id,
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'phone',''),
    coalesce(new.raw_user_meta_data->>'state',''),
    coalesce(new.raw_user_meta_data->>'expertise_summary',''),
    nullif(new.raw_user_meta_data->>'linkedin_url',''),
    new.raw_user_meta_data->>'privacy_notice_version',
    nullif(new.raw_user_meta_data->>'privacy_acknowledged_at','')::timestamptz,
    coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean,false)
  );
  insert into public.trainer_preferences(trainer_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_trainer() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_trainer();

create or replace function private.enforce_five_active_proposals()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  active_count integer;
  trainer_limit integer;
begin
  if new.status not in ('SUBMITTED','UNDER_REVIEW','CLARIFICATION_REQUIRED','SHORTLISTED','APPROVED_TO_COLLAB','ONBOARDING','FULL_DETAILS_SUBMITTED','APPROVED_FOR_ETRIS') then
    return new;
  end if;
  select coalesce(proposal_limit_override,5) into trainer_limit from public.trainer_preferences where trainer_id=new.trainer_id;
  trainer_limit := coalesce(trainer_limit,5);
  select count(*) into active_count from public.programme_proposals
   where trainer_id=new.trainer_id
     and status in ('SUBMITTED','UNDER_REVIEW','CLARIFICATION_REQUIRED','SHORTLISTED','APPROVED_TO_COLLAB','ONBOARDING','FULL_DETAILS_SUBMITTED','APPROVED_FOR_ETRIS')
     and (tg_op='INSERT' or id<>new.id);
  if active_count >= trainer_limit then
    raise exception 'Maximum active programme proposal limit reached';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_five_active_proposals() from public, anon, authenticated;

drop trigger if exists enforce_active_proposal_limit on public.programme_proposals;
create trigger enforce_active_proposal_limit before insert or update of status on public.programme_proposals for each row execute function private.enforce_five_active_proposals();

create or replace function private.protect_profile_admin_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
begin
  if not private.is_admin() then
    if new.collaboration_status is distinct from old.collaboration_status
       or new.approved_at is distinct from old.approved_at
       or new.terms_version is distinct from old.terms_version
       or new.terms_accepted_at is distinct from old.terms_accepted_at then
      raise exception 'Trainer cannot modify admin-controlled collaboration fields directly';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.protect_profile_admin_fields() from public, anon, authenticated;

drop trigger if exists protect_profile_admin_fields on public.profiles;
create trigger protect_profile_admin_fields before update on public.profiles for each row execute function private.protect_profile_admin_fields();

create or replace function private.protect_response_award_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
begin
  if not private.is_admin() and (new.is_awarded is distinct from old.is_awarded or new.awarded_at is distinct from old.awarded_at) then
    raise exception 'Trainer cannot award an opportunity';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.protect_response_award_fields() from public, anon, authenticated;

drop trigger if exists protect_response_award_fields on public.opportunity_responses;
create trigger protect_response_award_fields before update on public.opportunity_responses for each row execute function private.protect_response_award_fields();

create or replace function private.seed_opportunity_recipients()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
begin
  if new.status <> 'OPEN' then return new; end if;
  insert into public.opportunity_recipients(opportunity_id,trainer_id)
  select new.id,p.id
  from public.profiles p
  join public.trainer_preferences pref on pref.trainer_id=p.id
  where p.collaboration_status='ACTIVE'
    and p.availability_status<>'UNAVAILABLE'
    and ((new.training_type='PUBLIC' and pref.accepts_public) or (new.training_type='INHOUSE' and pref.accepts_inhouse))
    and (
      new.category = any(pref.categories)
      or exists(select 1 from public.programme_proposals pp where pp.trainer_id=p.id and pp.category=new.category and pp.status in ('APPROVED_TO_COLLAB','ONBOARDING','FULL_DETAILS_SUBMITTED','APPROVED_FOR_ETRIS','PUBLISHED'))
      or exists(select 1 from public.programmes pg where pg.trainer_id=p.id and pg.category=new.category and pg.publish_status in ('APPROVED','PUBLISHED'))
    )
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.seed_opportunity_recipients() from public, anon, authenticated;

drop trigger if exists seed_opportunity_recipients on public.opportunities;
create trigger seed_opportunity_recipients after insert on public.opportunities for each row execute function private.seed_opportunity_recipients();

create or replace function private.queue_opportunity_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  trainer_email text;
  opportunity_title text;
begin
  select email into trainer_email from public.profiles where id=new.trainer_id;
  select title into opportunity_title from public.opportunities where id=new.opportunity_id;
  insert into public.notification_outbox(recipient_user_id,recipient_email,notification_type,subject,payload)
  values(new.trainer_id,trainer_email,'NEW_TRAINING_OPPORTUNITY','New EasyLatih Training Opportunity',jsonb_build_object('opportunity_id',new.opportunity_id,'title',opportunity_title));
  return new;
end;
$$;
revoke all on function private.queue_opportunity_email() from public, anon, authenticated;

drop trigger if exists queue_opportunity_email on public.opportunity_recipients;
create trigger queue_opportunity_email after insert on public.opportunity_recipients for each row execute function private.queue_opportunity_email();

create or replace function private.refresh_portal_stats()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.portal_stats set
    registered_trainers=(select count(*) from public.profiles),
    approved_collaborators=(select count(*) from public.profiles where collaboration_status in ('APPROVED_TO_COLLAB','ONBOARDING','ACTIVE')),
    active_trainers=(select count(*) from public.profiles where collaboration_status='ACTIVE'),
    proposals_under_review=(select count(*) from public.programme_proposals where status in ('SUBMITTED','UNDER_REVIEW','CLARIFICATION_REQUIRED','SHORTLISTED')),
    published_programmes=(select count(*) from public.programmes where publish_status='PUBLISHED'),
    updated_at=now()
  where id=1;

  update public.training_categories c set
    active_trainer_count=(
      select count(distinct p.id)
      from public.profiles p
      left join public.trainer_preferences pref on pref.trainer_id=p.id
      where p.collaboration_status='ACTIVE'
        and (c.name = any(coalesce(pref.categories,'{}'::text[]))
          or exists(select 1 from public.programmes pg where pg.trainer_id=p.id and pg.category=c.name and pg.publish_status in ('APPROVED','PUBLISHED')))
    ),
    updated_at=now();
  return null;
end;
$$;
revoke all on function private.refresh_portal_stats() from public, anon, authenticated;

drop trigger if exists refresh_stats_profiles on public.profiles;
create trigger refresh_stats_profiles after insert or update or delete on public.profiles for each statement execute function private.refresh_portal_stats();
drop trigger if exists refresh_stats_proposals on public.programme_proposals;
create trigger refresh_stats_proposals after insert or update or delete on public.programme_proposals for each statement execute function private.refresh_portal_stats();
drop trigger if exists refresh_stats_programmes on public.programmes;
create trigger refresh_stats_programmes after insert or update or delete on public.programmes for each statement execute function private.refresh_portal_stats();
drop trigger if exists refresh_stats_preferences on public.trainer_preferences;
create trigger refresh_stats_preferences after insert or update or delete on public.trainer_preferences for each statement execute function private.refresh_portal_stats();

-- Row Level Security
alter table public.portal_stats enable row level security;
alter table public.training_categories enable row level security;
alter table public.profiles enable row level security;
alter table public.trainer_preferences enable row level security;
alter table public.programme_proposals enable row level security;
alter table public.proposal_comments enable row level security;
alter table public.trainer_agreements enable row level security;
alter table public.trainer_onboarding enable row level security;
alter table public.trainer_documents enable row level security;
alter table public.programmes enable row level security;
alter table public.programme_versions enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_recipients enable row level security;
alter table public.opportunity_responses enable row level security;
alter table public.notification_outbox enable row level security;

create policy "public reads portal stats" on public.portal_stats for select to anon,authenticated using (true);
create policy "public reads category intake" on public.training_categories for select to anon,authenticated using (true);
create policy "admin manages categories" on public.training_categories for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "trainer reads own profile" on public.profiles for select to authenticated using ((select auth.uid())=id or private.is_admin());
create policy "trainer updates own profile" on public.profiles for update to authenticated using ((select auth.uid())=id or private.is_admin()) with check ((select auth.uid())=id or private.is_admin());

create policy "trainer reads own preferences" on public.trainer_preferences for select to authenticated using ((select auth.uid())=trainer_id or private.is_admin());
create policy "trainer writes own preferences" on public.trainer_preferences for insert to authenticated with check ((select auth.uid())=trainer_id or private.is_admin());
create policy "trainer updates own preferences" on public.trainer_preferences for update to authenticated using ((select auth.uid())=trainer_id or private.is_admin()) with check ((select auth.uid())=trainer_id or private.is_admin());

create policy "trainer reads own proposals" on public.programme_proposals for select to authenticated using ((select auth.uid())=trainer_id or private.is_admin());
create policy "trainer submits own proposals" on public.programme_proposals for insert to authenticated with check ((select auth.uid())=trainer_id and status='SUBMITTED' or private.is_admin());
create policy "admin updates proposals" on public.programme_proposals for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "trainer reads visible proposal comments" on public.proposal_comments for select to authenticated using (
  private.is_admin() or (
    visibility='TRAINER' and exists(select 1 from public.programme_proposals p where p.id=proposal_id and p.trainer_id=(select auth.uid()))
  )
);
create policy "trainer adds own proposal comments" on public.proposal_comments for insert to authenticated with check (
  (author_id=(select auth.uid()) and author_role='TRAINER' and visibility='TRAINER' and exists(select 1 from public.programme_proposals p where p.id=proposal_id and p.trainer_id=(select auth.uid())))
  or private.is_admin()
);

create policy "trainer reads own agreements" on public.trainer_agreements for select to authenticated using ((select auth.uid())=trainer_id or private.is_admin());
create policy "trainer accepts own agreements" on public.trainer_agreements for insert to authenticated with check ((select auth.uid())=trainer_id or private.is_admin());

create policy "trainer reads own onboarding" on public.trainer_onboarding for select to authenticated using ((select auth.uid())=trainer_id or private.is_admin());
create policy "approved trainer inserts onboarding" on public.trainer_onboarding for insert to authenticated with check ((select auth.uid())=trainer_id and exists(select 1 from public.profiles p where p.id=trainer_id and p.collaboration_status in ('APPROVED_TO_COLLAB','ONBOARDING','ACTIVE')) or private.is_admin());
create policy "approved trainer updates onboarding" on public.trainer_onboarding for update to authenticated using ((select auth.uid())=trainer_id or private.is_admin()) with check ((select auth.uid())=trainer_id or private.is_admin());

create policy "trainer reads own documents" on public.trainer_documents for select to authenticated using ((select auth.uid())=trainer_id or private.is_admin());
create policy "approved trainer inserts documents" on public.trainer_documents for insert to authenticated with check ((select auth.uid())=trainer_id and exists(select 1 from public.profiles p where p.id=trainer_id and p.collaboration_status in ('APPROVED_TO_COLLAB','ONBOARDING','ACTIVE')) or private.is_admin());
create policy "trainer updates own pending documents" on public.trainer_documents for update to authenticated using (((select auth.uid())=trainer_id and verification_status='PENDING') or private.is_admin()) with check (((select auth.uid())=trainer_id) or private.is_admin());

create policy "trainer reads own programmes" on public.programmes for select to authenticated using ((select auth.uid())=trainer_id or private.is_admin());
create policy "admin manages programmes" on public.programmes for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "trainer reads own programme versions" on public.programme_versions for select to authenticated using (private.is_admin() or exists(select 1 from public.programmes p where p.id=programme_id and p.trainer_id=(select auth.uid())));
create policy "admin manages programme versions" on public.programme_versions for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "trainer reads assigned opportunities" on public.opportunities for select to authenticated using (
  private.is_admin() or exists(select 1 from public.opportunity_recipients r where r.opportunity_id=public.opportunities.id and r.trainer_id=(select auth.uid()))
);
create policy "admin manages opportunities" on public.opportunities for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "trainer reads own opportunity recipients" on public.opportunity_recipients for select to authenticated using ((select auth.uid())=trainer_id or private.is_admin());
create policy "admin manages opportunity recipients" on public.opportunity_recipients for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "trainer reads own responses" on public.opportunity_responses for select to authenticated using ((select auth.uid())=trainer_id or private.is_admin());
create policy "trainer inserts own response" on public.opportunity_responses for insert to authenticated with check ((select auth.uid())=trainer_id and is_awarded=false or private.is_admin());
create policy "trainer updates own response" on public.opportunity_responses for update to authenticated using ((select auth.uid())=trainer_id or private.is_admin()) with check ((select auth.uid())=trainer_id or private.is_admin());

create policy "admin reads notification queue" on public.notification_outbox for select to authenticated using (private.is_admin());
create policy "admin manages notification queue" on public.notification_outbox for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Explicit Data API grants. RLS remains the authorization layer.
grant usage on schema public to anon, authenticated;
grant select on public.portal_stats, public.training_categories to anon;
grant select on all tables in schema public to authenticated;
grant insert,update on public.profiles,public.trainer_preferences,public.programme_proposals,public.proposal_comments,public.trainer_agreements,public.trainer_onboarding,public.trainer_documents,public.opportunity_responses to authenticated;
grant insert,update,delete on public.training_categories,public.programmes,public.programme_versions,public.opportunities,public.opportunity_recipients,public.notification_outbox to authenticated;
grant usage,select on all sequences in schema public to authenticated;

-- Initialise stats after schema creation.
update public.portal_stats set updated_at=now() where id=1;
