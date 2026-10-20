-- EasyLatih Venue Document migrations (applied 2026-10-21)
create table if not exists public.venue_documents (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.venue_bookings(id) on delete restrict,
 document_type text not null check(document_type in ('INVOICE','RECEIPT')),
 status text not null default 'DRAFT' check(status in ('DRAFT','FINAL')),
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 document_number text unique,
 google_doc_id text, google_doc_url text,
 pdf_file_id text, pdf_url text,
 payment_verified_at timestamptz,payment_reference text,
 payment_amount numeric(12,2) check(payment_amount is null or payment_amount>=0),
 sent_at timestamptz,finalized_at timestamptz,
 finalized_by uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint venue_document_booking_type_unique unique(booking_id,document_type),
 constraint venue_document_final_requires_number check(status='DRAFT' or (document_number is not null and finalized_at is not null))
);
create index if not exists venue_documents_bookings_idx on public.venue_documents(booking_id,document_type,status);
alter table public.venue_documents enable row level security;
revoke all on table public.venue_documents from public,anon,authenticated;
grant select,insert,update on public.venue_documents to authenticated;
-- On first install, apply the three admin-only policies from migration venue_invoice_receipt_drafts.
-- live project already has: venue_documents_admin_select, venue_documents_admin_insert,
-- and venue_documents_admin_update_drafts.
