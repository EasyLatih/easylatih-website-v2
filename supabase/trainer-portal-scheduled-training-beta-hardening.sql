create or replace function public.scheduled_training_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.status in ('PUBLISHED','FULL','POSTPONED') then
      new.trainer_locked := true;
      if new.locked_at is null then new.locked_at := now(); end if;
    end if;
    return new;
  end if;

  if old.trainer_locked and new.assigned_trainer_id is distinct from old.assigned_trainer_id then
    raise exception 'Assigned trainer is locked after a public scheduled training is published. Cancel/postpone the session and create a replacement if the trainer must change.';
  end if;

  if old.trainer_locked and new.programme_id is distinct from old.programme_id then
    raise exception 'Programme is locked after a public scheduled training is published. Create a replacement session if the programme must change.';
  end if;

  if not old.trainer_locked and new.status in ('PUBLISHED','FULL','POSTPONED') then
    new.trainer_locked := true;
    if new.locked_at is null then new.locked_at := now(); end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.scheduled_training_before_write() from public, anon, authenticated;
revoke execute on function public.scheduled_training_write_audit() from public, anon, authenticated;

create index if not exists scheduled_trainings_created_by_idx on public.scheduled_trainings(created_by);
create index if not exists scheduled_training_audit_actor_idx on public.scheduled_training_audit(actor_id);

drop policy if exists "Public can view published scheduled trainings" on public.scheduled_trainings;
drop policy if exists "Admins manage scheduled trainings" on public.scheduled_trainings;
drop policy if exists "Admins insert scheduled trainings" on public.scheduled_trainings;
drop policy if exists "Admins update scheduled trainings" on public.scheduled_trainings;
drop policy if exists "Admins delete scheduled trainings" on public.scheduled_trainings;

create policy "Published schedule or admin select"
on public.scheduled_trainings
for select
to anon, authenticated
using (
  status in ('PUBLISHED','FULL','POSTPONED')
  or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
);

create policy "Admins insert scheduled trainings"
on public.scheduled_trainings
for insert
to authenticated
with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins update scheduled trainings"
on public.scheduled_trainings
for update
to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins delete scheduled trainings"
on public.scheduled_trainings
for delete
to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins view scheduled training audit" on public.scheduled_training_audit;
create policy "Admins view scheduled training audit"
on public.scheduled_training_audit
for select
to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
