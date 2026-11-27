-- FU£L growth (3 Oct 2026): step counting, "bring 3 mates" codes, and creator (affiliate) codes with commission.
-- Run this ONCE in Supabase → SQL Editor → New query → paste → Run. Safe to run again: it only adds and replaces its own parts.
-- Needs supabase/schema.sql and supabase/owner-dashboard.sql to have been run first (they were, in September).
--
-- What it adds (nothing here holds a name, email or anything else about the person using the app):
--   events        one row per device per step (visited the site, opened the app, started set-up, planned a week, made an account, paid,
--                 put it on the home screen, shared their week), with where they came from (?r=tt) and the code they came with (?c=CODE).
--                 The device is a random id made on the phone. Written only through track().
--   ref_codes     codes that go in links: "mate" codes (each user's own, for the free-for-life unlock) and "creator" codes (affiliates).
--   referrals     which code and source each ACCOUNT came with (first one wins), so a sale can be credited.
--   commissions   one row per sale through a creator's code: pending for 14 days (the refund window), then payable, then paid.
-- No table can be read or written from the app or the web: every read and write goes through the functions below.

-- ===================================================================== tables
create table if not exists public.events (
  id bigserial primary key,
  at timestamptz not null default now(),
  anon text not null,   -- random id made on the device (not linked to a person)
  step text not null,   -- visit | open | setup | planned | account | paid | home | shared
  src text,             -- ?r= tag: tt, ig, rugby, poster…
  code text,            -- ?c= code: a mate's or a creator's
  unique (anon, step)
);
create index if not exists events_code_idx on public.events (code);
create index if not exists events_at_idx on public.events (at);

create table if not exists public.ref_codes (
  code text primary key check (code ~ '^[A-Z0-9]{3,20}$'),
  kind text not null check (kind in ('mate', 'creator')),
  name text,                -- creator's name (creators only)
  handle text,              -- creator's @handle
  email text,               -- creator's contact, for paying them (only the owner sees it)
  owner_anon text,          -- mate codes: the device that made it
  owner_user uuid references auth.users (id) on delete set null,  -- the account it belongs to, once known
  secret text not null default replace(gen_random_uuid()::text, '-', ''),  -- proves ownership: in the creator's dashboard link and on the mate's phone
  commission_pence int not null default 0 check (commission_pence between 0 and 499),
  promo_code text,          -- the creator's free lifetime-access code (in promo_codes)
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists ref_codes_owner_anon_idx on public.ref_codes (owner_anon) where kind = 'mate';

create table if not exists public.referrals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text references public.ref_codes (code) on delete set null,
  src text,
  anon text,
  at timestamptz not null default now()
);

create table if not exists public.commissions (
  id bigserial primary key,
  code text not null references public.ref_codes (code),
  user_id uuid references auth.users (id) on delete set null,
  stripe_session text unique,
  payment_intent text,
  amount_pence int,
  commission_pence int not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'void')),
  at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists commissions_code_idx on public.commissions (code);

alter table public.events enable row level security;
alter table public.ref_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.commissions enable row level security;
-- (no policies on purpose: only the functions below, which run with elevated rights, touch these tables)

-- ===================================================================== helpers
create or replace function public.fuel_is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_owners where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.fuel_is_owner() from public, anon, authenticated;

-- planned weeks made with a code, by devices other than the code's own
create or replace function public.fuel_mates_planned(p_code text) returns int language sql stable security definer set search_path = public as $$
  select count(distinct e.anon)::int from events e join ref_codes r on r.code = e.code
  where e.code = p_code and e.step = 'planned' and e.anon is distinct from r.owner_anon;
$$;
revoke all on function public.fuel_mates_planned(text) from public, anon, authenticated;

