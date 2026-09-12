-- Trainer activation accepts either HRD Corp TTT or official HRD Corp TTT exemption.
-- Trainers who answer No remain eligible for the EasyLatih waiting/consultancy pools,
-- but cannot be activated for automatic training opportunity matching.
-- TTT_CERTIFICATE is retained as the legacy document_type storage key for either
-- a TTT certificate or official TTT exemption evidence.

create or replace function private.enforce_trainer_activation_requirements()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  missing_requirements text[] := array[]::text[];
begin
  if new.collaboration_status = 'ACTIVE'
     and old.collaboration_status is distinct from 'ACTIVE' then

    if not private.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Only EasyLatih admin can activate a trainer.' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.trainer_agreements a
      where a.trainer_id = new.id
        and a.agreement_type = 'TRAINER_COLLABORATION'
        and a.accepted_at is not null
    ) then
      missing_requirements := array_append(missing_requirements, 'Trainer Collaboration Terms acceptance');
    end if;

    if not exists (
      select 1
      from public.trainer_onboarding o
      where o.trainer_id = new.id
        and o.onboarding_completed_at is not null
    ) then
      missing_requirements := array_append(missing_requirements, 'completed onboarding');
    end if;

    if not exists (
      select 1
      from public.trainer_onboarding o
      where o.trainer_id = new.id
        and o.ttt_status ~* '^(HRD Corp TTT Eligibility:\s*Yes|HRD Corp TTT:\s*Yes)'
    ) then
      missing_requirements := array_append(missing_requirements, 'HRD Corp TTT or official TTT Exemption status');
    end if;

    if not exists (
      select 1
      from public.trainer_documents d
      where d.trainer_id = new.id
        and d.programme_id is null
        and d.document_type = 'TTT_CERTIFICATE'
        and d.verification_status = 'VERIFIED'
    ) then
      missing_requirements := array_append(missing_requirements, 'verified TTT Certificate / TTT Exemption evidence');
    end if;

    if not exists (
      select 1
      from public.trainer_documents d
      where d.trainer_id = new.id
        and d.programme_id is null
        and d.document_type = 'RESUME_CV'
        and d.verification_status = 'VERIFIED'
    ) then
      missing_requirements := array_append(missing_requirements, 'verified Resume / CV');
    end if;

    if array_length(missing_requirements, 1) is not null then
      raise exception 'Trainer cannot be activated. Missing: %', array_to_string(missing_requirements, ', ')
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_trainer_activation_requirements on public.profiles;
create trigger enforce_trainer_activation_requirements
before update of collaboration_status on public.profiles
for each row
execute function private.enforce_trainer_activation_requirements();
