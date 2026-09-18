alter table public.programmes
  add column if not exists schedule jsonb not null default '[]'::jsonb,
  add column if not exists course_outline_doc_id text,
  add column if not exists course_outline_doc_url text,
  add column if not exists course_outline_generated_at timestamptz;

comment on column public.programmes.schedule is 'Structured trainer training schedule. Breaks/lunch are excluded from contact hours.';
comment on column public.programmes.course_outline_doc_id is 'Latest generated native Google Docs course outline file ID.';
comment on column public.programmes.course_outline_doc_url is 'Latest generated native Google Docs course outline URL.';
comment on column public.programmes.course_outline_generated_at is 'Timestamp of latest generated Google Docs course outline.';