-- ===================================================================== step counting (anyone)
create or replace function public.track(p_anon text, p_step text, p_src text default null, p_code text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c text := upper(nullif(left(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'), 20), ''));
begin
  if coalesce(p_anon, '') !~ '^[a-z0-9-]{8,40}$' then return; end if;
  if p_step not in ('visit', 'open', 'setup', 'planned', 'account', 'paid', 'home', 'shared') then return; end if;
  if c is not null and not exists (select 1 from ref_codes where code = c) then c := null; end if;  -- only real codes are kept
  insert into events (anon, step, src, code)
    values (p_anon, p_step, nullif(left(lower(regexp_replace(coalesce(p_src, ''), '[^A-Za-z0-9_-]', '', 'g')), 24), ''), c)
    on conflict (anon, step) do nothing;
end $$;
revoke all on function public.track(text, text, text, text) from public;
grant execute on function public.track(text, text, text, text) to anon, authenticated;

-- ===================================================================== bring 3 mates
-- A device asks for its own code (one per device; asking again returns the same one). The secret stays on that phone.
create or replace function public.make_mate_code(p_anon text) returns json language plpgsql security definer set search_path = public as $$
declare r ref_codes%rowtype; c text; letters text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i int; tries int := 0;
begin
  if coalesce(p_anon, '') !~ '^[a-z0-9-]{8,40}$' then return json_build_object('ok', false); end if;
  select * into r from ref_codes where kind = 'mate' and owner_anon = p_anon;
  if found then return json_build_object('ok', true, 'code', r.code, 'secret', r.secret); end if;
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

create or replace function public.mate_status(p_code text, p_secret text) returns json language plpgsql stable security definer set search_path = public as $$
declare r ref_codes%rowtype; n int;
begin
  select * into r from ref_codes where code = upper(p_code) and kind = 'mate' and secret = p_secret;
  if not found then return json_build_object('ok', false); end if;
  n := fuel_mates_planned(r.code);
  return json_build_object('ok', true, 'code', r.code, 'planned', n, 'needed', 3, 'unlocked', n >= 3);
end $$;
revoke all on function public.mate_status(text, text) from public;
grant execute on function public.mate_status(text, text) to anon, authenticated;

-- Signed in with 3 mates done: free for life on the account (never replaces a paid or founder entitlement).
create or replace function public.claim_mates(p_code text, p_secret text) returns json language plpgsql security definer set search_path = public as $$
declare r ref_codes%rowtype; uid uuid := auth.uid(); n int; cur entitlements%rowtype;
begin
  if uid is null then return json_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into r from ref_codes where code = upper(p_code) and kind = 'mate' and secret = p_secret;
  if not found then return json_build_object('ok', false, 'error', 'That code isn''t yours.'); end if;
  n := fuel_mates_planned(r.code);
  if n < 3 then return json_build_object('ok', false, 'error', 'Not yet: ' || n || ' of 3 mates have planned a week.', 'planned', n); end if;
  update ref_codes set owner_user = uid where code = r.code;
  select * into cur from entitlements where user_id = uid;
  if found and (cur.expires_at is null or cur.expires_at > now()) and cur.plan in ('lifetime', 'founder', 'mates') then
    return json_build_object('ok', true, 'plan', cur.plan, 'already', true);
  end if;
  insert into entitlements (user_id, plan, expires_at, source, updated_at) values (uid, 'mates', null, 'mates:' || r.code, now())
    on conflict (user_id) do update set plan = excluded.plan, expires_at = null, source = excluded.source, updated_at = now();
  return json_build_object('ok', true, 'plan', 'mates');
end $$;
revoke all on function public.claim_mates(text, text) from public;
grant execute on function public.claim_mates(text, text) to authenticated;

-- ===================================================================== which code an account came with
-- Called by the app right after sign-in. First call wins. Your own code never counts.
create or replace function public.set_referral(p_code text, p_src text, p_anon text) returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text := upper(nullif(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'), '')); r ref_codes%rowtype; a text := p_anon;
begin
  if uid is null then return json_build_object('ok', false); end if;
  if coalesce(a, '') !~ '^[a-z0-9-]{8,40}$' then a := null; end if;
  if c is not null then
    select * into r from ref_codes where code = c and active;
    if not found or r.owner_user = uid or (a is not null and r.owner_anon = a) then c := null; end if;
  end if;
  insert into referrals (user_id, code, src, anon) values (uid, c, nullif(left(lower(regexp_replace(coalesce(p_src, ''), '[^A-Za-z0-9_-]', '', 'g')), 24), ''), a)
    on conflict (user_id) do nothing;
  if a is not null then
    insert into events (anon, step, src, code) values (a, 'account', nullif(left(lower(coalesce(p_src, '')), 24), ''), c) on conflict (anon, step) do nothing;
    update ref_codes set owner_user = uid where kind = 'mate' and owner_anon = a and owner_user is null;
  end if;
  return json_build_object('ok', true, 'code', (select code from referrals where user_id = uid));
end $$;
revoke all on function public.set_referral(text, text, text) from public;
grant execute on function public.set_referral(text, text, text) to authenticated;

-- ===================================================================== sales (called by the Stripe webhook only)
create or replace function public.record_purchase(p_user uuid, p_session text, p_intent text, p_amount int) returns json language plpgsql security definer set search_path = public as $$
declare f referrals%rowtype; r ref_codes%rowtype; made boolean := false;
begin
  select * into f from referrals where user_id = p_user;
  if found and f.anon is not null then
    insert into events (anon, step, src, code) values (f.anon, 'paid', f.src, f.code) on conflict (anon, step) do nothing;
  end if;
  if found and f.code is not null then
    select * into r from ref_codes where code = f.code;
    if found and r.kind = 'creator' and r.active and r.commission_pence > 0 and r.owner_user is distinct from p_user then
      insert into commissions (code, user_id, stripe_session, payment_intent, amount_pence, commission_pence)
        values (r.code, p_user, p_session, p_intent, p_amount, r.commission_pence) on conflict (stripe_session) do nothing;
      made := true;
    end if;
  end if;
  return json_build_object('ok', true, 'code', f.code, 'commission', made);
end $$;
revoke all on function public.record_purchase(uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.record_purchase(uuid, text, text, int) to service_role;

-- A refund cancels a commission that hasn't been paid out yet.
create or replace function public.void_purchase(p_intent text) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update commissions set status = 'void' where payment_intent = p_intent and status = 'pending';
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.void_purchase(text) from public, anon, authenticated;
grant execute on function public.void_purchase(text) to service_role;

-- ===================================================================== the creator's own dashboard (partner.html#CODE.SECRET)
create or replace function public.partner_stats(p_code text, p_secret text) returns json language plpgsql stable security definer set search_path = public as $$
declare r ref_codes%rowtype; hold interval := interval '14 days';
begin
  select * into r from ref_codes where code = upper(p_code) and kind = 'creator' and secret = p_secret;
  if not found then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'code', r.code, 'name', r.name, 'handle', r.handle, 'active', r.active, 'commission_pence', r.commission_pence, 'promo_code', r.promo_code,
    'steps', (select coalesce(json_object_agg(step, n), '{}'::json) from (select step, count(*) n from events where code = r.code group by step) s),
    'reached', (select count(distinct anon) from events where code = r.code and step in ('visit', 'open')),
    'by_day', (select coalesce(json_agg(json_build_object('day', d, 'visits', v, 'planned', p, 'sales', s) order by d), '[]'::json) from (
        select g::date d,
          (select count(distinct e.anon) from events e where e.code = r.code and e.step in ('visit', 'open') and (e.at at time zone 'Europe/London')::date = g::date) v,
          (select count(*) from events e where e.code = r.code and e.step = 'planned' and (e.at at time zone 'Europe/London')::date = g::date) p,
          (select count(*) from commissions c where c.code = r.code and c.status <> 'void' and (c.at at time zone 'Europe/London')::date = g::date) s
        from generate_series((now() at time zone 'Europe/London')::date - 29, (now() at time zone 'Europe/London')::date, interval '1 day') g) x),
    'sales', (select count(*) from commissions where code = r.code and status <> 'void'),
    'refunded', (select count(*) from commissions where code = r.code and status = 'void'),
    'earned_pence', (select coalesce(sum(commission_pence), 0) from commissions where code = r.code and status <> 'void'),
    'on_hold_pence', (select coalesce(sum(commission_pence), 0) from commissions where code = r.code and status = 'pending' and at > now() - hold),
    'payable_pence', (select coalesce(sum(commission_pence), 0) from commissions where code = r.code and status = 'pending' and at <= now() - hold),
    'paid_pence', (select coalesce(sum(commission_pence), 0) from commissions where code = r.code and status = 'paid'),
    'recent', (select coalesce(json_agg(json_build_object('at', at, 'status', status, 'pence', commission_pence, 'payable', status = 'pending' and at <= now() - hold) order by at desc), '[]'::json)
               from (select * from commissions where code = r.code order by at desc limit 30) c));
end $$;
revoke all on function public.partner_stats(text, text) from public;
grant execute on function public.partner_stats(text, text) to anon, authenticated;

-- ===================================================================== the owner's side (owner.html)
-- The whole journey, by where people came from, over the last p_days days.
create or replace function public.owner_growth(p_days int default 30) returns json language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365))); tz text := 'Europe/London'; hold interval := interval '14 days';
begin
  if not fuel_is_owner() then raise exception 'not allowed'; end if;
  return json_build_object(
    'days', p_days,
    'steps', (select coalesce(json_object_agg(step, n), '{}'::json) from (select step, count(*) n from events where at > since group by step) s),
    'by_source', (select coalesce(json_agg(x order by x.visits + x.opened desc), '[]'::json) from (
        select coalesce(nullif(src, ''), case when code is not null then 'code' else 'direct' end) as source,
          count(*) filter (where step = 'visit') visits, count(*) filter (where step = 'open') opened, count(*) filter (where step = 'setup') setup,
          count(*) filter (where step = 'planned') planned, count(*) filter (where step = 'account') accounts, count(*) filter (where step = 'paid') paid,
          count(*) filter (where step = 'home') home, count(*) filter (where step = 'shared') shared
        from events where at > since group by 1) x),
    'by_day', (select json_agg(json_build_object('day', g::date,
        'visits', (select count(*) from events e where e.step = 'visit' and (e.at at time zone tz)::date = g::date),
        'opened', (select count(*) from events e where e.step = 'open' and (e.at at time zone tz)::date = g::date),
        'planned', (select count(*) from events e where e.step = 'planned' and (e.at at time zone tz)::date = g::date)) order by g)
      from generate_series((now() at time zone tz)::date - 29, (now() at time zone tz)::date, interval '1 day') g),
    'planned_ever', (select count(*) from events where step = 'planned'),
    'creators', (select coalesce(json_agg(c order by c.sales desc, c.created_at), '[]'::json) from (
        select r.code, r.name, r.handle, r.email, r.active, r.commission_pence, r.promo_code, r.note, r.created_at, r.secret,
          (select count(distinct e.anon) from events e where e.code = r.code and e.step in ('visit', 'open')) visits,
          (select count(*) from events e where e.code = r.code and e.step = 'planned') planned,
          (select count(*) from referrals f where f.code = r.code) accounts,
          (select count(*) from commissions m where m.code = r.code and m.status <> 'void') sales,
          (select coalesce(sum(commission_pence), 0) from commissions m where m.code = r.code and m.status = 'pending' and m.at > now() - hold) on_hold_pence,
          (select coalesce(sum(commission_pence), 0) from commissions m where m.code = r.code and m.status = 'pending' and m.at <= now() - hold) payable_pence,
          (select coalesce(sum(commission_pence), 0) from commissions m where m.code = r.code and m.status = 'paid') paid_pence
        from ref_codes r where r.kind = 'creator') c),
    'mates', json_build_object(
      'codes', (select count(*) from ref_codes where kind = 'mate'),
      'with_a_mate', (select count(*) from ref_codes r where kind = 'mate' and fuel_mates_planned(r.code) > 0),
      'unlocked', (select count(*) from ref_codes r where kind = 'mate' and fuel_mates_planned(r.code) >= 3),
      'claimed', (select count(*) from entitlements where source like 'mates:%'))
  );
end $$;
revoke all on function public.owner_growth(int) from public, anon;
grant execute on function public.owner_growth(int) to authenticated;

-- Add a creator: their code (in their link), their free lifetime-access code, and the secret for their dashboard link.
create or replace function public.owner_add_creator(p_name text, p_handle text, p_email text, p_code text, p_commission_pence int default 100, p_note text default null)
returns json language plpgsql security definer set search_path = public as $$
declare c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); promo text; r ref_codes%rowtype;
begin
  if not fuel_is_owner() then raise exception 'not allowed'; end if;
  if c !~ '^[A-Z0-9]{3,20}$' then return json_build_object('ok', false, 'error', 'The code must be 3 to 20 letters or numbers.'); end if;
  if exists (select 1 from ref_codes where code = c) or exists (select 1 from promo_codes where upper(code) = c) then return json_build_object('ok', false, 'error', 'That code is taken. Try another.'); end if;
  if coalesce(p_commission_pence, -1) not between 0 and 499 then return json_build_object('ok', false, 'error', 'Commission must be between 0p and £4.99.'); end if;
  promo := 'FREE-' || c;
  insert into promo_codes (code, plan, months, max_uses, note) values (promo, 'founder', null, 1, 'creator: ' || coalesce(p_name, c)) on conflict (code) do nothing;
  insert into ref_codes (code, kind, name, handle, email, commission_pence, promo_code, note) values (c, 'creator', nullif(trim(p_name), ''), nullif(trim(p_handle), ''), nullif(trim(p_email), ''), p_commission_pence, promo, p_note)
    returning * into r;
  return json_build_object('ok', true, 'code', r.code, 'secret', r.secret, 'promo', promo);
end $$;
revoke all on function public.owner_add_creator(text, text, text, text, int, text) from public, anon;
grant execute on function public.owner_add_creator(text, text, text, text, int, text) to authenticated;

create or replace function public.owner_update_creator(p_code text, p_active boolean, p_commission_pence int, p_note text default null)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not fuel_is_owner() then raise exception 'not allowed'; end if;
  if coalesce(p_commission_pence, -1) not between 0 and 499 then return json_build_object('ok', false, 'error', 'Commission must be between 0p and £4.99.'); end if;
  update ref_codes set active = p_active, commission_pence = p_commission_pence, note = coalesce(p_note, note) where code = upper(p_code) and kind = 'creator';
  return json_build_object('ok', found);
end $$;
revoke all on function public.owner_update_creator(text, boolean, int, text) from public, anon;
grant execute on function public.owner_update_creator(text, boolean, int, text) to authenticated;

-- After you've sent a creator their money: marks everything that was payable (past the 14-day refund window) as paid.
create or replace function public.owner_mark_paid(p_code text) returns json language plpgsql security definer set search_path = public as $$
declare n int; total int;
begin
  if not fuel_is_owner() then raise exception 'not allowed'; end if;
  with u as (update commissions set status = 'paid', paid_at = now() where code = upper(p_code) and status = 'pending' and at <= now() - interval '14 days' returning commission_pence)
  select count(*), coalesce(sum(commission_pence), 0) into n, total from u;
  return json_build_object('ok', true, 'sales', n, 'pence', total);
end $$;
revoke all on function public.owner_mark_paid(text) from public, anon;
grant execute on function public.owner_mark_paid(text) to authenticated;

-- Tell the API about the new functions straight away.
notify pgrst, 'reload schema';
