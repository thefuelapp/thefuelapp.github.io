-- FU£L hardening (v102, 26 Nov 2026). Run ONCE in Supabase → SQL Editor (tools/hardening-setup.sh puts it on the clipboard and checks it went in).
-- Safe to run again: it only adds and replaces its own parts. Needs schema.sql, owner-dashboard.sql, growth.sql and growth-2.sql first.
--
-- What it does:
--   1. People can delete their own account, and everything saved to it, from inside the app (delete_my_account).
--   2. The saved plan has a size limit, so nobody can park megabytes in an account.
--   3. Guessing promo codes is slowed to a crawl (8 wrong tries an hour per account).
--   4. The step counter and the mate codes have a ceiling, so a script cannot flood the tables.
--   5. Owner pages: only an owner email that really has an account counts, the check is tied to that account's id as well as its email,
--      and a leftover or never-registered owner email (which anyone could sign up as, because sign-up does not confirm emails) is removed.
--   6. New creators get a free-access code that cannot be guessed from their public link code.
--   7. fuel_hardening() lets the app ask "is this installed?" before it shows Delete my account.

-- ===================================================================== 1. delete my account
create or replace function public.delete_my_account() returns json language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); em text;
begin
  if uid is null then return json_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select lower(email) into em from auth.users where id = uid;
  delete from app_owners where lower(email) = em;                 -- an owner who leaves is no longer an owner (the email could be registered again by anyone)
  update ref_codes set active = false where owner_user = uid and kind = 'mate';
  delete from auth.users where id = uid;                          -- user_state, entitlements and referrals go with it (on delete cascade)
  return json_build_object('ok', true);
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ===================================================================== 2. size limit on the saved plan, and the update rule spelled out
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_state_size') then
    alter table public.user_state add constraint user_state_size check (octet_length(data::text) <= 2000000) not valid;  -- about 2 MB; a year of weeks is well under 300 KB
  end if;
