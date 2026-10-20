-- Apply once to EasyLatih Supabase V2.
alter table public.venue_documents add column if not exists booking_ids uuid[] not null default '{}'::uuid[];
update public.venue_documents set booking_ids=array[booking_id] where cardinality(booking_ids)=0;
alter table public.venue_documents add constraint venue_document_booking_ids_valid check(
cardinality(booking_ids) between 1 and 31 and booking_id=any(booking_ids));
create or replace function public.venue_document_booking_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_count integer;v_distinct integer;v_first date;v_last date;
begin
 perform pg_advisory_xact_lock(20927,13266);
 if new.document_type='RECEIPT' then
  if not exists(select 1 from public.venue_documents d where d.booking_id=new.booking_id
   and d.document_type='INVOICE' and d.status='FINAL' and d.payment_verified_at is not null
   and d.booking_ids=new.booking_ids) then
   raise exception 'Receipt requires a fully paid, finalized invoice for the same booking dates';
  end if;
 else
  if exists(select 1 from public.venue_documents d where d.document_type='INVOICE'
   and d.id<>new.id and d.booking_ids&&new.booking_ids) then
   raise exception 'One of these dates is already linked to another invoice';
  end if;
 end if;
 if cardinality(new.booking_ids)<>cardinality(array(select distinct unnest(new.booking_ids))) then
  raise exception 'Repeated booking dates are not allowed';
 end if;
 select count(*),count(distinct b.booking_date),min(b.booking_date),max(b.booking_date)
 into v_count,v_distinct,v_first,v_last
 from public.venue_bookings b
 where b.id=any(new.booking_ids)
 and b.room_id=(select room_id from public.venue_bookings where id=new.booking_id)
 and lower(b.applicant_email)=(select lower(applicant_email) from public.venue_bookings where id=new.booking_id)
 and b.status not in ('CANCELLED','REJECTED');
 if v_count<>cardinality(new.booking_ids) or v_distinct<>v_count
 or v_last<>v_first+(v_count-1) then
  raise exception 'Invoice dates must be consecutive, one booking per day, and for the same customer and room';
 end if;
 return new;
end;
$$;
drop trigger if exists venue_document_booking_guard_tr on public.venue_documents;
create trigger venue_document_booking_guard_tr
before insert or update of booking_ids,booking_id,document_type on public.venue_documents
for each row execute function public.venue_document_booking_guard();