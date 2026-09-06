-- Apply after trainer-portal-schema.sql.
-- Keeps admin authorization in app_metadata while allowing the portal to call
-- the private is_admin helper used by RLS policies.

grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

-- Trainers may not modify collaboration status directly, except for the
-- controlled APPROVED_TO_COLLAB -> ONBOARDING transition immediately after
-- accepting the matching Trainer Collaboration agreement version.
create or replace function private.protect_profile_admin_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  allowed_terms_transition boolean := false;
begin
  if not private.is_admin() then
    allowed_terms_transition :=
      old.collaboration_status = 'APPROVED_TO_COLLAB'
      and new.collaboration_status = 'ONBOARDING'
      and new.approved_at is not distinct from old.approved_at
      and new.terms_version is not null
      and new.terms_accepted_at is not null
      and exists (
        select 1 from public.trainer_agreements a
        where a.trainer_id = old.id
          and a.trainer_id = (select auth.uid())
          and a.agreement_type = 'TRAINER_COLLABORATION'
          and a.version = new.terms_version
          and a.accepted_at <= new.terms_accepted_at + interval '2 minutes'
      );

    if (
      new.collaboration_status is distinct from old.collaboration_status
      or new.approved_at is distinct from old.approved_at
      or new.terms_version is distinct from old.terms_version
      or new.terms_accepted_at is distinct from old.terms_accepted_at
    ) and not allowed_terms_transition then
      raise exception 'Trainer cannot modify admin-controlled collaboration fields directly';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_profile_admin_fields() from public, anon, authenticated;
