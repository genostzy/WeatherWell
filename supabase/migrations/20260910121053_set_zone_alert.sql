create or replace function public.set_zone_alert(
  p_zone_id  text,
  p_severity text,
  p_message  jsonb
)
returns void
language plpgsql
security invoker          -- the OPERATOR's own privileges; RLS still applies
set search_path = ''
as $$
declare
  v_previous text;
begin
  -- The whole point of doing this in one function: between the update and
  -- the insert there is no window for a second active alert to appear.
  update public.alerts
     set is_active = false, superseded_at = now()
   where zone_id = p_zone_id and is_active
  returning severity into v_previous;

  if p_severity is not null then
    insert into public.alerts
      (zone_id, severity, message, source, confidence, superseded_severity)
    values
      (p_zone_id, p_severity, p_message, 'manual', 'validated', v_previous);
  end if;
end;
$$;

revoke execute on function public.set_zone_alert(text, text, jsonb) from public, anon;
grant  execute on function public.set_zone_alert(text, text, jsonb) to authenticated;
