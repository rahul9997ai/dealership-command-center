-- The dealership's monthly financial statement figures for the GM dashboard (Financials and Overview).
-- One row per store and month. Read from an uploaded or linked statement (AI pulls the standard figures out,
-- the GM checks them and saves) or typed in. General Manager and Master only: these are the store's books.
create table if not exists public.dealer_financials (
  dealership_id text not null references public.dealerships(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  data jsonb not null,
  source text,
  updated_by uuid default auth.uid(),
  updated_by_name text,
  updated_at timestamptz not null default now(),
  primary key (dealership_id, month)
);
alter table public.dealer_financials enable row level security;
drop policy if exists dealer_financials_gm on public.dealer_financials;
create policy dealer_financials_gm on public.dealer_financials for all to authenticated
  using (public.sales_admin_ok(dealership_id)) with check (public.sales_admin_ok(dealership_id));
grant select, insert, update, delete on public.dealer_financials to authenticated;
revoke all on public.dealer_financials from anon;
