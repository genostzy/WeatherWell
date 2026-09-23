-- I5: a push subscription is written straight from the browser, so nothing
-- but this stops a caller storing any URL as its endpoint — which the push
-- sender would then POST to. Only the browsers' own push services are
-- accepted. src/lib/send-zone-push.ts applies the same list at send time.
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_is_push_service
  check (endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com|([a-z0-9-]+\.)*push\.apple\.com)/');
