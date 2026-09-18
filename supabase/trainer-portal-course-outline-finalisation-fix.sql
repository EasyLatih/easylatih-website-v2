create or replace function public.finalize_generated_course_outline(
  p_programme_id uuid,
  p_trainer_id uuid,
  p_file_id text,
  p_file_url text default null,
  p_generated_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_programme public.programmes%rowtype;
begin
  if p_programme_id is null or p_trainer_id is null or coalesce(trim(p_file_id),'') = '' then
    raise exception 'Invalid Course Outline finalisation payload.';
  end if;

  update public.programmes
  set course_outline_doc_id = p_file_id,
      course_outline_doc_url = nullif(trim(coalesce(p_file_url,'')), ''),
      course_outline_generated_at = coalesce(p_generated_at, now()),
      publish_status = 'UNDER_REVIEW',
      updated_at = now()
  where id = p_programme_id
    and trainer_id = p_trainer_id
    and publish_status = 'DRAFT'
  returning * into v_programme;

  if not found then
    raise exception 'Programme is no longer in Draft status or does not belong to this trainer.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'programme_id', v_programme.id,
    'proposal_id', v_programme.proposal_id,
    'publish_status', v_programme.publish_status,
    'course_outline_doc_id', v_programme.course_outline_doc_id,
    'course_outline_doc_url', v_programme.course_outline_doc_url,
    'course_outline_generated_at', v_programme.course_outline_generated_at
  );
end;
$$;

revoke all on function public.finalize_generated_course_outline(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_generated_course_outline(uuid,uuid,text,text,timestamptz) to service_role;
