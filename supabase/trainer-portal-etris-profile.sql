-- Private structured trainer profile fields required for eTRiS preparation.
-- Personal identifiers in this table must never be exposed to anonymous/public catalogue access.

create table if not exists public.trainer_etris_profiles (
  trainer_id uuid primary key references public.profiles(id) on delete cascade,
  identity_no text not null default '',
  race text not null default '',
  academic_qualifications jsonb not null default '[]'::jsonb,
  professional_certifications jsonb not null default '[]'::jsonb,
  career_experience jsonb not null default '[]'::jsonb,
  training_experience jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint trainer_etris_academic_array check (jsonb_typeof(academic_qualifications) = 'array'),
  constraint trainer_etris_cert_array check (jsonb_typeof(professional_certifications) = 'array'),
  constraint trainer_etris_career_array check (jsonb_typeof(career_experience) = 'array'),
  constraint trainer_etris_training_array check (jsonb_typeof(training_experience) = 'array')
);

alter table public.trainer_etris_profiles enable row level security;

revoke all on table public.trainer_etris_profiles from anon;
revoke all on table public.trainer_etris_profiles from authenticated;
grant select, insert, update on table public.trainer_etris_profiles to authenticated;

create policy "trainer reads own etris profile"
on public.trainer_etris_profiles
for select
to authenticated
using (((select auth.uid()) = trainer_id) or private.is_admin());

create policy "approved trainer inserts own etris profile"
on public.trainer_etris_profiles
for insert
to authenticated
with check (
  (((select auth.uid()) = trainer_id)
    and exists (
      select 1 from public.profiles p
      where p.id = trainer_etris_profiles.trainer_id
        and p.collaboration_status in ('APPROVED_TO_COLLAB','ONBOARDING','ACTIVE')
    ))
  or private.is_admin()
);

create policy "trainer updates own etris profile"
on public.trainer_etris_profiles
for update
to authenticated
using (((select auth.uid()) = trainer_id) or private.is_admin())
with check (((select auth.uid()) = trainer_id) or private.is_admin());
