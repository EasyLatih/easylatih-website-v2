-- EasyLatih Trainer Collaboration Portal
-- Per-trainer tab read state for unread notification badges.

create table if not exists public.trainer_tab_reads (
  trainer_id uuid not null references auth.users(id) on delete cascade,
  tab_name text not null,
  last_seen_at timestamptz not null default now(),
  primary key (trainer_id, tab_name),
  constraint trainer_tab_reads_tab_name_check check (
    tab_name = any (array[
      'proposals'::text,
      'opportunities'::text,
      'programmes'::text,
      'comments'::text,
      'profile'::text,
      'onboarding'::text
    ])
  )
);

alter table public.trainer_tab_reads enable row level security;
revoke all on public.trainer_tab_reads from anon;
grant select, insert, update on public.trainer_tab_reads to authenticated;

drop policy if exists "trainer reads own tab state" on public.trainer_tab_reads;
create policy "trainer reads own tab state"
  on public.trainer_tab_reads
  for select to authenticated
  using ((select auth.uid()) = trainer_id or private.is_admin());

drop policy if exists "trainer inserts own tab state" on public.trainer_tab_reads;
create policy "trainer inserts own tab state"
  on public.trainer_tab_reads
  for insert to authenticated
  with check ((select auth.uid()) = trainer_id or private.is_admin());

drop policy if exists "trainer updates own tab state" on public.trainer_tab_reads;
create policy "trainer updates own tab state"
  on public.trainer_tab_reads
  for update to authenticated
  using ((select auth.uid()) = trainer_id or private.is_admin())
  with check ((select auth.uid()) = trainer_id or private.is_admin());
