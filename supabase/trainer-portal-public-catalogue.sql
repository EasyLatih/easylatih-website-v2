-- Expose only approved, published programmes and consented active trainer profile fields to the public catalogue.
create policy "public reads published programmes" on public.programmes
for select to anon using (publish_status='PUBLISHED' and etris_status='APPROVED');
grant select (id,title,category,training_type,programme_overview,learning_outcomes,duration,delivery_method,modules,trainer_id,target_participants) on public.programmes to anon;

create policy "public reads active trainer profiles" on public.profiles
for select to anon using (collaboration_status='ACTIVE');
grant select (id,full_name,professional_bio) on public.profiles to anon;

create policy "public reads consented trainer photos" on public.trainer_onboarding
for select to anon using (
  photo_consent_at is not null
  and exists(select 1 from public.profiles p where p.id=trainer_id and p.collaboration_status='ACTIVE')
);
grant select (trainer_id,profile_photo_url) on public.trainer_onboarding to anon;

create or replace view public.public_programme_catalogue
with (security_invoker=true)
as
select
  pg.id as programme_id,
  pg.title as course_title,
  pg.category,
  pg.training_type,
  pg.programme_overview,
  pg.learning_outcomes,
  pg.duration,
  pg.delivery_method,
  pg.modules,
  pg.target_participants,
  p.full_name as trainer_name,
  p.professional_bio as trainer_bio,
  o.profile_photo_url as trainer_photo_url
from public.programmes pg
join public.profiles p on p.id=pg.trainer_id
left join public.trainer_onboarding o on o.trainer_id=p.id
where pg.publish_status='PUBLISHED'
  and pg.etris_status='APPROVED'
  and p.collaboration_status='ACTIVE'
  and o.photo_consent_at is not null;

grant select on public.public_programme_catalogue to anon,authenticated;
