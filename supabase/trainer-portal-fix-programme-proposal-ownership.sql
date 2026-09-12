-- Ensure a trainer can only create a full programme from an approved proposal that belongs to the same trainer.

drop policy if exists "programme insert access" on public.programmes;

create policy "programme insert access"
on public.programmes
for insert
to authenticated
with check (
  private.is_admin()
  or (
    auth.uid() = trainer_id
    and publish_status = 'DRAFT'
    and etris_status = 'NOT_SUBMITTED'
    and etris_reference is null
    and published_at is null
    and current_version = 1
    and exists (
      select 1
      from public.profiles p
      where p.id = programmes.trainer_id
        and p.collaboration_status in ('ONBOARDING','ACTIVE')
    )
    and exists (
      select 1
      from public.programme_proposals pp
      where pp.id = programmes.proposal_id
        and pp.trainer_id = programmes.trainer_id
        and pp.status in ('APPROVED_TO_COLLAB','ONBOARDING','FULL_DETAILS_SUBMITTED','APPROVED_FOR_ETRIS','PUBLISHED')
    )
  )
);
