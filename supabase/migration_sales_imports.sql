-- Sales Tracker imports: every Excel import is recorded, and the store's General Manager (or a Master)
-- can delete everything one import brought in. Deals carry data.importBatch = the import's id; monthly
-- totals carry targets.history.batch (and targets.peopleBatch when the import also set the targets).

create or replace function public.sales_admin_ok(p_dealer text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'Master Administrator'
      or (p_dealer = public.my_dealership() and public.my_role() = 'General Manager');
$$;
grant execute on function public.sales_admin_ok(text) to authenticated;

create table if not exists public.sales_imports (
  id text primary key,
  dealership_id text not null references public.dealerships(id) on delete cascade,
  data jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.sales_imports enable row level security;
drop policy if exists sales_imports_rw on public.sales_imports;
create policy sales_imports_rw on public.sales_imports for select to authenticated using (public.sales_admin_ok(dealership_id));
drop policy if exists sales_imports_ins on public.sales_imports;
create policy sales_imports_ins on public.sales_imports for insert to authenticated with check (public.sales_admin_ok(dealership_id));
drop policy if exists cc_gate on public.sales_imports;
create policy cc_gate on public.sales_imports as restrictive for all to authenticated using (public.cc_ok()) with check (public.cc_ok());
grant select, insert on public.sales_imports to authenticated;

-- Delete one import: its deals (including any edits made to them since), its monthly totals, and the record.
create or replace function public.sales_import_delete(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d text; n_deals int; n_months int;
begin
  select dealership_id into d from public.sales_imports where id = p_id;
  if d is null then raise exception 'That import no longer exists.'; end if;
  if not (public.cc_ok() and public.sales_admin_ok(d)) then raise exception 'Only the General Manager can delete an import.'; end if;
  delete from public.sales_log where dealership_id = d and data->>'importBatch' = p_id;
  get diagnostics n_deals = row_count;
  update public.sales_targets set data = data - 'people' - 'peopleBatch' where dealership_id = d and data->>'peopleBatch' = p_id;
  update public.sales_targets set data = data - 'history' where dealership_id = d and data->'history'->>'batch' = p_id;
  get diagnostics n_months = row_count;
  delete from public.sales_imports where id = p_id;
  return jsonb_build_object('deals', n_deals, 'months', n_months);
end $$;
revoke execute on function public.sales_import_delete(text) from public, anon;
grant execute on function public.sales_import_delete(text) to authenticated;
