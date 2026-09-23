-- Per-app access on one shared login: Command Center (cc_*) and Axiom Pulse (pulse_*).
-- Removing/deactivating someone in one app no longer touches the other; the account is erased only when neither app has access.
alter table public.profiles
  add column if not exists cc_enabled boolean not null default true,
  add column if not exists cc_access_type text not null default 'full' check (cc_access_type in ('full','demo')),
  add column if not exists cc_expires_at timestamptz,
  add column if not exists pulse_enabled boolean not null default true,
  add column if not exists pulse_access_type text not null default 'full' check (pulse_access_type in ('full','demo')),
  add column if not exists pulse_expires_at timestamptz;

-- Backfill from the old shared columns. Salespeople never used Command Center.
update public.profiles set
  cc_enabled = (role <> 'Salesperson') and active,
  cc_access_type = access_type,
  cc_expires_at = expires_at,
  pulse_enabled = active;

-- Keep the legacy columns meaningful for anything still reading them:
-- active = enabled in at least one app; access_type / expires_at mirror Command Center.
create or replace function public.profiles_sync_access() returns trigger language plpgsql as $$
begin
  new.active := coalesce(new.cc_enabled, false) or coalesce(new.pulse_enabled, false);
  new.access_type := new.cc_access_type;
  new.expires_at := new.cc_expires_at;
  return new;
end $$;
drop trigger if exists profiles_sync_access on public.profiles;
create trigger profiles_sync_access before insert or update on public.profiles
  for each row execute function public.profiles_sync_access();

-- Real, database-level enforcement (Master Administrator always passes).
create or replace function public.cc_ok() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'Master Administrator'
    or (p.cc_enabled and (p.cc_access_type = 'full' or (p.cc_access_type = 'demo' and p.cc_expires_at > now())))))
$$;
create or replace function public.pulse_ok() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'Master Administrator'
    or (p.pulse_enabled and (p.pulse_access_type = 'full' or (p.pulse_access_type = 'demo' and p.pulse_expires_at > now())))))
$$;

-- Restrictive policies are ANDed with the existing ones, so nothing existing is rewritten.
drop policy if exists cc_gate on public.products;
create policy cc_gate on public.products as restrictive for all to authenticated using (public.cc_ok()) with check (public.cc_ok());
drop policy if exists cc_gate on public.deals;
create policy cc_gate on public.deals as restrictive for all to authenticated using (public.cc_ok()) with check (public.cc_ok());
drop policy if exists cc_gate_ins on public.dealerships;
create policy cc_gate_ins on public.dealerships as restrictive for insert to authenticated with check (public.cc_ok());
drop policy if exists cc_gate_upd on public.dealerships;
create policy cc_gate_upd on public.dealerships as restrictive for update to authenticated using (public.cc_ok()) with check (public.cc_ok());
drop policy if exists cc_gate_del on public.dealerships;
create policy cc_gate_del on public.dealerships as restrictive for delete to authenticated using (public.cc_ok());

drop policy if exists pulse_gate on public.deliveries;
create policy pulse_gate on public.deliveries as restrictive for all to authenticated using (public.pulse_ok()) with check (public.pulse_ok());
drop policy if exists pulse_gate on public.delivery_requirements;
create policy pulse_gate on public.delivery_requirements as restrictive for all to authenticated using (public.pulse_ok()) with check (public.pulse_ok());
drop policy if exists pulse_gate on public.delivery_events;
create policy pulse_gate on public.delivery_events as restrictive for all to authenticated using (public.pulse_ok()) with check (public.pulse_ok());
drop policy if exists pulse_gate on public.delivery_comments;
create policy pulse_gate on public.delivery_comments as restrictive for all to authenticated using (public.pulse_ok()) with check (public.pulse_ok());
