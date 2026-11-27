-- Fuel: run this once in Supabase → SQL Editor. Creates the two tables the app uses, locked down per user.
create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null,               -- 'term' | 'year' | 'team' | 'founder'
  expires_at timestamptz,           -- null = never
  source text,                      -- 'manual' | 'lemonsqueezy' | 'stripe'
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
alter table public.entitlements enable row level security;
-- each user can read and write only their own state
create policy "own state read"  on public.user_state for select using (auth.uid() = user_id);
create policy "own state write" on public.user_state for insert with check (auth.uid() = user_id);
create policy "own state update" on public.user_state for update using (auth.uid() = user_id);
-- users can read their entitlement; only the service role (webhook / you in the dashboard) can write it
create policy "own entitlement read" on public.entitlements for select using (auth.uid() = user_id);

-- To give someone access by hand (e.g. yourself, or a friend who paid you in cash):
-- insert into public.entitlements (user_id, plan, expires_at, source)
-- select id, 'year', now() + interval '12 months', 'manual' from auth.users where email = 'them@example.com'
-- on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at, source = excluded.source, updated_at = now();

-- ---------- promo codes (added 9 Sep 2026) ----------
-- A code grants a plan to whoever redeems it. Redeemed through the redeem_code() function only; the table itself is not readable by users.
create table if not exists public.promo_codes (
  code text primary key,
  plan text not null default 'year',     -- 'founder' (never expires) | 'year' | 'term'
  months int,                             -- null = never expires
  max_uses int not null default 1,
  uses int not null default 0,
  expires_at timestamptz,                 -- code stops working after this (null = no end)
  note text
);
alter table public.promo_codes enable row level security;  -- no policies: only the function below can touch it

create or replace function public.redeem_code(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare c promo_codes%rowtype; uid uuid := auth.uid(); exp timestamptz;
begin
  if uid is null then return json_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into c from promo_codes where upper(code) = upper(trim(p_code)) for update;
  if not found then return json_build_object('ok', false, 'error', 'That code isn''t valid.'); end if;
  if c.expires_at is not null and c.expires_at < now() then return json_build_object('ok', false, 'error', 'That code has expired.'); end if;
  if c.uses >= c.max_uses then return json_build_object('ok', false, 'error', 'That code has been used up.'); end if;
  exp := case when c.months is null then null else now() + (c.months || ' months')::interval end;
  insert into entitlements (user_id, plan, expires_at, source, updated_at) values (uid, c.plan, exp, 'code:' || c.code, now())
    on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at, source = excluded.source, updated_at = now();
  update promo_codes set uses = uses + 1 where code = c.code;
  return json_build_object('ok', true, 'plan', c.plan, 'expires_at', exp);
end $$;
grant execute on function public.redeem_code(text) to authenticated;

-- Seed codes. EXAMPLES ONLY: this repo is public, so the codes that were really seeded on the live project are not written here
-- (they exist only in the live database: Supabase → Table editor → promo_codes). Never commit a real code. Change these before running.
insert into public.promo_codes (code, plan, months, max_uses, note) values
  ('EXAMPLE-FOUNDER', 'founder', null, 1, 'example: the owner'),
  ('EXAMPLE-MATES', 'year', 12, 25, 'example: friends, one year each')
on conflict (code) do nothing;
