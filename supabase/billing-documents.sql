-- Shared billing document foundation for consultancy and future EasyLatih services.
-- Invoice numbers are allocated by the document bridge only at finalisation.

create table if not exists public.billing_documents (
  id uuid primary key default gen_random_uuid(),
  service_category text not null check (service_category in ('CONSULTANCY', 'OTHER_SERVICE')),
  document_type text not null check (document_type in ('QUOTATION', 'INVOICE', 'RECEIPT')),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'FINAL', 'VOID')),
  parent_document_id uuid references public.billing_documents(id) on delete restrict,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  document_number text unique,
  google_doc_id text,
  google_doc_url text,
  pdf_file_id text,
  pdf_url text,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  payment_verified_at timestamptz,
  payment_reference text,
  payment_amount numeric(12,2) check (payment_amount is null or payment_amount >= 0),
  sent_at timestamptz,
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (document_type = 'QUOTATION' and parent_document_id is null)
    or (document_type in ('INVOICE', 'RECEIPT') and parent_document_id is not null)
  ),
  check (status = 'DRAFT' or (document_number is not null and finalized_at is not null)),
  check (status <> 'VOID' or (document_type = 'INVOICE' and voided_at is not null and voided_by is not null and char_length(trim(coalesce(void_reason, ''))) between 3 and 500)),
  check (accepted_at is null or document_type = 'QUOTATION'),
  check (payment_verified_at is null or document_type = 'INVOICE')
);

create index if not exists billing_documents_category_created_idx
  on public.billing_documents (service_category, created_at desc);

create unique index if not exists billing_documents_active_child_uniq
  on public.billing_documents (parent_document_id, document_type)
  where status <> 'VOID';

create or replace function public.billing_document_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_parent public.billing_documents%rowtype;
begin
  if new.document_type = 'QUOTATION' then
    if new.parent_document_id is not null then
      raise exception 'Quotation cannot have a parent document';
    end if;
  else
    select * into v_parent from public.billing_documents where id = new.parent_document_id;
    if not found then
      raise exception 'Parent document not found';
    end if;
    if new.service_category <> v_parent.service_category then
      raise exception 'Child document must use the same service category';
    end if;
    if new.document_type = 'INVOICE' and (v_parent.document_type <> 'QUOTATION' or v_parent.status <> 'FINAL' or v_parent.accepted_at is null) then
      raise exception 'Invoice requires an accepted, finalized quotation';
    end if;
    if new.document_type = 'RECEIPT' and (v_parent.document_type <> 'INVOICE' or v_parent.status <> 'FINAL' or v_parent.payment_verified_at is null) then
      raise exception 'Receipt requires a paid, finalized invoice';
    end if;
  end if;

  if new.accepted_at is not null and (new.document_type <> 'QUOTATION' or new.status <> 'FINAL') then
    raise exception 'Only a finalized quotation may be accepted';
  end if;
  if new.payment_verified_at is not null and (new.document_type <> 'INVOICE' or new.status <> 'FINAL') then
    raise exception 'Only a finalized invoice may have payment verified';
  end if;
  return new;
end;
$$;

drop trigger if exists billing_document_guard_tr on public.billing_documents;
create trigger billing_document_guard_tr
before insert or update of service_category, document_type, status, parent_document_id, accepted_at, payment_verified_at
on public.billing_documents
for each row execute function public.billing_document_guard();

alter table public.billing_documents enable row level security;

drop policy if exists billing_documents_admin_select on public.billing_documents;
create policy billing_documents_admin_select on public.billing_documents
  for select to authenticated
  using ((select private.is_admin()));

drop policy if exists billing_documents_admin_insert_drafts on public.billing_documents;
create policy billing_documents_admin_insert_drafts on public.billing_documents
  for insert to authenticated
  with check (
    (select private.is_admin())
    and status = 'DRAFT'
    and document_number is null
    and finalized_at is null
    and accepted_at is null
    and payment_verified_at is null
  );

drop policy if exists billing_documents_admin_update_drafts on public.billing_documents;
create policy billing_documents_admin_update_drafts on public.billing_documents
  for update to authenticated
  using ((select private.is_admin()) and status = 'DRAFT')
  with check (
    (select private.is_admin())
    and status = 'DRAFT'
    and document_number is null
    and finalized_at is null
    and accepted_at is null
    and payment_verified_at is null
  );

revoke all on table public.billing_documents from public, anon, authenticated;
grant select, insert, update on table public.billing_documents to authenticated;
