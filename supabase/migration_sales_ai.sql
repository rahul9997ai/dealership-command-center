-- AI file reading: one row per AI read (who, which file, what was sent, what it cost).
-- Written only by the ai-read Edge Function (service role); the store's GM (or a Master) can read the list.
-- The switch and the monthly cap live on the dealership: dealerships.data.ai = { on: true, cap: 10 }.
create table if not exists public.sales_ai_usage (
  id bigint generated always as identity primary key,
  dealership_id text not null references public.dealerships(id) on delete cascade,
  user_id uuid,
  user_name text,
  file text,
  kind text,
  sent text,
  result text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists sales_ai_usage_dealer_idx on public.sales_ai_usage (dealership_id, created_at);
alter table public.sales_ai_usage enable row level security;
drop policy if exists sales_ai_usage_read on public.sales_ai_usage;
create policy sales_ai_usage_read on public.sales_ai_usage for select to authenticated using (public.sales_admin_ok(dealership_id));
drop policy if exists cc_gate on public.sales_ai_usage;
create policy cc_gate on public.sales_ai_usage as restrictive for all to authenticated using (public.cc_ok()) with check (public.cc_ok());
grant select on public.sales_ai_usage to authenticated;
