create table if not exists public.trainer_category_change_requests (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  requested_categories text[] not null,
  reason text not null,
  status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint trainer_category_change_requests_max_three check(cardinality(requested_categories) between 1 and 3)
);
alter table public.trainer_category_change_requests enable row level security;
grant select,insert,update on public.trainer_category_change_requests to authenticated;

create policy "trainer reads own category requests" on public.trainer_category_change_requests for select to authenticated using ((select auth.uid())=trainer_id or private.is_admin());
create policy "trainer creates own category request" on public.trainer_category_change_requests for insert to authenticated with check ((select auth.uid())=trainer_id and status='PENDING');
create policy "admin reviews category requests" on public.trainer_category_change_requests for update to authenticated using (private.is_admin()) with check (private.is_admin());

create or replace function private.apply_approved_category_request()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='APPROVED' and old.status='PENDING' then
    update public.trainer_preferences set categories=new.requested_categories where trainer_id=new.trainer_id;
  end if;
  return new;
end $$;
revoke all on function private.apply_approved_category_request() from public,anon,authenticated;
drop trigger if exists apply_approved_category_request on public.trainer_category_change_requests;
create trigger apply_approved_category_request after update of status on public.trainer_category_change_requests for each row execute function private.apply_approved_category_request();
