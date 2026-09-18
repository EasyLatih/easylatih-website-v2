create table if not exists public.trainer_consultancy_profiles (
  trainer_id uuid primary key references public.profiles(id) on delete cascade,
  available_for_consultancy boolean not null default false,
  consultancy_summary text,
  deliverables_summary text,
  rate_amount numeric(12,2),
  rate_basis text,
  rate_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainer_consultancy_rate_amount_check check (rate_amount is null or rate_amount >= 0),
  constraint trainer_consultancy_rate_basis_check check (rate_basis is null or rate_basis = any(array['HOURLY'::text,'HALF_DAY'::text,'DAILY'::text,'PROJECT'::text,'NEGOTIABLE'::text]))
);

alter table public.trainer_consultancy_profiles enable row level security;

drop policy if exists "trainer reads own consultancy profile" on public.trainer_consultancy_profiles;
create policy "trainer reads own consultancy profile"
on public.trainer_consultancy_profiles
for select
using (((select auth.uid()) = trainer_id) or private.is_admin());

drop policy if exists "trainer inserts own consultancy profile" on public.trainer_consultancy_profiles;
create policy "trainer inserts own consultancy profile"
on public.trainer_consultancy_profiles
for insert
with check (((select auth.uid()) = trainer_id) or private.is_admin());

drop policy if exists "trainer updates own consultancy profile" on public.trainer_consultancy_profiles;
create policy "trainer updates own consultancy profile"
on public.trainer_consultancy_profiles
for update
using (((select auth.uid()) = trainer_id) or private.is_admin())
with check (((select auth.uid()) = trainer_id) or private.is_admin());

drop policy if exists "admin deletes consultancy profile" on public.trainer_consultancy_profiles;
create policy "admin deletes consultancy profile"
on public.trainer_consultancy_profiles
for delete
using (private.is_admin());

create index if not exists trainer_consultancy_available_idx
on public.trainer_consultancy_profiles (available_for_consultancy)
where available_for_consultancy = true;
