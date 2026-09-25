-- Password recovery without email: security questions for residents, and an
-- admin reset for officials. Opt-in email alerts for Google accounts.

-- 1. Security questions, residents only. An official's account issues
-- alerts, so a guessed answer must never unlock one; officials reset through
-- an admin (admin_authorize_password_reset, below).
create or replace function private.recovery_question_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['favorite_food', 'mobile_number', 'first_school', 'birth_town', 'first_pet']
$$;

-- Answers match without regard to case or spacing; a mobile number by its
-- last ten digits, so 0917 123 4567 and +63 917 123 4567 are the same.
create or replace function private.normalize_recovery_answer(p_question text, p_answer text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_question = 'mobile_number' then right(regexp_replace(coalesce(p_answer, ''), '\D', '', 'g'), 10)
    else lower(regexp_replace(trim(coalesce(p_answer, '')), '\s+', ' ', 'g'))
  end
$$;

-- In private, which the API does not expose; answers kept only as bcrypt hashes.
create table private.recovery_answers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  question_1 text not null,
  answer_1_hash text not null,
  question_2 text not null,
  answer_2_hash text not null,
  updated_at timestamptz not null default now(),
  constraint recovery_questions_known check (
    question_1 = any (private.recovery_question_keys()) and question_2 = any (private.recovery_question_keys())),
  constraint recovery_questions_differ check (question_1 <> question_2)
);

create table private.recovery_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);

create index recovery_attempts_email_time_idx on private.recovery_attempts (email, attempted_at desc);

create or replace function public.set_recovery_answers(
  p_question_1 text, p_answer_1 text, p_question_2 text, p_answer_2 text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_answer_1 text := private.normalize_recovery_answer(p_question_1, p_answer_1);
  v_answer_2 text := private.normalize_recovery_answer(p_question_2, p_answer_2);
begin
  if v_uid is null or exists (select 1 from auth.users where id = v_uid and is_anonymous) then
    raise exception using errcode = '42501', message = 'Create an account first.';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and role <> 'resident') then
    raise exception using errcode = '42501',
      message = 'Officials reset their password through an admin, not security questions.';
  end if;
  if not (p_question_1 = any (private.recovery_question_keys())
          and p_question_2 = any (private.recovery_question_keys())) then
    raise exception using errcode = '22023', message = 'Pick two of the listed questions.';
  end if;
  if p_question_1 = p_question_2 then
    raise exception using errcode = '22023', message = 'Pick two different questions.';
  end if;
  if (p_question_1 = 'mobile_number' and length(v_answer_1) <> 10)
     or (p_question_2 = 'mobile_number' and length(v_answer_2) <> 10) then
    raise exception using errcode = '22023', message = 'Enter the whole mobile number, like 0917 123 4567.';
  end if;
  if length(v_answer_1) < 2 or length(v_answer_2) < 2 then
    raise exception using errcode = '22023', message = 'Each answer needs at least 2 characters.';
  end if;

  insert into private.recovery_answers (user_id, question_1, answer_1_hash, question_2, answer_2_hash)
  values (v_uid,
          p_question_1, extensions.crypt(v_answer_1, extensions.gen_salt('bf', 10)),
          p_question_2, extensions.crypt(v_answer_2, extensions.gen_salt('bf', 10)))
  on conflict (user_id) do update
    set question_1 = excluded.question_1, answer_1_hash = excluded.answer_1_hash,
        question_2 = excluded.question_2, answer_2_hash = excluded.answer_2_hash,
        updated_at = now();
end $$;

revoke execute on function public.set_recovery_answers(text, text, text, text) from public, anon;
grant execute on function public.set_recovery_answers(text, text, text, text) to authenticated;

