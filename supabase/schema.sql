create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text not null,
  role text not null default 'FSM',
  dealership_id text,
  active boolean not null default true,
  must_change_password boolean not null default true,
  access_type text not null default 'full' check (access_type in ('full','demo')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role in ('Master Administrator','General Manager'));
$$;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "admins read profiles" on public.profiles;
create policy "admins read profiles" on public.profiles for select using (public.is_admin());

create or replace function public.clear_must_change_password() returns void
language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;
revoke all on function public.clear_must_change_password() from public, anon;
grant execute on function public.clear_must_change_password() to authenticated;

alter table public.profiles add column if not exists onboarded boolean not null default false;

create or replace function public.mark_onboarded() returns void
language sql security definer set search_path = public as $$
  update public.profiles set onboarded = true where id = auth.uid();
$$;
revoke all on function public.mark_onboarded() from public, anon;
grant execute on function public.mark_onboarded() to authenticated;
