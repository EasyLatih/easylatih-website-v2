-- EasyLatih Trainer Collaboration Portal
-- Admin programme overwrite with trainer-visible change audit.

create table if not exists public.programme_admin_edits (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  from_version integer not null,
  to_version integer not null,
  changes jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  constraint programme_admin_edits_changes_object check (jsonb_typeof(changes) = 'object')
);

create index if not exists programme_admin_edits_trainer_created_idx
  on public.programme_admin_edits(trainer_id, created_at desc);
create index if not exists programme_admin_edits_programme_created_idx
  on public.programme_admin_edits(programme_id, created_at desc);

alter table public.programme_admin_edits enable row level security;
revoke all on public.programme_admin_edits from anon;
grant select on public.programme_admin_edits to authenticated;

drop policy if exists "trainer reads own admin programme edits" on public.programme_admin_edits;
create policy "trainer reads own admin programme edits"
  on public.programme_admin_edits
  for select to authenticated
  using ((select auth.uid()) = trainer_id or private.is_admin());

create or replace function public.admin_edit_programme(
  p_programme_id uuid,
  p_changes jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_programme public.programmes%rowtype;
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_key text;
  v_old_version integer;
  v_changed_fields text;
  v_allowed text[] := array[
    'title','category','training_type','programme_overview',
    'learning_objectives','learning_outcomes','target_participants',
    'prerequisites','duration','delivery_method','training_methodology',
    'modules','assessment_method','maximum_participants','venue_requirements'
  ];
  v_labels jsonb := jsonb_build_object(
    'title','Programme Title','category','Category','training_type','Training Type',
    'programme_overview','Programme Overview','learning_objectives','Learning Objectives',
    'learning_outcomes','Learning Outcomes','target_participants','Target Participants',
    'prerequisites','Prerequisites','duration','Duration','delivery_method','Delivery Method',
    'training_methodology','Training Methodology','modules','Modules / Topics',
    'assessment_method','Assessment Method','maximum_participants','Maximum Participants',
    'venue_requirements','Venue / Equipment Requirements'
  );
begin
  if not private.is_admin() then raise exception 'Admin access required.'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then raise exception 'Programme changes must be a JSON object.'; end if;
  if exists (select 1 from jsonb_object_keys(p_changes) as k(key) where not (k.key = any(v_allowed))) then
    raise exception 'One or more programme fields cannot be edited through this action.';
  end if;

  select * into v_programme from public.programmes where id = p_programme_id for update;
  if not found then raise exception 'Programme not found.'; end if;

  v_old_version := v_programme.current_version;
  v_old := jsonb_build_object(
    'title',v_programme.title,'category',v_programme.category,'training_type',v_programme.training_type,
    'programme_overview',v_programme.programme_overview,'learning_objectives',to_jsonb(v_programme.learning_objectives),
    'learning_outcomes',to_jsonb(v_programme.learning_outcomes),'target_participants',v_programme.target_participants,
    'prerequisites',v_programme.prerequisites,'duration',v_programme.duration,'delivery_method',v_programme.delivery_method,
    'training_methodology',v_programme.training_methodology,'modules',v_programme.modules,
    'assessment_method',v_programme.assessment_method,'maximum_participants',v_programme.maximum_participants,
    'venue_requirements',v_programme.venue_requirements
  );
  v_new := v_old;

  foreach v_key in array v_allowed loop
    if p_changes ? v_key then
      v_new := jsonb_set(v_new,array[v_key],coalesce(p_changes -> v_key,'null'::jsonb),true);
    end if;
    if (v_old -> v_key) is distinct from (v_new -> v_key) then
      v_diff := v_diff || jsonb_build_object(v_key,jsonb_build_object('before',v_old -> v_key,'after',v_new -> v_key));
    end if;
  end loop;

  if nullif(trim(coalesce(v_new ->> 'title','')),'') is null then raise exception 'Programme title is required.'; end if;
  if nullif(trim(coalesce(v_new ->> 'category','')),'') is null then raise exception 'Category is required.'; end if;
  if nullif(trim(coalesce(v_new ->> 'training_type','')),'') is null then raise exception 'Training type is required.'; end if;
  if jsonb_typeof(v_new -> 'learning_objectives') <> 'array'
     or jsonb_typeof(v_new -> 'learning_outcomes') <> 'array'
     or jsonb_typeof(v_new -> 'modules') <> 'array' then
    raise exception 'Objectives, outcomes and modules must be arrays.';
  end if;

  if v_diff = '{}'::jsonb then
    return jsonb_build_object('ok',true,'changed',false,'version',v_old_version,'changes',v_diff);
  end if;

  insert into public.programme_versions(programme_id,version_number,snapshot,created_by)
  values (v_programme.id,v_old_version,to_jsonb(v_programme),(select auth.uid()))
  on conflict (programme_id,version_number) do nothing;

  update public.programmes set
    title=v_new ->> 'title', category=v_new ->> 'category', training_type=v_new ->> 'training_type',
    programme_overview=v_new ->> 'programme_overview',
    learning_objectives=array(select jsonb_array_elements_text(v_new -> 'learning_objectives')),
    learning_outcomes=array(select jsonb_array_elements_text(v_new -> 'learning_outcomes')),
    target_participants=v_new ->> 'target_participants', prerequisites=v_new ->> 'prerequisites',
    duration=v_new ->> 'duration', delivery_method=v_new ->> 'delivery_method',
    training_methodology=v_new ->> 'training_methodology', modules=v_new -> 'modules',
    assessment_method=v_new ->> 'assessment_method',
    maximum_participants=nullif(v_new ->> 'maximum_participants','')::integer,
    venue_requirements=v_new ->> 'venue_requirements',
    current_version=v_old_version+1, updated_at=now()
  where id=v_programme.id;

  insert into public.programme_admin_edits(programme_id,trainer_id,changed_by,from_version,to_version,changes,note)
  values (v_programme.id,v_programme.trainer_id,(select auth.uid()),v_old_version,v_old_version+1,v_diff,nullif(trim(coalesce(p_note,'')),''));

  select string_agg(coalesce(v_labels ->> x.key,x.key),', ' order by coalesce(v_labels ->> x.key,x.key))
  into v_changed_fields from jsonb_object_keys(v_diff) as x(key);

  if v_programme.proposal_id is not null then
    insert into public.proposal_comments(proposal_id,author_id,author_role,visibility,body)
    values (
      v_programme.proposal_id,(select auth.uid()),'ADMIN','TRAINER',
      'EasyLatih updated your programme data (' || coalesce(v_changed_fields,'programme details') || '). ' ||
      'The latest EasyLatih version is now Version ' || (v_old_version+1)::text || '. ' ||
      'Open My Programmes to review the before/after changes.' ||
      case when nullif(trim(coalesce(p_note,'')),'') is not null then ' Admin note: ' || trim(p_note) else '' end
    );
  end if;

  return jsonb_build_object('ok',true,'changed',true,'from_version',v_old_version,'to_version',v_old_version+1,'changes',v_diff);
end;
$$;

revoke all on function public.admin_edit_programme(uuid,jsonb,text) from public;
grant execute on function public.admin_edit_programme(uuid,jsonb,text) to authenticated;
