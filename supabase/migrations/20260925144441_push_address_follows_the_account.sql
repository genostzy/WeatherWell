-- Privacy review (2026-09-25): a phone's alert address followed the account
-- that first saved it. When the account on a phone changed (a sign-out, a
-- sign-in, a shared phone), the page re-saved the phone's push subscription
-- under the new account as a second row, and the old account kept its own, so
-- alerts and officials' updates meant for the old account still reached this
-- phone. Saving now goes through this function, which hands the address to
-- the account using the phone. Only the browser holding a push subscription
-- knows its endpoint, so presenting one shows this is that phone.

create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_zone_id text,
  p_user_agent text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to save alerts on this phone.' using errcode = '42501';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> v_uid;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, zone_id, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, p_zone_id, p_user_agent)
  on conflict (user_id, endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        zone_id = excluded.zone_id,
        user_agent = excluded.user_agent,
        updated_at = now();
end $$;

revoke execute on function public.save_push_subscription(text, text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text, text) to authenticated;
