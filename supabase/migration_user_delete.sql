-- Deleting a user no longer fails when they own delivery records: the records stay, with no person assigned.
alter table public.deliveries alter column fsm_id drop not null, alter column salesperson_id drop not null;
alter table public.deliveries drop constraint deliveries_fsm_id_fkey, add constraint deliveries_fsm_id_fkey foreign key (fsm_id) references public.profiles(id) on delete set null;
alter table public.deliveries drop constraint deliveries_salesperson_id_fkey, add constraint deliveries_salesperson_id_fkey foreign key (salesperson_id) references public.profiles(id) on delete set null;
alter table public.delivery_requirements drop constraint delivery_requirements_completed_by_fkey, add constraint delivery_requirements_completed_by_fkey foreign key (completed_by) references public.profiles(id) on delete set null;
alter table public.delivery_events drop constraint delivery_events_actor_id_fkey, add constraint delivery_events_actor_id_fkey foreign key (actor_id) references public.profiles(id) on delete set null;
