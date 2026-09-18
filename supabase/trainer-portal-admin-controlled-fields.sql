-- Enforce admin-owned fields even when a trainer calls the Data API directly.

create or replace function private.prevent_trainer_admin_profile_changes()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not private.is_admin() then
    if new.collaboration_status is distinct from old.collaboration_status
      or new.approved_at is distinct from old.approved_at
      or new.public_trainer_profile_url is distinct from old.public_trainer_profile_url then
      raise exception 'This profile field is managed by EasyLatih.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.prevent_trainer_admin_profile_changes() from public,anon,authenticated;
drop trigger if exists prevent_trainer_admin_profile_changes on public.profiles;
create trigger prevent_trainer_admin_profile_changes
before update on public.profiles
for each row execute function private.prevent_trainer_admin_profile_changes();

create or replace function private.prevent_trainer_proposal_limit_changes()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not private.is_admin() then
    if tg_op='INSERT' and new.proposal_limit_override is not null then
      raise exception 'Proposal limit is managed by EasyLatih.';
    end if;
    if tg_op='UPDATE' and new.proposal_limit_override is distinct from old.proposal_limit_override then
      raise exception 'Proposal limit is managed by EasyLatih.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.prevent_trainer_proposal_limit_changes() from public,anon,authenticated;
drop trigger if exists prevent_trainer_proposal_limit_changes on public.trainer_preferences;
create trigger prevent_trainer_proposal_limit_changes
before insert or update on public.trainer_preferences
for each row execute function private.prevent_trainer_proposal_limit_changes();
