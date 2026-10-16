-- Sales Tracker Phase 2: appointment board, Finance Manager list, and the Finance Manager's own view.

-- Appointment board: one row per store per day ({ people: { NAME: { new, used, confirmed, goal, shown, sold } } }).
create table if not exists public.sales_appointments (
  dealership_id text not null references public.dealerships(id) on delete cascade,
  day date not null,
  data jsonb not null,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (dealership_id, day)
);
alter table public.sales_appointments enable row level security;
drop policy if exists sales_appts_rw on public.sales_appointments;
create policy sales_appts_rw on public.sales_appointments for all to authenticated
  using (public.sales_tracker_ok(dealership_id)) with check (public.sales_tracker_ok(dealership_id));
drop policy if exists cc_gate on public.sales_appointments;
create policy cc_gate on public.sales_appointments as restrictive for all to authenticated using (public.cc_ok()) with check (public.cc_ok());
drop trigger if exists sales_appts_touch on public.sales_appointments;
create trigger sales_appts_touch before insert or update on public.sales_appointments for each row execute function public.sales_touch();
grant select, insert, update, delete on public.sales_appointments to authenticated;

-- The store's Finance Managers, so a Sales Manager can pick who did F&I on a deal (they can't list users otherwise).
create or replace function public.sales_fm_list(p_dealer text) returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name from public.profiles p
  where public.cc_ok() and public.sales_tracker_ok(p_dealer)
    and p.active and p.dealership_id = p_dealer and p.role in ('FSM', 'FSM Manager')
  order by p.name;
$$;
grant execute on function public.sales_fm_list(text) to authenticated;

-- A Finance Manager's own deals: matched by account (data.fiUserId), front gross removed.
create or replace function public.sales_log_mine(p_from date, p_to date) returns table (id text, data jsonb)
language sql stable security definer set search_path = public as $$
  select s.id, s.data - 'frontGross'
  from public.sales_log s
  where public.cc_ok() and public.my_role() in ('FSM', 'FSM Manager')
    and s.dealership_id = public.my_dealership()
    and s.sold_on >= p_from and s.sold_on < p_to
    and s.data->>'fiUserId' = auth.uid()::text
  order by s.sold_on desc, s.id;
$$;
grant execute on function public.sales_log_mine(date, date) to authenticated;

-- A Finance Manager may change only F&I gross and funding on their own deals.
create or replace function public.sales_log_set_fi(p_id text, p_fi numeric, p_funding jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select name into who from public.profiles where id = auth.uid();
  update public.sales_log s
     set data = s.data
       || jsonb_build_object('fiGross', p_fi, 'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'updatedBy', coalesce(who, ''))
       || case when p_funding is null then '{}'::jsonb else jsonb_build_object('funding', p_funding) end
   where s.id = p_id
     and public.cc_ok() and public.my_role() in ('FSM', 'FSM Manager')
     and s.dealership_id = public.my_dealership()
     and s.data->>'fiUserId' = auth.uid()::text;
  if not found then raise exception 'You can only update your own deals.'; end if;
end $$;
grant execute on function public.sales_log_set_fi(text, numeric, jsonb) to authenticated;
