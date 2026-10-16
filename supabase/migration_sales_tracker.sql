-- Sales Tracker (Phase 1): the sales log and each month's targets / selling days, per dealership.
-- Who: Master (all stores), and the store's General Manager and Sales Managers. Command Center access
-- is still required on top (cc_gate). Finance Managers have no access in Phase 1.

create or replace function public.sales_tracker_ok(p_dealer text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'Master Administrator'
      or (p_dealer = public.my_dealership() and public.my_role() in ('General Manager', 'Sales Manager'));
$$;

create table if not exists public.sales_log (
  id text primary key,
  dealership_id text not null references public.dealerships(id) on delete cascade,
  sold_on date,
  data jsonb not null,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_log_dealer_sold_idx on public.sales_log (dealership_id, sold_on);

create table if not exists public.sales_targets (
  dealership_id text not null references public.dealerships(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  data jsonb not null,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (dealership_id, month)
);

alter table public.sales_log enable row level security;
alter table public.sales_targets enable row level security;

drop policy if exists sales_log_rw on public.sales_log;
create policy sales_log_rw on public.sales_log for all to authenticated
  using (public.sales_tracker_ok(dealership_id)) with check (public.sales_tracker_ok(dealership_id));
drop policy if exists cc_gate on public.sales_log;
create policy cc_gate on public.sales_log as restrictive for all to authenticated using (public.cc_ok()) with check (public.cc_ok());

drop policy if exists sales_targets_rw on public.sales_targets;
create policy sales_targets_rw on public.sales_targets for all to authenticated
  using (public.sales_tracker_ok(dealership_id)) with check (public.sales_tracker_ok(dealership_id));
drop policy if exists cc_gate on public.sales_targets;
create policy cc_gate on public.sales_targets as restrictive for all to authenticated using (public.cc_ok()) with check (public.cc_ok());

-- Keep updated_at / updated_by honest on every change.
create or replace function public.sales_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists sales_log_touch on public.sales_log;
create trigger sales_log_touch before insert or update on public.sales_log for each row execute function public.sales_touch();
drop trigger if exists sales_targets_touch on public.sales_targets;
create trigger sales_targets_touch before insert or update on public.sales_targets for each row execute function public.sales_touch();

-- Change history for the sales log (who changed what, when), like the deal audit.
create table if not exists public.sales_log_audit (
  id bigint generated always as identity primary key,
  sale_id text not null,
  dealership_id text not null,
  action text not null,
  data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
alter table public.sales_log_audit enable row level security;
drop policy if exists sales_log_audit_read on public.sales_log_audit;
create policy sales_log_audit_read on public.sales_log_audit for select to authenticated
  using (public.my_role() = 'Master Administrator' or (dealership_id = public.my_dealership() and public.my_role() = 'General Manager'));
create or replace function public.log_sales_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.sales_log_audit (sale_id, dealership_id, action, data, changed_by) values (old.id, old.dealership_id, 'delete', old.data, auth.uid());
    return old;
  end if;
  insert into public.sales_log_audit (sale_id, dealership_id, action, data, changed_by)
    values (new.id, new.dealership_id, lower(tg_op), new.data, auth.uid());
  return new;
end $$;
drop trigger if exists sales_log_audit_trg on public.sales_log;
create trigger sales_log_audit_trg after insert or update or delete on public.sales_log for each row execute function public.log_sales_change();

grant select, insert, update, delete on public.sales_log, public.sales_targets to authenticated;
grant select on public.sales_log_audit to authenticated;
