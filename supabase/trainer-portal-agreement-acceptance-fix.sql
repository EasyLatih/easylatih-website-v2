-- Trainer agreement acceptance fix
-- Apply this after the trainer collaboration portal schema is present.

create or replace function private.prevent_trainer_admin_profile_changes()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not private.is_admin() then
    if new.approved_at is distinct from old.approved_at
      or new.public_trainer_profile_url is distinct from old.public_trainer_profile_url then
      raise exception 'This profile field is managed by EasyLatih.';
    end if;
  end if;
  return new;
end
$function$;

create or replace function public.accept_trainer_collaboration_terms(p_version text)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_trainer_id uuid := auth.uid();
  v_current_status text;
  v_accepted_at timestamptz;
begin
  if v_trainer_id is null then
    raise exception 'You must be signed in to accept the collaboration terms.' using errcode = '42501';
  end if;
  if coalesce(trim(p_version), '') = '' then
    raise exception 'A collaboration terms version is required.' using errcode = '22023';
  end if;

  select p.collaboration_status
  into v_current_status
  from public.profiles p
  where p.id = v_trainer_id
  for update;

  if not found then
    raise exception 'Trainer profile was not found.' using errcode = 'P0002';
  end if;

  if v_current_status = 'ONBOARDING' then
    select a.accepted_at
    into v_accepted_at
    from public.trainer_agreements a
    where a.trainer_id = v_trainer_id
      and a.agreement_type = 'TRAINER_COLLABORATION'
      and a.version = p_version
      and a.accepted_at is not null
    order by a.accepted_at desc
    limit 1;

    if v_accepted_at is not null then
      return jsonb_build_object('accepted_at', v_accepted_at, 'already_accepted', true);
    end if;
  end if;

  if v_current_status <> 'APPROVED_TO_COLLAB' then
    raise exception 'Collaboration terms can only be accepted after EasyLatih approves the trainer.' using errcode = '42501';
  end if;

  select a.accepted_at
  into v_accepted_at
  from public.trainer_agreements a
  where a.trainer_id = v_trainer_id
    and a.agreement_type = 'TRAINER_COLLABORATION'
    and a.version = p_version
    and a.accepted_at is not null
  order by a.accepted_at desc
  limit 1;

  if v_accepted_at is null then
    v_accepted_at := now();
    insert into public.trainer_agreements (trainer_id, agreement_type, version, accepted_at)
    values (v_trainer_id, 'TRAINER_COLLABORATION', p_version, v_accepted_at);
  end if;

  update public.profiles
  set terms_accepted_at = v_accepted_at,
      terms_version = p_version,
      collaboration_status = 'ONBOARDING'
  where id = v_trainer_id;

  if not found then
    raise exception 'Unable to update trainer onboarding status.' using errcode = 'P0001';
  end if;

  return jsonb_build_object('accepted_at', v_accepted_at, 'already_accepted', false);
end
$function$;

revoke all on function public.accept_trainer_collaboration_terms(text) from public, anon;
grant execute on function public.accept_trainer_collaboration_terms(text) to authenticated;
