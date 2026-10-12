-- Deal history: stop logging every auto-save of an unfinished deal.
-- Since build 2026-10-12.1 a deal in progress is saved to Saved deals (status "Saved") up to
-- every 30 seconds, and each save wrote a full before/after copy into deal_audit. Drafts are
-- now skipped while they stay drafts. Still logged: every change to a completed deal, the
-- moment a draft becomes a completed deal, and every delete (drafts included).
-- Existing audit rows are left as they are.
create or replace function public.log_deal_change() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if tg_op = 'INSERT' and coalesce(new.data->>'status', '') = 'Saved' then
    return null;
  end if;
  if tg_op = 'UPDATE' and coalesce(new.data->>'status', '') = 'Saved' and coalesce(old.data->>'status', '') = 'Saved' then
    return null;
  end if;
  select name into v_name from public.profiles where id = auth.uid();
  if tg_op = 'DELETE' then
    insert into public.deal_audit (deal_id, dealership_id, action, actor, actor_name, old_data)
      values (old.id, old.dealership_id, 'DELETE', auth.uid(), v_name, old.data);
  elsif tg_op = 'UPDATE' then
    if new.data is distinct from old.data then
      insert into public.deal_audit (deal_id, dealership_id, action, actor, actor_name, old_data, new_data)
        values (new.id, new.dealership_id, 'UPDATE', auth.uid(), v_name, old.data, new.data);
    end if;
  else
    insert into public.deal_audit (deal_id, dealership_id, action, actor, actor_name, new_data)
      values (new.id, new.dealership_id, 'INSERT', auth.uid(), v_name, new.data);
  end if;
  return null;
end $$;
-- Trigger functions run as the trigger, never called directly (see migration_hardening.sql).
revoke execute on function public.log_deal_change() from public, anon, authenticated;
