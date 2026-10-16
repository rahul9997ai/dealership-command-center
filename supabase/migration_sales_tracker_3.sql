-- Sales Tracker phase 3: the Sales Tracker and the Insights dashboard become per-person switches.
-- The switches live on the dealership (dealerships.data.fmAccess[userId].sales / .insights), which only
-- the store's General Manager or a Master can change. GM and Master always have both.
--   Sales Tracker: Master, the store's GM, or a Sales Manager with the switch on (full read and write).
--   Insights: anyone above, or anyone in the store with the Insights switch on (read only).
--   A Finance Manager's own-deals view (My F&I) now also needs their Sales Tracker switch.

create or replace function public.sales_switch_on(p_dealer text, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (d.data -> 'fmAccess' -> (auth.uid()::text) ->> p_key) = 'true'
    from public.dealerships d where d.id = p_dealer and d.id = public.my_dealership()
  ), false);
$$;

create or replace function public.sales_tracker_ok(p_dealer text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'Master Administrator'
      or (p_dealer = public.my_dealership() and (
            public.my_role() = 'General Manager'
         or (public.my_role() = 'Sales Manager' and public.sales_switch_on(p_dealer, 'sales'))));
$$;

create or replace function public.sales_insights_ok(p_dealer text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sales_tracker_ok(p_dealer)
      or (p_dealer = public.my_dealership() and public.sales_switch_on(p_dealer, 'insights'));
$$;
grant execute on function public.sales_switch_on(text, text), public.sales_tracker_ok(text), public.sales_insights_ok(text) to authenticated;

-- Insights reads the log and the monthly targets / imported totals; it can't change them.
drop policy if exists sales_log_insights on public.sales_log;
create policy sales_log_insights on public.sales_log for select to authenticated using (public.sales_insights_ok(dealership_id));
drop policy if exists sales_targets_insights on public.sales_targets;
create policy sales_targets_insights on public.sales_targets for select to authenticated using (public.sales_insights_ok(dealership_id));

-- My F&I: the Finance Manager's own deals, front gross removed, and only with their switch on.
create or replace function public.sales_log_mine(p_from date, p_to date) returns table (id text, data jsonb)
language sql stable security definer set search_path = public as $$
  select s.id, s.data - 'frontGross'
  from public.sales_log s
  where public.cc_ok() and public.my_role() in ('FSM', 'FSM Manager')
    and public.sales_switch_on(public.my_dealership(), 'sales')
    and s.dealership_id = public.my_dealership()
    and s.sold_on >= p_from and s.sold_on < p_to
    and s.data->>'fiUserId' = auth.uid()::text
  order by s.sold_on desc, s.id;
$$;

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
     and public.sales_switch_on(public.my_dealership(), 'sales')
     and s.dealership_id = public.my_dealership()
     and s.data->>'fiUserId' = auth.uid()::text;
  if not found then raise exception 'You can only update your own deals.'; end if;
end $$;
