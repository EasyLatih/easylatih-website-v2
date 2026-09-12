alter table public.profiles
  add column if not exists public_trainer_profile_url text;

comment on column public.profiles.public_trainer_profile_url is
  'Admin-maintained public trainer profile PDF/Google Drive link for proposals and scheduled public training.';
