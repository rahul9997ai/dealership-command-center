-- Security hardening (audit 2026-09-25).
-- Logged-out visitors (anon) can no longer call any internal function directly.
-- Trigger functions can't be called directly by anyone (triggers still fire: EXECUTE is only checked when a trigger is created).
-- Signed-in users keep the helpers the access rules and the apps rely on.

-- Trigger functions: nobody calls these directly.
revoke execute on function public.log_deal_change() from public, anon, authenticated;
revoke execute on function public.log_delivery_created() from public, anon, authenticated;
revoke execute on function public.recompute_delivery_status() from public, anon, authenticated;
revoke execute on function public.profiles_sync_access() from public, anon, authenticated;
revoke execute on function public.block_delivered_with_open_requirements() from public, anon, authenticated;

-- Helpers and app RPCs: signed-in users only.
do $$
declare f text;
begin
  foreach f in array array[
    'public.my_role()', 'public.my_dealership()', 'public.is_admin()', 'public.cc_ok()', 'public.pulse_ok()',
    'public.clear_must_change_password()', 'public.mark_onboarded()', 'public.mark_password_changed()', 'public.mark_welcome_seen()',
    'public.complete_delivery(uuid)', 'public.set_requirement_status(uuid, text, text)', 'public.decide_delivery_comment(uuid, text, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- Fixed search_path on the two functions the advisor flagged.
alter function public.profiles_sync_access() set search_path = public;
alter function public.block_delivered_with_open_requirements() set search_path = public;
