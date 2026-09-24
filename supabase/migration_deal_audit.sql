-- Audit trail for completed deals: who created, changed or deleted a deal, and when.
-- Append-only: nobody can write to this table through the API; a trigger fills it.
create table if not exists public.deal_audit (
  id bigserial primary key,
  deal_id text not null,
  dealership_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor uuid,
  actor_name text,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index if not exists deal_audit_deal_idx on public.deal_audit (deal_id, changed_at desc);
create index if not exists deal_audit_dealership_idx on public.deal_audit (dealership_id, changed_at desc);
alter table public.deal_audit enable row level security;

drop policy if exists deal_audit_select on public.deal_audit;
create policy deal_audit_select on public.deal_audit for select to authenticated
  using (my_role() = 'Master Administrator' or (my_role() = 'General Manager' and dealership_id = my_dealership()));

create or replace function public.log_deal_change() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from public.profiles where id = auth.uid();
  if tg_op = 'DELETE' then
    insert into public.deal_audit (deal_id, dealership_id, action, actor, actor_name, old_data)
      values (old.id, old.dealership_id, 'DELETE', auth.uid(), v_name, old.data);
  elsif tg_op = 'UPDATE' then
    if new.data is distinct from old.data then
      insert into public.deal_audit (deal_id, dealership_id, action, actor, actor_name, old_data, new_data)
        values (new.id, new.dealership_id, 'UPDATE', auth.uid(), v_name, old.data, new.data);
    end if;
  else
    insert into public.deal_audit (deal_id, dealership_id, action, actor, actor_name, new_data)
      values (new.id, new.dealership_id, 'INSERT', auth.uid(), v_name, new.data);
  end if;
  return null;
end $$;

drop trigger if exists deals_audit on public.deals;
create trigger deals_audit after insert or update or delete on public.deals
  for each row execute function public.log_deal_change();
