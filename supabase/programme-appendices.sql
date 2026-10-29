-- Appendices generator (Admin Centre → Appendices).
-- Stores the parts of the eTRiS Appendices (A–R) that are not in the Programs sheet,
-- so they only have to be typed once:
--   * appendix_course_profiles  – per course title (reused by every session of the same course):
--                                 HRD Corp programme code, description, relevance, retraining type, focus area.
--   * appendix_session_details  – per scheduled public session (Programs sheet CourseID):
--                                 full venue address, trainer name and IC, plus any manual overrides.
-- Admin only. Trainer IC numbers live here, so nothing is granted to anon.

create table if not exists public.appendix_course_profiles (
  course_key text primary key check (char_length(course_key) between 1 and 300),
  course_title text not null default '',
  hrd_programme_code text not null default '',
  description text not null default '',
  relevance text not null default '',
  retraining_type text not null default '',
  focus_area text not null default 'Not Applicable',
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.appendix_session_details (
  course_id text primary key check (char_length(course_id) between 1 and 120),
  course_key text not null default '',
  training_location text not null default 'Local',
  full_address text not null default '',
  trainer_id uuid references public.profiles(id) on delete set null,
  trainer_name text not null default '',
  trainer_ic text not null default '',
  overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(overrides) = 'object'),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.appendix_course_profiles enable row level security;
alter table public.appendix_session_details enable row level security;

revoke all on table public.appendix_course_profiles from anon;
revoke all on table public.appendix_session_details from anon;
grant select, insert, update, delete on table public.appendix_course_profiles to authenticated;
grant select, insert, update, delete on table public.appendix_session_details to authenticated;

drop policy if exists appendix_course_profiles_admin_all on public.appendix_course_profiles;
create policy appendix_course_profiles_admin_all on public.appendix_course_profiles
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists appendix_session_details_admin_all on public.appendix_session_details;
create policy appendix_session_details_admin_all on public.appendix_session_details
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create or replace function public.touch_appendix_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists appendix_course_profiles_touch on public.appendix_course_profiles;
create trigger appendix_course_profiles_touch before update on public.appendix_course_profiles
  for each row execute function public.touch_appendix_updated_at();

drop trigger if exists appendix_session_details_touch on public.appendix_session_details;
create trigger appendix_session_details_touch before update on public.appendix_session_details
  for each row execute function public.touch_appendix_updated_at();
