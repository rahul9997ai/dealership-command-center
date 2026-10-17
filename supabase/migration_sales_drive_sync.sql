-- Google Drive sync: the Sales Tracker reads a dealership's Excel sales logs straight from Google Drive
-- (read-only, through a Google service account) while the Sales Managers keep working in Excel.
-- The files are listed on the dealership (dealerships.data.driveSync = { on, files:[{ id, name, type }] }).
-- This table remembers, per file, the version last synced, so an unchanged file isn't read again.
create table if not exists public.sales_sync (
  dealership_id text not null references public.dealerships(id) on delete cascade,
  file_id text not null,
  modified_time text,
  synced_at timestamptz not null default now(),
  synced_by text,
  result jsonb,
  primary key (dealership_id, file_id)
);
alter table public.sales_sync enable row level security;
drop policy if exists sales_sync_rw on public.sales_sync;
create policy sales_sync_rw on public.sales_sync for all to authenticated
  using (public.sales_insights_ok(dealership_id)) with check (public.sales_tracker_ok(dealership_id));
drop policy if exists cc_gate on public.sales_sync;
create policy cc_gate on public.sales_sync as restrictive for all to authenticated using (public.cc_ok()) with check (public.cc_ok());
grant select, insert, update, delete on public.sales_sync to authenticated;
