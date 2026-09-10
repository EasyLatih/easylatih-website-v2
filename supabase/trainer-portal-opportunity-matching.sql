-- Improve opportunity matching and preserve trainer display name on each response snapshot.
alter table public.opportunity_responses add column if not exists trainer_name text;

create or replace function private.fill_opportunity_response_trainer_name()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  select full_name into new.trainer_name from public.profiles where id=new.trainer_id;
  return new;
end $$;
revoke all on function private.fill_opportunity_response_trainer_name() from public,anon,authenticated;
drop trigger if exists fill_opportunity_response_trainer_name on public.opportunity_responses;
create trigger fill_opportunity_response_trainer_name
before insert or update of trainer_id on public.opportunity_responses
for each row execute function private.fill_opportunity_response_trainer_name();

create or replace function private.seed_opportunity_recipients()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status<>'OPEN' or (tg_op='UPDATE' and old.status='OPEN') then return new; end if;
  insert into public.opportunity_recipients(opportunity_id,trainer_id)
  select new.id,p.id
  from public.profiles p
  join public.trainer_preferences pref on pref.trainer_id=p.id
  where p.collaboration_status='ACTIVE'
    and p.availability_status<>'UNAVAILABLE'
    and ((new.training_type='PUBLIC' and pref.accepts_public) or (new.training_type='INHOUSE' and pref.accepts_inhouse))
    and (
      new.category=any(pref.categories)
      or exists(select 1 from public.programme_proposals pp where pp.trainer_id=p.id and pp.category=new.category and pp.status in ('APPROVED_TO_COLLAB','ONBOARDING','FULL_DETAILS_SUBMITTED','APPROVED_FOR_ETRIS','PUBLISHED'))
      or exists(select 1 from public.programmes pg where pg.trainer_id=p.id and pg.category=new.category and pg.publish_status in ('APPROVED','PUBLISHED'))
    )
    and (
      cardinality(new.expertise_tags)=0
      or cardinality(pref.expertise_tags)=0
      or exists(
        select 1
        from unnest(new.expertise_tags) requested(tag)
        join unnest(pref.expertise_tags) offered(tag) on lower(trim(requested.tag))=lower(trim(offered.tag))
      )
    )
    and (
      coalesce(trim(new.location),'')=''
      or lower(new.location) like '%'||lower(p.state)||'%'
      or exists(select 1 from unnest(pref.travel_states) s where lower(new.location) like '%'||lower(s)||'%')
      or cardinality(pref.travel_states)=0
    )
  on conflict do nothing;
  return new;
end $$;
revoke all on function private.seed_opportunity_recipients() from public,anon,authenticated;
drop trigger if exists seed_opportunity_recipients on public.opportunities;
create trigger seed_opportunity_recipients after insert or update of status on public.opportunities for each row execute function private.seed_opportunity_recipients();
