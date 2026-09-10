-- Make open opportunities appear when an active trainer updates their matching profile.
-- This complements the insert/open trigger for newly created opportunities.

create or replace function private.seed_open_opportunities_for_trainer(target_trainer_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.opportunity_recipients(opportunity_id,trainer_id)
  select o.id,p.id
  from public.profiles p
  join public.trainer_preferences pref on pref.trainer_id=p.id
  join public.opportunities o on o.status='OPEN' and o.response_deadline>=now()
  where p.id=target_trainer_id
    and p.collaboration_status='ACTIVE'
    and p.availability_status<>'UNAVAILABLE'
    and ((o.training_type='PUBLIC' and pref.accepts_public) or (o.training_type='INHOUSE' and pref.accepts_inhouse))
    and (
      o.category=any(pref.categories)
      or exists(select 1 from public.programme_proposals pp where pp.trainer_id=p.id and pp.category=o.category and pp.status in ('APPROVED_TO_COLLAB','ONBOARDING','FULL_DETAILS_SUBMITTED','APPROVED_FOR_ETRIS','PUBLISHED'))
      or exists(select 1 from public.programmes pg where pg.trainer_id=p.id and pg.category=o.category and pg.publish_status in ('APPROVED','PUBLISHED'))
    )
    and (
      cardinality(o.expertise_tags)=0
      or exists(select 1 from unnest(o.expertise_tags) requested(tag) join unnest(pref.expertise_tags) offered(tag) on lower(trim(requested.tag))=lower(trim(offered.tag)))
    )
    and (
      coalesce(trim(o.location),'')=''
      or lower(o.location) like '%'||lower(p.state)||'%'
      or exists(select 1 from unnest(pref.travel_states) s where lower(o.location) like '%'||lower(s)||'%')
      or cardinality(pref.travel_states)=0
    )
  on conflict (opportunity_id,trainer_id) do nothing;
end $$;
revoke all on function private.seed_open_opportunities_for_trainer(uuid) from public,anon,authenticated;

create or replace function private.rematch_open_opportunities_from_preferences()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform private.seed_open_opportunities_for_trainer(new.trainer_id);
  return new;
end $$;
revoke all on function private.rematch_open_opportunities_from_preferences() from public,anon,authenticated;
drop trigger if exists rematch_open_opportunities_from_preferences on public.trainer_preferences;
create trigger rematch_open_opportunities_from_preferences
after insert or update of accepts_public,accepts_inhouse,travel_states,expertise_tags,categories on public.trainer_preferences
for each row execute function private.rematch_open_opportunities_from_preferences();

create or replace function private.rematch_open_opportunities_from_profile()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform private.seed_open_opportunities_for_trainer(new.id);
  return new;
end $$;
revoke all on function private.rematch_open_opportunities_from_profile() from public,anon,authenticated;
drop trigger if exists rematch_open_opportunities_from_profile on public.profiles;
create trigger rematch_open_opportunities_from_profile
after update of collaboration_status,availability_status,state on public.profiles
for each row execute function private.rematch_open_opportunities_from_profile();
