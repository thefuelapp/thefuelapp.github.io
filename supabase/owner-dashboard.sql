-- FU£L owner dashboard (20 Sep 2026). Run this ONCE in Supabase → SQL Editor, after changing the email on the last line
-- to the email you sign in to the app with. It adds:
--   app_owners      who is allowed to see the numbers (nobody can read this table from the app)
--   owner_stats()   one function that returns every figure the dashboard page (app/owner.html) shows.
-- The function runs with elevated rights but checks the caller's signed-in email first, so for anyone else it returns an error
-- and no data. No secret keys go anywhere near the web page.

create table if not exists public.app_owners (email text primary key);
alter table public.app_owners enable row level security;   -- no policies: not readable or writable from the app

create or replace function public.owner_stats()
returns json language plpgsql security definer set search_path = public, auth as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', '')); tz text := 'Europe/London'; result json;
begin
  if me = '' or not exists (select 1 from app_owners where lower(email) = me) then
    raise exception 'not allowed';
  end if;

  with u as (
    select au.id, au.email, au.created_at, au.last_sign_in_at,
           e.plan, e.source, e.updated_at as access_at, e.expires_at,
           s.updated_at as active_at, s.data
    from auth.users au
    left join entitlements e on e.user_id = au.id
    left join user_state s on s.user_id = au.id
  ), f as (
    select *,
      coalesce(source like 'stripe:%', false) as paid,
      coalesce(source like 'code:%', false) as by_code,
      (plan is not null and (expires_at is null or expires_at > now())) as has_access,
      case when jsonb_typeof(data -> 'weeks') = 'object' then
        (select count(*) from jsonb_each(data -> 'weeks') w where jsonb_typeof(w.value -> 'portions') = 'object' and w.value -> 'portions' <> '{}'::jsonb)
      else 0 end as weeks_planned,
      case when jsonb_typeof(data -> 'spendLog') = 'object' then (select count(*) from jsonb_object_keys(data -> 'spendLog')) else 0 end as shops_done,
      coalesce(data -> 'meta' ->> 'standalone', 'false') = 'true' as on_home_screen,
      data -> 'meta' ->> 'device' as device,
      nullif(data -> 'meta' ->> 'lastOpen', '')::timestamptz as last_open,
      data -> 'settings' ->> 'goal' as goal
    from u
  ), days as (
    select generate_series((now() at time zone tz)::date - 29, (now() at time zone tz)::date, interval '1 day')::date as day
  )
  select json_build_object(
    'generated_at', now(),
    'users', json_build_object(
      'total', (select count(*) from f),
      'last_24h', (select count(*) from f where created_at > now() - interval '24 hours'),
      'last_7d', (select count(*) from f where created_at > now() - interval '7 days'),
      'last_30d', (select count(*) from f where created_at > now() - interval '30 days'),
      'prev_7d', (select count(*) from f where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days')),
    'access', json_build_object(
      'with_access', (select count(*) from f where has_access),
      'paid', (select count(*) from f where paid),
      'paid_7d', (select count(*) from f where paid and access_at > now() - interval '7 days'),
      'paid_prev_7d', (select count(*) from f where paid and access_at > now() - interval '14 days' and access_at <= now() - interval '7 days'),
      'by_code', (select count(*) from f where by_code),
      'other', (select count(*) from f where has_access and not paid and not by_code),
      'signed_up_no_access', (select count(*) from f where not has_access)),
    'activity', json_build_object(
      'active_24h', (select count(*) from f where greatest(active_at, last_open) > now() - interval '24 hours'),
      'active_7d', (select count(*) from f where greatest(active_at, last_open) > now() - interval '7 days'),
      'active_30d', (select count(*) from f where greatest(active_at, last_open) > now() - interval '30 days'),
      'planned_a_week', (select count(*) from f where weeks_planned > 0),
      'planned_2_plus', (select count(*) from f where weeks_planned > 1),
      'finished_a_shop', (select count(*) from f where shops_done > 0),
      'on_home_screen', (select count(*) from f where on_home_screen),
      'iphone', (select count(*) from f where device = 'ios'),
      'android', (select count(*) from f where device = 'android')),
    'goals', (select coalesce(json_object_agg(goal, n), '{}'::json) from (select goal, count(*) n from f where goal is not null group by goal) g),
    'by_day', (select json_agg(json_build_object('day', d.day,
        'signups', (select count(*) from f where (created_at at time zone tz)::date = d.day),
        'paid', (select count(*) from f where paid and (access_at at time zone tz)::date = d.day),
        'active', (select count(*) from f where (greatest(active_at, last_open) at time zone tz)::date = d.day)) order by d.day) from days d),
    'recent', (select coalesce(json_agg(r), '[]'::json) from (
        select email, created_at, last_sign_in_at, greatest(active_at, last_open) as last_active, plan, source, weeks_planned, shops_done, on_home_screen, device
        from f order by created_at desc limit 40) r),
    'codes', (select coalesce(json_agg(json_build_object('code', code, 'plan', plan, 'uses', uses, 'max_uses', max_uses, 'note', note) order by code), '[]'::json) from promo_codes)
  ) into result;
  return result;
end $$;

revoke all on function public.owner_stats() from public, anon;
grant execute on function public.owner_stats() to authenticated;

-- CHANGE THIS to the email you sign in to FU£L with, then run the whole file.
insert into public.app_owners (email) values ('you@example.com') on conflict do nothing;