end $$;
drop policy if exists "own state update" on public.user_state;
create policy "own state update" on public.user_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===================================================================== 3. promo codes: slow down guessing
create table if not exists public.code_attempts (
  id bigserial primary key,
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists code_attempts_user_idx on public.code_attempts (user_id, at);
alter table public.code_attempts enable row level security;   -- no policies: only redeem_code() touches it

create or replace function public.redeem_code(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare c promo_codes%rowtype; uid uuid := auth.uid(); exp timestamptz; tries int;
begin
  if uid is null then return json_build_object('ok', false, 'error', 'Sign in first.'); end if;
  delete from code_attempts where at < now() - interval '1 day';
  select count(*) into tries from code_attempts where user_id = uid and at > now() - interval '1 hour';
  if tries >= 8 then return json_build_object('ok', false, 'error', 'Too many tries. Wait an hour and try again.'); end if;
  if length(coalesce(p_code, '')) > 60 then return json_build_object('ok', false, 'error', 'That code isn''t valid.'); end if;
  select * into c from promo_codes where upper(code) = upper(trim(p_code)) for update;
  if not found then insert into code_attempts (user_id) values (uid); return json_build_object('ok', false, 'error', 'That code isn''t valid.'); end if;
  if c.expires_at is not null and c.expires_at < now() then insert into code_attempts (user_id) values (uid); return json_build_object('ok', false, 'error', 'That code has expired.'); end if;
  if c.uses >= c.max_uses then insert into code_attempts (user_id) values (uid); return json_build_object('ok', false, 'error', 'That code has been used up.'); end if;
  exp := case when c.months is null then null else now() + (c.months || ' months')::interval end;
  insert into entitlements (user_id, plan, expires_at, source, updated_at) values (uid, c.plan, exp, 'code:' || c.code, now())
    on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at, source = excluded.source, updated_at = now();
  update promo_codes set uses = uses + 1 where code = c.code;
  return json_build_object('ok', true, 'plan', c.plan, 'expires_at', exp);
end $$;
revoke all on function public.redeem_code(text) from public, anon;
grant execute on function public.redeem_code(text) to authenticated;

-- ===================================================================== 4. a ceiling on the anonymous counters
-- Real use is a handful of rows per phone. Past these numbers it is a script, and the extra rows are simply not written.
create or replace function public.track(p_anon text, p_step text, p_src text default null, p_code text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c text := upper(nullif(left(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'), 20), ''));
begin
  if coalesce(p_anon, '') !~ '^[a-z0-9-]{8,40}$' then return; end if;
  if p_step not in ('visit', 'open', 'setup', 'planned', 'account', 'paid', 'home', 'shared') then return; end if;
  if (select count(*) from events where at > now() - interval '1 minute') >= 400 then return; end if;
  if (select count(*) from events where at > now() - interval '1 day') >= 40000 then return; end if;
  if c is not null and not exists (select 1 from ref_codes where code = c) then c := null; end if;  -- only real codes are kept
  insert into events (anon, step, src, code)
    values (p_anon, p_step, nullif(left(lower(regexp_replace(coalesce(p_src, ''), '[^A-Za-z0-9_-]', '', 'g')), 24), ''), c)
    on conflict (anon, step) do nothing;
end $$;
revoke all on function public.track(text, text, text, text) from public;
grant execute on function public.track(text, text, text, text) to anon, authenticated;

create or replace function public.make_mate_code(p_anon text) returns json language plpgsql security definer set search_path = public as $$
declare r ref_codes%rowtype; c text; letters text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i int; tries int := 0;
begin
  if coalesce(p_anon, '') !~ '^[a-z0-9-]{8,40}$' then return json_build_object('ok', false); end if;
  select * into r from ref_codes where kind = 'mate' and owner_anon = p_anon;
  if found then return json_build_object('ok', true, 'code', r.code, 'secret', r.secret); end if;
  if (select count(*) from ref_codes where kind = 'mate' and created_at > now() - interval '1 minute') >= 60 then return json_build_object('ok', false); end if;
  if (select count(*) from ref_codes where kind = 'mate' and created_at > now() - interval '1 day') >= 5000 then return json_build_object('ok', false); end if;
  loop
    c := ''; for i in 1..6 loop c := c || substr(letters, 1 + floor(random() * length(letters))::int, 1); end loop;
    exit when not exists (select 1 from ref_codes where code = c);
    tries := tries + 1; if tries > 20 then return json_build_object('ok', false); end if;
  end loop;
  insert into ref_codes (code, kind, owner_anon, owner_user) values (c, 'mate', p_anon, auth.uid()) returning * into r;
  return json_build_object('ok', true, 'code', r.code, 'secret', r.secret);
end $$;
revoke all on function public.make_mate_code(text) from public;
grant execute on function public.make_mate_code(text) to anon, authenticated;

-- ===================================================================== 5. owner pages
-- Sign-up does not confirm emails, so an owner email with no account behind it could be registered by anyone. Remove any such row
-- (this includes the "you@example.com" placeholder if it was ever run in), then tie each owner to the account that holds the email today.
delete from public.app_owners o where not exists (select 1 from auth.users u where lower(u.email) = lower(o.email));
alter table public.app_owners add column if not exists user_id uuid;
update public.app_owners o set user_id = u.id from auth.users u where lower(u.email) = lower(o.email) and o.user_id is null;

create or replace function public.fuel_is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_owners where user_id = auth.uid() and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.fuel_is_owner() from public, anon, authenticated;

-- ===================================================================== 6. creators: a free-access code that cannot be guessed
create or replace function public.owner_add_creator(p_name text, p_handle text, p_email text, p_code text, p_commission_pence int default 100, p_note text default null)
returns json language plpgsql security definer set search_path = public as $$
declare c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); promo text; r ref_codes%rowtype;
begin
  if not fuel_is_owner() then raise exception 'not allowed'; end if;
  if c !~ '^[A-Z0-9]{3,20}$' then return json_build_object('ok', false, 'error', 'The code must be 3 to 20 letters or numbers.'); end if;
  if exists (select 1 from ref_codes where code = c) or exists (select 1 from promo_codes where upper(code) = c) then return json_build_object('ok', false, 'error', 'That code is taken. Try another.'); end if;
  if coalesce(p_commission_pence, -1) not between 0 and 499 then return json_build_object('ok', false, 'error', 'Commission must be between 0p and £4.99.'); end if;
  promo := 'FREE-' || c || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));   -- their link code is public; this part is not
  insert into promo_codes (code, plan, months, max_uses, note) values (promo, 'founder', null, 1, 'creator: ' || left(coalesce(p_name, c), 80)) on conflict (code) do nothing;
  insert into ref_codes (code, kind, name, handle, email, commission_pence, promo_code, note)
    values (c, 'creator', nullif(left(trim(p_name), 80), ''), nullif(left(trim(p_handle), 80), ''), nullif(left(trim(p_email), 254), ''), p_commission_pence, promo, left(p_note, 500))
    returning * into r;
  return json_build_object('ok', true, 'code', r.code, 'secret', r.secret, 'promo', promo);
end $$;
revoke all on function public.owner_add_creator(text, text, text, text, int, text) from public, anon;
grant execute on function public.owner_add_creator(text, text, text, text, int, text) to authenticated;

-- ===================================================================== 7. "is this installed?"
create or replace function public.fuel_hardening() returns json language sql stable as $$ select json_build_object('ok', true, 'v', 1); $$;
revoke all on function public.fuel_hardening() from public;
grant execute on function public.fuel_hardening() to anon, authenticated;

notify pgrst, 'reload schema';
