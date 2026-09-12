-- Fix safe-update compatibility in portal statistics refresh.
-- The training_categories refresh intentionally updates every category row,
-- but must still include an explicit WHERE clause.

create or replace function private.refresh_portal_stats()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $$
begin
  update public.portal_stats
  set
    registered_trainers=(
      select count(*)
      from public.profiles p
      join auth.users u on u.id=p.id
      where coalesce(u.raw_app_meta_data->>'role','') <> 'admin'
    ),
    approved_collaborators=(
      select count(*)
      from public.profiles p
      join auth.users u on u.id=p.id
      where coalesce(u.raw_app_meta_data->>'role','') <> 'admin'
        and p.collaboration_status in ('APPROVED_TO_COLLAB','ONBOARDING','ACTIVE')
    ),
    active_trainers=(
      select count(*)
      from public.profiles p
      join auth.users u on u.id=p.id
      where coalesce(u.raw_app_meta_data->>'role','') <> 'admin'
        and p.collaboration_status='ACTIVE'
    ),
    proposals_under_review=(
      select count(*) from public.programme_proposals
      where status in ('SUBMITTED','UNDER_REVIEW','CLARIFICATION_REQUIRED','SHORTLISTED')
    ),
    published_programmes=(
      select count(*) from public.programmes where publish_status='PUBLISHED'
    ),
    updated_at=now()
  where id=1;

  update public.training_categories c
  set active_trainer_count=(
      select count(distinct p.id)
      from public.profiles p
      join auth.users u on u.id=p.id
      left join public.trainer_preferences pref on pref.trainer_id=p.id
      where coalesce(u.raw_app_meta_data->>'role','') <> 'admin'
        and p.collaboration_status='ACTIVE'
        and (
          c.name=any(coalesce(pref.categories,'{}'::text[]))
          or exists(
            select 1 from public.programmes pg
            where pg.trainer_id=p.id
              and pg.category=c.name
              and pg.publish_status in ('APPROVED','PUBLISHED')
          )
        )
    ),
    updated_at=now()
  where c.id is not null;

  return null;
end
$$;
