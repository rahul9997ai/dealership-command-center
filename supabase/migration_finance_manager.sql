-- Finance Manager (stored as role 'FSM') can create/edit products for their own dealership.
alter policy products_write on public.products
  using ((my_role() = 'Master Administrator') OR ((my_role() IN ('General Manager','FSM','FSM Manager')) AND (dealership_id = my_dealership())))
  with check ((my_role() = 'Master Administrator') OR ((my_role() IN ('General Manager','FSM','FSM Manager')) AND (dealership_id = my_dealership())));
-- One role: any legacy 'FSM Manager' becomes 'FSM' (shown as Finance Manager).
update public.profiles set role = 'FSM' where role = 'FSM Manager';
