-- Shared business data. Every table is locked by row-level security so a user
-- can only ever read or write rows belonging to their own dealership.

create or replace function public.my_role() returns text
language sql security definer set search_path = public stable as $$
  select role from public.profiles where id = auth.uid() and active;
$$;
create or replace function public.my_dealership() returns text
language sql security definer set search_path = public stable as $$
  select dealership_id from public.profiles where id = auth.uid() and active;
$$;

create table if not exists public.dealerships (
  id text primary key,
  name text not null,
  active boolean not null default true,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.products (
  dealership_id text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (dealership_id, id)
);
create table if not exists public.deals (
  id text primary key,
  dealership_id text not null,
  fsm_user_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists deals_dealership_idx on public.deals (dealership_id);

alter table public.dealerships enable row level security;
alter table public.products enable row level security;
alter table public.deals enable row level security;

-- dealerships: master sees all; everyone else only their own; only master creates/deletes; GM edits their own
drop policy if exists dealerships_select on public.dealerships;
create policy dealerships_select on public.dealerships for select to authenticated
  using (public.my_role() = 'Master Administrator' or id = public.my_dealership());
drop policy if exists dealerships_insert on public.dealerships;
create policy dealerships_insert on public.dealerships for insert to authenticated
  with check (public.my_role() = 'Master Administrator');
drop policy if exists dealerships_update on public.dealerships;
create policy dealerships_update on public.dealerships for update to authenticated
  using (public.my_role() = 'Master Administrator' or (public.my_role() = 'General Manager' and id = public.my_dealership()))
  with check (public.my_role() = 'Master Administrator' or (public.my_role() = 'General Manager' and id = public.my_dealership()));
drop policy if exists dealerships_delete on public.dealerships;
create policy dealerships_delete on public.dealerships for delete to authenticated
  using (public.my_role() = 'Master Administrator');

-- products: everyone in the dealership can read; only GM level can change
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
  using (public.my_role() = 'Master Administrator' or dealership_id = public.my_dealership());
drop policy if exists products_write on public.products;
create policy products_write on public.products for all to authenticated
  using (public.my_role() = 'Master Administrator' or (public.my_role() = 'General Manager' and dealership_id = public.my_dealership()))
  with check (public.my_role() = 'Master Administrator' or (public.my_role() = 'General Manager' and dealership_id = public.my_dealership()));

-- deals: GM level sees the whole dealership; everyone else only their own deals
drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals for select to authenticated
  using (public.my_role() = 'Master Administrator'
    or (dealership_id = public.my_dealership() and (public.my_role() = 'General Manager' or fsm_user_id = auth.uid()::text)));
drop policy if exists deals_write on public.deals;
create policy deals_write on public.deals for all to authenticated
  using (public.my_role() = 'Master Administrator'
    or (dealership_id = public.my_dealership() and (public.my_role() = 'General Manager' or fsm_user_id = auth.uid()::text)))
  with check (public.my_role() = 'Master Administrator'
    or (dealership_id = public.my_dealership() and (public.my_role() = 'General Manager' or fsm_user_id = auth.uid()::text)));

revoke all on public.dealerships, public.products, public.deals from anon;
grant select, insert, update, delete on public.dealerships, public.products, public.deals to authenticated;
