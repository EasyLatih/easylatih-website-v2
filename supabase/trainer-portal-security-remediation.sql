-- Security remediation applied to Supabase project uxplxejkegommcandldj on 2026-09-10.
-- Keeps the repository aligned with the live database.

revoke execute on function public.admin_edit_programme(uuid,jsonb,text) from public, anon;
alter view public.public_programme_catalogue set (security_invoker = true);

revoke all on table public.trainer_drive_folders from anon;
grant select, insert, update on table public.trainer_drive_folders to authenticated;

drop policy if exists "trainer reads own Drive folder map" on public.trainer_drive_folders;
drop policy if exists "trainer writes own Drive folder map" on public.trainer_drive_folders;
drop policy if exists "trainer updates own Drive folder map" on public.trainer_drive_folders;

create policy "trainer reads own Drive folder map"
on public.trainer_drive_folders for select to authenticated
using ((select auth.uid()) = trainer_id or private.is_admin());

create policy "trainer writes own Drive folder map"
on public.trainer_drive_folders for insert to authenticated
with check ((select auth.uid()) = trainer_id or private.is_admin());

create policy "trainer updates own Drive folder map"
on public.trainer_drive_folders for update to authenticated
using ((select auth.uid()) = trainer_id or private.is_admin())
with check ((select auth.uid()) = trainer_id or private.is_admin());
