-- AI morning brief: one per store per day, written when the GM (or a Master) presses "Write today's brief".
-- Written by the ai-read Edge Function (service role); readable by the store's GM and Masters.
create table if not exists public.sales_ai_briefs (
  dealership_id text not null references public.dealerships(id) on delete cascade,
  day date not null,
  data jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (dealership_id, day)
);
alter table public.sales_ai_briefs enable row level security;
drop policy if exists sales_ai_briefs_read on public.sales_ai_briefs;
create policy sales_ai_briefs_read on public.sales_ai_briefs for select to authenticated using (public.sales_admin_ok(dealership_id));
drop policy if exists cc_gate on public.sales_ai_briefs;
create policy cc_gate on public.sales_ai_briefs as restrictive for all to authenticated using (public.cc_ok()) with check (public.cc_ok());
grant select on public.sales_ai_briefs to authenticated;
