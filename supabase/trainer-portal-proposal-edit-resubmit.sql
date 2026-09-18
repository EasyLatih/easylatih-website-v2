-- Trainer proposal edit and resubmit flow.
-- Trainers may edit only their own SUBMITTED or CLARIFICATION_REQUIRED proposal.
-- The previous proposal content is captured as an immutable admin-only revision.

begin;

create table if not exists public.programme_proposal_revisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.programme_proposals(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  revision_no integer not null check (revision_no > 0),
  previous_status text not null,
  title text not null,
  category text not null,
  training_type text not null,
  target_audience text not null,
  problem_statement text not null,
  summary text not null,
  key_learning_points text[] not null default '{}'::text[],
  duration text not null,
  delivery_method text not null,
  preferred_location text,
  expected_fee numeric,
  changed_at timestamptz not null default now(),
  unique (proposal_id, revision_no)
);

comment on table public.programme_proposal_revisions is
  'Immutable snapshots of trainer proposal content before an allowed trainer resubmission.';

create index if not exists programme_proposal_revisions_proposal_changed_idx
  on public.programme_proposal_revisions (proposal_id, changed_at desc);

create index if not exists programme_proposal_revisions_trainer_id_idx
  on public.programme_proposal_revisions (trainer_id);

alter table public.programme_proposal_revisions enable row level security;

revoke all on table public.programme_proposal_revisions from anon, authenticated;
grant select on table public.programme_proposal_revisions to authenticated;

drop policy if exists "admin reads proposal revisions" on public.programme_proposal_revisions;
create policy "admin reads proposal revisions"
on public.programme_proposal_revisions
for select
to authenticated
using ((select private.is_admin()));

create or replace function private.capture_trainer_proposal_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_trainer_edit boolean;
  v_revision_no integer;
begin
  v_is_trainer_edit :=
    coalesce((select auth.uid()) = old.trainer_id, false)
    and not coalesce((select private.is_admin()), false);

  if not v_is_trainer_edit then
    return new;
  end if;

  if old.status not in ('SUBMITTED', 'CLARIFICATION_REQUIRED') then
    raise exception 'This proposal is locked and can no longer be edited.'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.trainer_id is distinct from old.trainer_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Proposal ownership and original submission details cannot be changed.'
      using errcode = '42501';
  end if;

  select coalesce(max(r.revision_no), 0) + 1
  into v_revision_no
  from public.programme_proposal_revisions r
  where r.proposal_id = old.id;

  insert into public.programme_proposal_revisions (
    proposal_id,
    trainer_id,
    revision_no,
    previous_status,
    title,
    category,
    training_type,
    target_audience,
    problem_statement,
    summary,
    key_learning_points,
    duration,
    delivery_method,
    preferred_location,
    expected_fee
  )
  values (
    old.id,
    old.trainer_id,
    v_revision_no,
    old.status,
    old.title,
    old.category,
    old.training_type,
    old.target_audience,
    old.problem_statement,
    old.summary,
    old.key_learning_points,
    old.duration,
    old.delivery_method,
    old.preferred_location,
    old.expected_fee
  );

  new.status := 'SUBMITTED';
  new.submitted_at := now();
  new.reviewed_at := null;
  new.updated_at := now();

  return new;
end;
$$;

revoke all on function private.capture_trainer_proposal_revision() from public;

drop trigger if exists capture_trainer_proposal_revision on public.programme_proposals;
create trigger capture_trainer_proposal_revision
before update on public.programme_proposals
for each row
execute function private.capture_trainer_proposal_revision();

drop policy if exists "admin updates proposals" on public.programme_proposals;
drop policy if exists "trainer edits own editable proposals" on public.programme_proposals;

create policy "admin or trainer updates proposals"
on public.programme_proposals
for update
to authenticated
using (
  (select private.is_admin())
  or (
    (select auth.uid()) = trainer_id
    and status in ('SUBMITTED', 'CLARIFICATION_REQUIRED')
  )
)
with check (
  (select private.is_admin())
  or (
    (select auth.uid()) = trainer_id
    and status = 'SUBMITTED'
  )
);

commit;
