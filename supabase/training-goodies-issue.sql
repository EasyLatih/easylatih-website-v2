-- Issue the configured training goodies once, based on confirmed actual attendance.
-- Run after inventory-goodies.sql, training-schedules.sql and training-actual-pax.sql.

alter table public.inventory_movements
  add column if not exists training_source text
    check (training_source is null or training_source in ('ROOM', 'EXTERNAL')),
  add column if not exists training_id uuid;

-- One training can issue each inventory item only once. The unique index also
-- prevents two simultaneous clicks from double-deducting stock.
create unique index if not exists inventory_training_issue_once_item_idx
  on public.inventory_movements (item_id, training_source, training_id)
  where movement_type = 'ISSUE'
    and training_source is not null
    and training_id is not null;

create or replace function public.issue_training_goodies(
  p_source text,
  p_training_id uuid,
  p_actual_participants integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_end_date date;
  v_item record;
  v_item_count integer := 0;
begin
  if not private.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_source not in ('ROOM', 'EXTERNAL') then
    raise exception 'Invalid training source';
  end if;

  if p_actual_participants is null or p_actual_participants < 1 or p_actual_participants > 5000 then
    raise exception 'Actual pax must be between 1 and 5,000';
  end if;

  if p_source = 'EXTERNAL' then
    select programme_title, end_date into v_title, v_end_date
      from public.training_schedules
      where id = p_training_id
        and status = 'CONFIRMED'
        and goodies_required = true;

    if v_title is null then
      raise exception 'Training is unavailable or is not marked for goodies';
    end if;

    if v_end_date > current_date then
      raise exception 'Goodies can only be issued after the training ends';
    end if;

    update public.training_schedules
       set actual_participants = p_actual_participants,
           updated_at = now()
     where id = p_training_id;
  else
    select programme_title into v_title
      from public.venue_bookings
      where (id = p_training_id or internal_training_group_id = p_training_id)
        and booking_source = 'INTERNAL'
        and status = 'CONFIRMED'
        and goodies_required = true
      order by booking_date
      limit 1;

    if v_title is null then
      raise exception 'Training is unavailable or is not marked for goodies';
    end if;

    select max(booking_date) into v_end_date
      from public.venue_bookings
      where (id = p_training_id or internal_training_group_id = p_training_id)
        and booking_source = 'INTERNAL'
        and status = 'CONFIRMED';

    if v_end_date > current_date then
      raise exception 'Goodies can only be issued after the training ends';
    end if;

    update public.venue_bookings
       set actual_participants = p_actual_participants,
           updated_at = now()
     where (id = p_training_id or internal_training_group_id = p_training_id)
       and booking_source = 'INTERNAL'
       and status = 'CONFIRMED';
  end if;

  if exists (
    select 1
      from public.inventory_movements
     where movement_type = 'ISSUE'
       and training_source = p_source
       and training_id = p_training_id
  ) then
    raise exception 'Goodies have already been issued for this training';
  end if;

  -- Validate every required item before inserting any movement, so an
  -- insufficient item never causes a partial issue.
  for v_item in
    select id, name, current_stock, default_per_pax
      from public.inventory_items
     where is_active = true
       and default_per_pax > 0
  loop
    if v_item.current_stock < p_actual_participants * v_item.default_per_pax then
      raise exception 'Insufficient stock for % (need %, available %)',
        v_item.name,
        p_actual_participants * v_item.default_per_pax,
        v_item.current_stock;
    end if;
  end loop;

  for v_item in
    select id, name, default_per_pax
      from public.inventory_items
     where is_active = true
       and default_per_pax > 0
  loop
    insert into public.inventory_movements (
      item_id, quantity_change, movement_type, reason, training_source, training_id
    ) values (
      v_item.id,
      -(p_actual_participants * v_item.default_per_pax),
      'ISSUE',
      'Training issue: ' || v_title,
      p_source,
      p_training_id
    );
    v_item_count := v_item_count + 1;
  end loop;

  return jsonb_build_object(
    'issued', true,
    'programme_title', v_title,
    'actual_participants', p_actual_participants,
    'items_issued', v_item_count
  );
end;
$$;

revoke all on function public.issue_training_goodies(text, uuid, integer) from public, anon;
grant execute on function public.issue_training_goodies(text, uuid, integer) to authenticated;
