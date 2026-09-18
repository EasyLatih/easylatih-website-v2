-- Keep award state consistent even if the admin browser disconnects between writes.
create unique index if not exists uq_one_awarded_response_per_opportunity
on public.opportunity_responses(opportunity_id)
where is_awarded=true;

create or replace function private.sync_awarded_response_to_opportunity()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.is_awarded=true and (tg_op='INSERT' or old.is_awarded is distinct from new.is_awarded) then
    update public.opportunities
      set status='AWARDED',awarded_trainer_id=new.trainer_id,updated_at=now()
      where id=new.opportunity_id and status='OPEN';
    if not found then
      raise exception 'Opportunity is no longer open for award';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.sync_awarded_response_to_opportunity() from public,anon,authenticated;
drop trigger if exists sync_awarded_response_to_opportunity on public.opportunity_responses;
create trigger sync_awarded_response_to_opportunity
after insert or update of is_awarded on public.opportunity_responses
for each row execute function private.sync_awarded_response_to_opportunity();
