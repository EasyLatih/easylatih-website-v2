-- EasyLatih Admin Centre: My Workspace (routine ticks, journal, tasks, training prep)
-- Applied 2026-10-28. Each row belongs to one admin account; only that admin can read or write it.

create table if not exists public.workspace_days (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  training_day boolean not null default false,
  done jsonb not null default '{}'::jsonb,
  notes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_id, day)
);

create table if not exists public.workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 300),
  business text not null default 'OTHER' check (business in ('EL','SNS','RAPAT','GPPT','ASALIHIN','SITE','AQUA','OTHER')),
  due_date date,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspace_tasks_owner_open_idx on public.workspace_tasks (owner_id, done_at, due_date);

create table if not exists public.workspace_training_prep (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  training_key text not null check (char_length(training_key) between 3 and 120),
  items jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_id, training_key)
);

alter table public.workspace_days enable row level security;
alter table public.workspace_tasks enable row level security;
alter table public.workspace_training_prep enable row level security;

drop policy if exists workspace_days_owner_admin on public.workspace_days;
create policy workspace_days_owner_admin on public.workspace_days
  for all to authenticated
  using (private.is_admin() and owner_id = auth.uid())
  with check (private.is_admin() and owner_id = auth.uid());

drop policy if exists workspace_tasks_owner_admin on public.workspace_tasks;
create policy workspace_tasks_owner_admin on public.workspace_tasks
  for all to authenticated
  using (private.is_admin() and owner_id = auth.uid())
  with check (private.is_admin() and owner_id = auth.uid());

drop policy if exists workspace_training_prep_owner_admin on public.workspace_training_prep;
create policy workspace_training_prep_owner_admin on public.workspace_training_prep
  for all to authenticated
  using (private.is_admin() and owner_id = auth.uid())
  with check (private.is_admin() and owner_id = auth.uid());

revoke all on public.workspace_days, public.workspace_tasks, public.workspace_training_prep from anon;
grant select, insert, update, delete on public.workspace_days, public.workspace_tasks, public.workspace_training_prep to authenticated;
