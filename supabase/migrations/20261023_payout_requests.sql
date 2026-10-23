-- Payout Request log: one row per requisition a Finance / Sales Manager creates (applied through the Supabase MCP on 2026-10-23).
create or replace function public.payout_ok(p_dealer text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.my_role() = 'Master Administrator'
      or (p_dealer = public.my_dealership() and (
            public.my_role() = 'General Manager'
         or public.sales_switch_on(p_dealer, 'payout')));
$$;

create table if not exists public.payout_requests (
  id text primary key,
  dealership_id text not null,
  created_by uuid not null default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'sent',
  kind text,
  data jsonb not null default '{}'::jsonb,
  emailed_at timestamptz
);
create index if not exists payout_requests_dealer_idx on public.payout_requests (dealership_id, created_at desc);
alter table public.payout_requests enable row level security;

create policy cc_gate on public.payout_requests as restrictive for all to authenticated using (public.cc_ok()) with check (public.cc_ok());
create policy payout_select on public.payout_requests for select to authenticated
  using (public.payout_ok(dealership_id) and (created_by = auth.uid() or public.my_role() in ('General Manager','Master Administrator')));
create policy payout_insert on public.payout_requests for insert to authenticated
  with check (public.payout_ok(dealership_id) and created_by = auth.uid());
create policy payout_update on public.payout_requests for update to authenticated
  using (public.payout_ok(dealership_id) and (created_by = auth.uid() or public.my_role() in ('General Manager','Master Administrator')))
  with check (public.payout_ok(dealership_id) and (created_by = auth.uid() or public.my_role() in ('General Manager','Master Administrator')));
create policy payout_delete on public.payout_requests for delete to authenticated
  using (public.payout_ok(dealership_id) and (created_by = auth.uid() or public.my_role() in ('General Manager','Master Administrator')));
