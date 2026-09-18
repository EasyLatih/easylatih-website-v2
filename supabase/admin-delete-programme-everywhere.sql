-- Admin hard delete for module + originating trainer proposal.
-- Blocks deletion while scheduled training records reference the programme.

create or replace function public.admin_delete_programme_everywhere(p_programme_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_programme public.programmes%rowtype;
  v_scheduled_count integer := 0;
  v_deleted_proposal boolean := false;
begin
  if not private.is_admin() then
    raise exception 'Admin access required.';
  end if;

  select *
  into v_programme
  from public.programmes
  where id = p_programme_id;

  if not found then
    raise exception 'Module not found or already deleted.';
  end if;

  select count(*)
  into v_scheduled_count
  from public.scheduled_trainings
  where programme_id = p_programme_id;

  if v_scheduled_count > 0 then
    raise exception 'This module is linked to % scheduled training record(s). Remove or reassign the scheduled training first before deleting the module.', v_scheduled_count;
  end if;

  delete from public.programmes
  where id = p_programme_id;

  if v_programme.proposal_id is not null then
    delete from public.programme_proposals
    where id = v_programme.proposal_id;
    v_deleted_proposal := found;
  end if;

  return jsonb_build_object(
    'ok', true,
    'programme_id', p_programme_id,
    'proposal_id', v_programme.proposal_id,
    'title', v_programme.title,
    'trainer_id', v_programme.trainer_id,
    'deleted_from_trainer_side', v_deleted_proposal
  );
end;
$$;

revoke all on function public.admin_delete_programme_everywhere(uuid) from public, anon;
grant execute on function public.admin_delete_programme_everywhere(uuid) to authenticated, service_role;
