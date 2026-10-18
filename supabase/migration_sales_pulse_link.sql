-- Pulse → Sales Tracker (read-only from Pulse): a vehicle delivered in Pulse shows as Delivered in the sales log.
-- Per dealership, switched on in Dealership settings (dealerships.data.pulseLink.on, General Manager / Master).
-- Nothing in Pulse is changed. Runs when someone opens the Sales Tracker or the Dashboard.
-- Match: same stock # (letters/digits only), else the same customer name; only when exactly one open deal fits,
-- sold no later than the delivery and within 6 months before it. Each Pulse delivery is applied once
-- (data.flags.pulse = its id), so a deal changed back by hand afterwards is left alone.
create or replace function public.sales_pulse_apply(p_dealer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; cand text[]; n int := 0; unmatched int := 0; dday date;
begin
  if not public.sales_insights_ok(p_dealer) then raise exception 'Not allowed'; end if;
  if not coalesce((select (data->'pulseLink'->>'on')::boolean from dealerships where id = p_dealer), false) then
    return jsonb_build_object('off', true);
  end if;
  for r in
    select d.id::text as pid, d.delivered_at,
           upper(regexp_replace(coalesce(d.stock_number, ''), '[^A-Za-z0-9]', '', 'g')) as stk,
           upper(regexp_replace(coalesce(d.customer_name, ''), '[^A-Za-z]', '', 'g')) as cust
      from deliveries d
     where d.dealership_id = p_dealer and d.delivered_at is not null and d.delivered_at > now() - interval '12 months'
       and not exists (select 1 from sales_log s where s.dealership_id = p_dealer and s.data->'flags'->>'pulse' = d.id::text)
  loop
    dday := (r.delivered_at at time zone 'America/Toronto')::date;
    cand := null;
    if r.stk <> '' then
      select array_agg(s.id) into cand from sales_log s
       where s.dealership_id = p_dealer and s.sold_on <= dday and s.sold_on >= dday - 183
         and coalesce(s.data->>'status', 'pending') not in ('delivered', 'rdr', 'cancelled', 'declined')
         and upper(regexp_replace(coalesce(s.data->>'stockNo', ''), '[^A-Za-z0-9]', '', 'g')) = r.stk;
    end if;
    if coalesce(cardinality(cand), 0) = 0 and length(r.cust) >= 5 then
      select array_agg(s.id) into cand from sales_log s
       where s.dealership_id = p_dealer and s.sold_on <= dday and s.sold_on >= dday - 183
         and coalesce(s.data->>'status', 'pending') not in ('delivered', 'rdr', 'cancelled', 'declined')
         and upper(regexp_replace(coalesce(s.data->>'customer', ''), '[^A-Za-z]', '', 'g')) = r.cust;
    end if;
    if coalesce(cardinality(cand), 0) = 1 then
      update sales_log set data = data || jsonb_build_object(
          'status', 'delivered',
          'deliveredDate', to_char(dday, 'YYYY-MM-DD'),
          'statusDates', coalesce(data->'statusDates', '{}'::jsonb) || jsonb_build_object('delivered', to_char(dday, 'YYYY-MM-DD')),
          'flags', coalesce(data->'flags', '{}'::jsonb) || jsonb_build_object('pulse', r.pid),
          'updatedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'updatedBy', 'Pulse (delivered)')
       where id = cand[1] and dealership_id = p_dealer;
      n := n + 1;
    else
      unmatched := unmatched + 1;
    end if;
  end loop;
  return jsonb_build_object('applied', n, 'unmatched', unmatched);
end $$;
revoke all on function public.sales_pulse_apply(text) from public, anon;
grant execute on function public.sales_pulse_apply(text) to authenticated;
