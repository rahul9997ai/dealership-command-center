-- Coupons: the shared product list on a dealership (data.couponProducts).
-- Only a General Manager or Master can update a dealership row, but every Finance Manager with
-- Command Center access should be able to add or remove coupon products without bothering the
-- General Manager. This function changes that one list, for the caller's own dealership only.
-- Coupons themselves are never stored.
create or replace function public.set_coupon_products(p_products jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_item jsonb;
begin
  if not public.cc_ok() then raise exception 'No Command Center access'; end if;
  if public.my_role() not in ('Master Administrator', 'General Manager', 'FSM', 'FSM Manager') then raise exception 'Not allowed'; end if;
  if public.my_dealership() is null then raise exception 'No dealership'; end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) > 30 then raise exception 'The list must be up to 30 products'; end if;
  for v_item in select * from jsonb_array_elements(p_products) loop
    if jsonb_typeof(v_item) <> 'string' or length(v_item #>> '{}') = 0 or length(v_item #>> '{}') > 60 then
      raise exception 'Each product must be a name of 1 to 60 characters';
    end if;
  end loop;
  update public.dealerships set data = jsonb_set(coalesce(data, '{}'::jsonb), '{couponProducts}', p_products)
    where id = public.my_dealership();
end $$;
revoke execute on function public.set_coupon_products(jsonb) from public, anon;
grant execute on function public.set_coupon_products(jsonb) to authenticated;
