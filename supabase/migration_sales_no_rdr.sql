-- No separate "Del / scanned" status any more: those deals count as Delivered (flags.rdr remembers it was reported).
update public.sales_log
   set data = jsonb_set(data, '{status}', '"delivered"') || jsonb_build_object('flags', coalesce(data->'flags', '{}'::jsonb) || '{"rdr":true}'::jsonb)
 where data->>'status' = 'rdr';
-- Google Drive sync: deals deleted in the tracker stay deleted even though they're still in the Excel file.
alter table public.sales_sync add column if not exists excluded text[] not null default '{}';
