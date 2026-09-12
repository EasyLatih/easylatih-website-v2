-- Structured fee proposals submitted by trainers for each opportunity.
-- Trainer may quote either a daily rate or multiple trainee-count ranges.

alter table public.opportunity_responses
  add column if not exists fee_basis text,
  add column if not exists fee_structure jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'opportunity_responses_fee_basis_check'
  ) then
    alter table public.opportunity_responses
      add constraint opportunity_responses_fee_basis_check
      check (fee_basis is null or fee_basis in ('PER_DAY','PAX_RANGE'));
  end if;
end $$;

comment on column public.opportunity_responses.fee_basis is
  'Trainer fee proposal basis: PER_DAY or PAX_RANGE.';

comment on column public.opportunity_responses.fee_structure is
  'Structured trainer fee proposal. PER_DAY uses {daily_rate}; PAX_RANGE uses {tiers:[{min_pax,max_pax,fee}]}.';
