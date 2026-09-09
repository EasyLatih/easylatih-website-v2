create table if not exists public.scheduled_trainings (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete restrict,
  assigned_trainer_id uuid not null references public.profiles(id) on delete restrict,
  programme_title text not null,
  category text,
  duration text,
  start_date date not null,
  end_date date,
  start_time time,
  end_time time,
  venue text,
  city text,
  state text,
  delivery_mode text not null default 'PHYSICAL' check (delivery_mode in ('PHYSICAL','ONLINE','HYBRID')),
  participant_fee numeric check (participant_fee is null or participant_fee >= 0),
  capacity integer check (capacity is null or capacity > 0),
  registration_deadline timestamptz,
  trainer_profile_url text,
  final_course_content_url text,
  registration_url text,
  hrd_claimable boolean not null default true,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','FULL','POSTPONED','CANCELLED','COMPLETED')),
  trainer_locked boolean not null default false,
  locked_at timestamptz,
  internal_notes text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_trainings_start_date_idx on public.scheduled_trainings(start_date);
create index if not exists scheduled_trainings_status_idx on public.scheduled_trainings(status);
create index if not exists scheduled_trainings_programme_idx on public.scheduled_trainings(programme_id);
create index if not exists scheduled_trainings_trainer_idx on public.scheduled_trainings(assigned_trainer_id);

create table if not exists public.scheduled_training_audit (
  id uuid primary key default gen_random_uuid(),
  scheduled_training_id uuid not null references public.scheduled_trainings(id) on delete cascade,
  action text not null,
  actor_id uuid default auth.uid() references auth.users(id),
  old_record jsonb,
  new_record jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_training_audit_session_idx on public.scheduled_training_audit(scheduled_training_id, created_at desc);

alter table public.scheduled_trainings enable row level security;
alter table public.scheduled_training_audit enable row level security;

drop policy if exists "Public can view published scheduled trainings" on public.scheduled_trainings;
create policy "Public can view published scheduled trainings"
on public.scheduled_trainings
for select
to anon, authenticated
using (status in ('PUBLISHED','FULL','POSTPONED'));

drop policy if exists "Admins manage scheduled trainings" on public.scheduled_trainings;
create policy "Admins manage scheduled trainings"
on public.scheduled_trainings
for all
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins view scheduled training audit" on public.scheduled_training_audit;
create policy "Admins view scheduled training audit"
on public.scheduled_training_audit
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

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

drop trigger if exists scheduled_training_before_write_trigger on public.scheduled_trainings;
create trigger scheduled_training_before_write_trigger
before insert or update on public.scheduled_trainings
for each row execute function public.scheduled_training_before_write();

create or replace function public.scheduled_training_write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.scheduled_training_audit(
    scheduled_training_id,
    action,
    actor_id,
    old_record,
    new_record
  ) values (
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists scheduled_training_audit_trigger on public.scheduled_trainings;
create trigger scheduled_training_audit_trigger
after insert or update or delete on public.scheduled_trainings
for each row execute function public.scheduled_training_write_audit();

revoke execute on function public.scheduled_training_before_write() from public, anon, authenticated;
revoke execute on function public.scheduled_training_write_audit() from public, anon, authenticated;

grant select on public.scheduled_trainings to anon, authenticated;
grant insert, update, delete on public.scheduled_trainings to authenticated;
grant select on public.scheduled_training_audit to authenticated;

comment on table public.scheduled_trainings is 'Public scheduled training sessions. Assigned trainer and programme are locked once a session is published.';
comment on column public.scheduled_trainings.trainer_profile_url is 'Public-facing trainer profile PDF/Google Drive link for this scheduled session.';
comment on column public.scheduled_trainings.final_course_content_url is 'Final public course content link for this scheduled session.';
comment on column public.scheduled_trainings.registration_url is 'Public registration link for this scheduled session.';
