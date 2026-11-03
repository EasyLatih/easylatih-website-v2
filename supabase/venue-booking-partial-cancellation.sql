-- Atomically cancel selected dates from an unpaid multi-day venue invoice.
-- The original finalized invoice stays VOID for accounting; a replacement draft
-- is created for the remaining consecutive booking dates in the same transaction.
create or replace function public.venue_amend_booking_dates(
  p_document_id uuid,
  p_cancel_booking_ids uuid[],
  p_reason text,
  p_admin_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_doc public.venue_documents%rowtype;
  v_ids uuid[];
  v_cancel_ids uuid[];
  v_keep_ids uuid[];
  v_keep_count integer;
  v_cancel_count integer;
  v_first date;
  v_last date;
  v_payload jsonb;
  v_lines jsonb;
  v_single_line jsonb;
  v_rate numeric(12,2);
  v_total numeric(12,2);
  v_replacement_id uuid;
begin
  if not exists (
    select 1 from auth.users u
    where u.id = p_admin_id
      and u.raw_app_meta_data ->> 'role' = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'A cancellation reason between 3 and 500 characters is required';
  end if;

  select * into v_doc
  from public.venue_documents
  where id = p_document_id
  for update;

  if not found or v_doc.document_type <> 'INVOICE'
     or v_doc.status <> 'FINAL'
     or v_doc.payment_verified_at is not null then
    raise exception 'Only an unpaid finalized invoice can be amended';
  end if;

  v_ids := coalesce(nullif(v_doc.booking_ids, '{}'::uuid[]), array[v_doc.booking_id]);
  v_cancel_ids := coalesce(p_cancel_booking_ids, '{}'::uuid[]);

  if cardinality(v_ids) < 2 or cardinality(v_cancel_ids) < 1
     or cardinality(v_cancel_ids) >= cardinality(v_ids)
     or cardinality(v_cancel_ids) <> cardinality(array(select distinct unnest(v_cancel_ids)))
     or not (v_cancel_ids <@ v_ids) then
    raise exception 'Select one or more invoiced dates to cancel and keep at least one date';
  end if;

  if exists (
    select 1 from public.venue_documents d
    where d.document_type = 'RECEIPT'
      and coalesce(nullif(d.booking_ids, '{}'::uuid[]), array[d.booking_id]) && v_ids
  ) then
    raise exception 'An invoice with a receipt cannot be amended';
  end if;

  select array_agg(x.id order by b.booking_date), min(b.booking_date), max(b.booking_date)
    into v_keep_ids, v_first, v_last
  from unnest(v_ids) as x(id)
  join public.venue_bookings b on b.id = x.id
  where not (b.id = any(v_cancel_ids))
    and b.status not in ('CANCELLED','REJECTED');

  v_keep_count := coalesce(cardinality(v_keep_ids), 0);
  if v_keep_count < 1 then
    raise exception 'At least one active booking date must remain';
  end if;

  if (select count(*) from unnest(v_ids) as x(id)
      join public.venue_bookings b on b.id = x.id) <> cardinality(v_ids) then
    raise exception 'Some invoiced booking dates are missing';
  end if;

  if v_last <> v_first + (v_keep_count - 1) then
    raise exception 'Remaining invoice dates must be consecutive';
  end if;

  select count(*) into v_cancel_count
  from public.venue_bookings b
  where b.id = any(v_cancel_ids)
    and b.status = 'CONFIRMED';
  if v_cancel_count <> cardinality(v_cancel_ids) then
    raise exception 'Only confirmed booking dates can be cancelled';
  end if;

  if jsonb_typeof(v_doc.payload -> 'lines') is distinct from 'array' then
    raise exception 'Invoice is missing its per-date rental breakdown';
  end if;
  if jsonb_array_length(v_doc.payload -> 'lines') <> cardinality(v_ids) then
    raise exception 'Invoice is missing its per-date rental breakdown';
  end if;

  -- Preserve the official invoice, number and PDF as a voided audit record.
  update public.venue_documents
  set status = 'VOID', voided_at = now(), voided_by = p_admin_id,
      void_reason = btrim(p_reason), updated_at = now()
  where id = v_doc.id;

  update public.venue_bookings
  set status = 'CANCELLED', updated_at = now()
  where id = any(v_cancel_ids) and status = 'CONFIRMED';

  select jsonb_agg(l.line order by b.booking_date),
         coalesce(sum((l.line ->> 'rate')::numeric), 0)
    into v_lines, v_rate
  from jsonb_array_elements(v_doc.payload -> 'lines') as l(line)
  join public.venue_bookings b
    on b.id::text = l.line ->> 'booking_id'
  where b.id = any(v_keep_ids);

  if jsonb_array_length(v_lines) <> v_keep_count then
    raise exception 'Invoice rental lines do not match the remaining dates';
  end if;

  v_payload := v_doc.payload;
  if v_keep_count = 1 then
    v_single_line := v_lines -> 0;
    v_payload := (v_payload - 'lines') || jsonb_build_object(
      'booking_date', v_single_line ->> 'booking_date',
      'start_time', v_single_line ->> 'start_time',
      'end_time', v_single_line ->> 'end_time',
      'session', v_single_line ->> 'session',
      'rate', v_rate
    );
  else
    v_payload := v_payload || jsonb_build_object(
      'lines', v_lines,
      'booking_date', v_first,
      'start_time', v_lines -> 0 ->> 'start_time',
      'end_time', v_lines -> 0 ->> 'end_time',
      'session', v_keep_count::text || '-day rental',
      'rate', v_rate
    );
  end if;

  v_total := greatest(
    0,
    v_rate
      + coalesce(nullif(v_payload ->> 'add_ons', '')::numeric, 0)
      - coalesce(nullif(v_payload ->> 'discount', '')::numeric, 0)
      + coalesce(nullif(v_payload ->> 'tax', '')::numeric, 0)
  );
  v_payload := v_payload || jsonb_build_object('total', v_total);

  insert into public.venue_documents (
    booking_id, booking_ids, document_type, status, payload
  ) values (
    v_keep_ids[1], v_keep_ids, 'INVOICE', 'DRAFT', v_payload
  ) returning id into v_replacement_id;

  return v_replacement_id;
end;
$$;

revoke all on function public.venue_amend_booking_dates(uuid, uuid[], text, uuid) from public, anon, authenticated;
grant execute on function public.venue_amend_booking_dates(uuid, uuid[], text, uuid) to service_role;
