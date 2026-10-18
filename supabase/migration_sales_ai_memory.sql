-- The AI Assistant's memory for each dealership: lasting facts people tell it (someone on leave, goals, how the
-- GM likes emails signed). Saved by the assistant (remember tool) or typed on the Assistant page; read with every
-- answer. Only the ai-read Edge Function (service role) touches it: RLS on, no policies.
create table if not exists public.sales_ai_memory (
  id uuid primary key default gen_random_uuid(),
  dealership_id text not null references public.dealerships(id) on delete cascade,
  note text not null check (length(note) between 1 and 400),
  source text not null default 'typed',
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists sales_ai_memory_dealer on public.sales_ai_memory (dealership_id, created_at desc);
alter table public.sales_ai_memory enable row level security;
revoke all on public.sales_ai_memory from anon, authenticated;
