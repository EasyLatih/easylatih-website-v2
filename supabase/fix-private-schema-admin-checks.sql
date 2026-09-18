-- Allow trusted service-role admin workflows to pass the same private admin checks
-- used by browser admin sessions, without exposing other private functions.

create or replace function private.is_admin()
returns boolean
language sql
stable
set search_path = public, auth, pg_temp
as $$
  select
    coalesce((auth.jwt()->'app_metadata'->>'role')='admin', false)
    or coalesce(auth.role(), '') = 'service_role'
$$;

grant usage on schema private to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;
