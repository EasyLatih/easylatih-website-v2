-- EasyLatih Inventory & Goodies
-- Run after venue-internal-training-blocks.sql

alter table public.venue_bookings
  add column if not exists internal_training_group_id uuid;

create index if not exists venue_bookings_internal_training_group_idx
  on public.venue_bookings (internal_training_group_id)
  where booking_source = 'INTERNAL';

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  unit text not null default 'unit',
  current_stock integer not null default 0 check (current_stock >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  default_per_pax integer not null default 1 check (default_per_pax >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id),
  quantity_change integer not null check (quantity_change <> 0),
  movement_type text not null check (movement_type in ('STOCK_IN','ADJUSTMENT','ISSUE')),
  reason text not null check (char_length(trim(reason)) between 2 and 300),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_item_created_idx
  on public.inventory_movements (item_id, created_at desc);

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

drop policy if exists inventory_items_admin_all on public.inventory_items;
create policy inventory_items_admin_all on public.inventory_items
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists inventory_movements_admin_read on public.inventory_movements;
create policy inventory_movements_admin_read on public.inventory_movements
  for select to authenticated
  using (private.is_admin());

drop policy if exists inventory_movements_admin_insert on public.inventory_movements;
create policy inventory_movements_admin_insert on public.inventory_movements
  for insert to authenticated
  with check (private.is_admin());

-- A movement is immutable. This trigger changes stock atomically and refuses
-- any issue/adjustment that would result in a negative balance.
create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.inventory_items
     set current_stock = current_stock + new.quantity_change,
         updated_at = now()
   where id = new.item_id
     and is_active = true
     and current_stock + new.quantity_change >= 0;

  if not found then
    raise exception 'Stock movement rejected: item does not exist, is inactive, or would create negative stock';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_movements_apply_stock on public.inventory_movements;
create trigger inventory_movements_apply_stock
before insert on public.inventory_movements
for each row execute function public.apply_inventory_movement();

revoke all on table public.inventory_items from anon;
revoke all on table public.inventory_movements from anon;
revoke all on table public.inventory_items from authenticated;
revoke all on table public.inventory_movements from authenticated;
grant select, insert, update on table public.inventory_items to authenticated;
grant select, insert on table public.inventory_movements to authenticated;

insert into public.inventory_items (sku, name, unit, reorder_level, default_per_pax)
values
  ('GOODIE-BAG', 'Non-woven Bag', 'unit', 20, 1),
  ('GOODIE-PEN', 'Pen', 'unit', 30, 1),
  ('GOODIE-NOTEBOOK', 'Buku Nota', 'unit', 20, 1)
on conflict (sku) do nothing;
