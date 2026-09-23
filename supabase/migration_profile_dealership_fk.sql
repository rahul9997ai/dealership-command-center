-- A GM whose profile pointed at a deleted dealership could not manage anyone ("Not allowed").
-- Repoint that profile and stop it happening again: deleting a dealership now clears users' dealership instead of leaving a dangling id.
update public.profiles set dealership_id = 'd-blb7xk' where email = 'r_champaneri@401dixienissan.com' and dealership_id = 'd-05at42';
alter table public.profiles add constraint profiles_dealership_fkey foreign key (dealership_id) references public.dealerships(id) on delete set null;
