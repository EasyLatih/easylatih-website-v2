-- EasyLatih Trainer Portal: Full Course Content / Course Outline documents
-- Applied to Supabase project uxplxejkegommcandldj.

alter table public.trainer_documents
  add column if not exists programme_id uuid null references public.programmes(id) on delete cascade;

alter table public.trainer_drive_folders
  add column if not exists course_content_folder_id text null;

create index if not exists trainer_documents_programme_id_idx
  on public.trainer_documents(programme_id);

alter table public.trainer_documents
  drop constraint if exists trainer_documents_course_content_programme_check;

alter table public.trainer_documents
  add constraint trainer_documents_course_content_programme_check
  check (document_type <> 'COURSE_CONTENT' or programme_id is not null);

-- Trainer may only link COURSE_CONTENT to a programme that belongs to the same authenticated trainer.
drop policy if exists "approved trainer inserts documents" on public.trainer_documents;
create policy "approved trainer inserts documents"
on public.trainer_documents
for insert
to authenticated
with check (
  private.is_admin()
  or (
    auth.uid() = trainer_id
    and exists (
      select 1 from public.profiles p
      where p.id = trainer_documents.trainer_id
        and p.collaboration_status in ('APPROVED_TO_COLLAB','ONBOARDING','ACTIVE')
    )
    and (
      document_type <> 'COURSE_CONTENT'
      or exists (
        select 1 from public.programmes pr
        where pr.id = trainer_documents.programme_id
          and pr.trainer_id = auth.uid()
      )
    )
  )
);

-- A programme cannot move to UNDER_REVIEW unless a Google Drive course outline exists.
create or replace function private.require_course_content_before_programme_review()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.publish_status = 'UNDER_REVIEW'
     and old.publish_status is distinct from 'UNDER_REVIEW' then
    if not exists (
      select 1
      from public.trainer_documents d
      where d.programme_id = new.id
        and d.trainer_id = new.trainer_id
        and d.document_type = 'COURSE_CONTENT'
        and d.provider = 'GOOGLE_DRIVE'
    ) then
      raise exception 'Full Course Content / Course Outline must be uploaded before submission.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists require_course_content_before_programme_review on public.programmes;
create trigger require_course_content_before_programme_review
before update of publish_status on public.programmes
for each row
execute function private.require_course_content_before_programme_review();