create or replace function public.my_recovery_questions()
returns table (question_1 text, question_2 text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.question_1, a.question_2 from private.recovery_answers a where a.user_id = (select auth.uid())
$$;

revoke execute on function public.my_recovery_questions() from public, anon;
grant execute on function public.my_recovery_questions() to authenticated;

-- The two questions to ask for an email. An unknown email, or an account
-- that cannot use questions, gets a pair picked from the email itself, so
-- the page does not reveal who has an account. Server only (service role).
create or replace function public.recovery_questions_for(p_email text)
returns table (question_1 text, question_2 text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  return query
    select a.question_1, a.question_2
      from auth.users u
      join public.profiles p on p.id = u.id and p.role = 'resident'
      join private.recovery_answers a on a.user_id = u.id
     where lower(u.email) = v_email and not u.is_anonymous;
  if not found then
    return query
      select decoy.keys[1], decoy.keys[2]
        from (select array_agg(k order by md5(v_email || k)) as keys
                from unnest(private.recovery_question_keys()) k) decoy;
  end if;
end $$;

revoke execute on function public.recovery_questions_for(text) from public, anon, authenticated;
grant execute on function public.recovery_questions_for(text) to service_role;

-- Returns the account's id only when both answers match. Five wrong tries
-- for an email within an hour lock it until the hour is up. Server only.
create or replace function public.verify_recovery_answers(p_email text, p_answer_1 text, p_answer_2 text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
  v_question_1 text;
  v_hash_1 text;
  v_question_2 text;
  v_hash_2 text;
  v_ok boolean := false;
begin
  if (select count(*) from private.recovery_attempts
       where email = v_email and not succeeded and attempted_at > now() - interval '1 hour') >= 5 then
    raise exception using errcode = '54000', message = 'Too many tries. Try again in an hour.';
  end if;

  select u.id, a.question_1, a.answer_1_hash, a.question_2, a.answer_2_hash
    into v_user, v_question_1, v_hash_1, v_question_2, v_hash_2
    from auth.users u
    join public.profiles p on p.id = u.id and p.role = 'resident'
    join private.recovery_answers a on a.user_id = u.id
   where lower(u.email) = v_email and not u.is_anonymous;

  if v_user is not null then
    v_ok := extensions.crypt(private.normalize_recovery_answer(v_question_1, p_answer_1), v_hash_1) = v_hash_1
        and extensions.crypt(private.normalize_recovery_answer(v_question_2, p_answer_2), v_hash_2) = v_hash_2;
  else
    -- The same work as a real check, so the time taken does not tell
    -- accounts apart.
    perform extensions.crypt(coalesce(p_answer_1, ''), extensions.gen_salt('bf', 10));
    perform extensions.crypt(coalesce(p_answer_2, ''), extensions.gen_salt('bf', 10));
  end if;

  insert into private.recovery_attempts (email, succeeded) values (v_email, v_ok);
  return case when v_ok then v_user end;
end $$;

revoke execute on function public.verify_recovery_answers(text, text, text) from public, anon, authenticated;
grant execute on function public.verify_recovery_answers(text, text, text) to service_role;

-- 2. An admin resets an official's password: checked and recorded here, then
-- the server sets it with the service role. Never an admin's.
alter table public.official_actions drop constraint official_actions_action_check;
alter table public.official_actions add constraint official_actions_action_check check (action = any (array[
  'alert.set', 'alert.cleared', 'centre.status', 'centre.occupancy', 'centre.confirmed',
  'pin.removed', 'pin.restored', 'official.appointed', 'official.removed', 'official.password_reset']));

create or replace function public.admin_authorize_password_reset(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_name text;
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') then
    raise exception using errcode = '42501', message = 'Only an admin can reset an official''s password.';
  end if;

  select u.id, p.display_name into v_target, v_name
    from auth.users u
    join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(p_email)) and p.role = 'operator';
  if v_target is null then
    raise exception using errcode = 'P0002', message = 'No official has that email.';
  end if;

  perform private.record_official_action(
    'official.password_reset', null, v_target::text, jsonb_build_object('display_name', v_name));
  return v_target;
end $$;

revoke execute on function public.admin_authorize_password_reset(text) from public, anon;
grant execute on function public.admin_authorize_password_reset(text) to authenticated;

-- 3. Email alerts, opt-in, Google accounts only: Google has checked the
-- address, while a password account's email is never confirmed, so anyone
-- could sign a stranger up.
create table public.email_alert_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- The barangay a resident follows; its alerts are emailed.
  zone_id text references public.zones (id),
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now()
);

alter table public.email_alert_subscriptions enable row level security;
revoke all on public.email_alert_subscriptions from anon, authenticated;
grant select (user_id, zone_id, created_at), delete on public.email_alert_subscriptions to authenticated;

create policy email_alerts_read_own on public.email_alert_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy email_alerts_delete_own on public.email_alert_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.subscribe_email_alerts(p_zone_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not exists (
       select 1 from auth.identities i where i.user_id = v_uid and i.provider = 'google') then
    raise exception using errcode = '42501', message = 'Email alerts need an account signed in with Google.';
  end if;
  if p_zone_id is not null and not exists (select 1 from public.zones where id = p_zone_id) then
    raise exception using errcode = '22023', message = 'Unknown barangay.';
  end if;

  insert into public.email_alert_subscriptions (user_id, zone_id) values (v_uid, p_zone_id)
  on conflict (user_id) do update set zone_id = excluded.zone_id;
end $$;

revoke execute on function public.subscribe_email_alerts(text) from public, anon;
grant execute on function public.subscribe_email_alerts(text) to authenticated;

-- The unsubscribe link in every email. Server only.
create or replace function public.unsubscribe_email_alerts(p_token uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.email_alert_subscriptions where unsubscribe_token = p_token returning 1
  )
  select exists (select 1 from gone)
$$;

revoke execute on function public.unsubscribe_email_alerts(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_email_alerts(uuid) to service_role;

-- Who to email: residents following a barangay, and/or the given accounts
-- (officials), each with their own unsubscribe token. Server only.
create or replace function public.email_alert_recipients(p_zone_id text default null, p_user_ids uuid[] default null)
returns table (email text, unsubscribe_token uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text, s.unsubscribe_token
    from public.email_alert_subscriptions s
    join auth.users u on u.id = s.user_id
   where u.email is not null
     and (s.zone_id = p_zone_id or s.user_id = any (coalesce(p_user_ids, '{}')))
     and exists (select 1 from auth.identities i where i.user_id = s.user_id and i.provider = 'google')
$$;

revoke execute on function public.email_alert_recipients(text, uuid[]) from public, anon, authenticated;
grant execute on function public.email_alert_recipients(text, uuid[]) to service_role;
