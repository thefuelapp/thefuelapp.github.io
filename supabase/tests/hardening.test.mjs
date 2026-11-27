// Tests supabase/hardening.sql on a real Postgres (PGlite, in Node) with stand-ins for Supabase's auth schema and roles.
// Run:  mkdir -p /tmp/pg && (cd /tmp/pg && npm i @electric-sql/pglite@0.3) && PGLITE=/tmp/pg/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/hardening.test.mjs
const { PGlite } = await import(process.env.PGLITE || '@electric-sql/pglite');
import fs from 'fs';
const R = new URL('../', import.meta.url).pathname;
const db = new PGlite();
const q = async (sql, params) => { try { return (await db.query(sql, params)).rows; } catch (e) { throw new Error(e.message + '\n  in: ' + sql.slice(0, 140)); } };
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('t.jwt', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`);
for (const f of ['schema.sql', 'owner-dashboard.sql', 'growth.sql', 'growth-2.sql']) await db.exec(fs.readFileSync(R + f, 'utf8'));
const CAM = '11111111-1111-1111-1111-111111111111', BUYER = '22222222-2222-2222-2222-222222222222', OTHER = '33333333-3333-3333-3333-333333333333';
await db.exec(`insert into auth.users (id, email) values ('${CAM}', 'cam@example.com'), ('${BUYER}', 'buyer@example.com'), ('${OTHER}', 'other@example.com');
  insert into app_owners (email) values ('cam@example.com') on conflict do nothing;
  grant select, insert, update on public.user_state to authenticated; grant select on public.entitlements to authenticated;`);
// the placeholder owner row is there from owner-dashboard.sql: an email nobody has registered
const before = await q(`select email from app_owners order by 1`);
for (let i = 0; i < 2; i++) await db.exec(fs.readFileSync(R + 'hardening.sql', 'utf8')); // twice: it must be safe to run again
const as = async (role, uid, email) => { await db.exec(`reset role; select set_config('t.uid', '${uid || ''}', false), set_config('t.jwt', '${email ? JSON.stringify({ email }) : ''}', false); set role ${role};`); };
const one = async (sql, p) => (await q(sql, p))[0];
let ok = 0, bad = 0; const expect = (name, cond, got) => { if (cond) ok++; else { bad++; console.log('FAIL', name, JSON.stringify(got)); } };

await db.exec('reset role');
const owners = await q(`select email, user_id from app_owners order by 1`);
expect('placeholder owner was there before', before.some((r) => r.email === 'you@example.com'), before);
expect('unregistered owner emails are removed', owners.length === 1 && owners[0].email === 'cam@example.com', owners);
expect('owner is tied to the account id', owners[0]?.user_id === CAM, owners);

// someone signs up as the placeholder email afterwards: not an owner
await db.exec(`insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'you@example.com')`);
await as('authenticated', '44444444-4444-4444-4444-444444444444', 'you@example.com');
let denied = false; try { await q(`select owner_growth(30)`); } catch { denied = true; } expect('a squatter on the placeholder email is not an owner', denied);
let denied2 = false; try { await q(`select owner_stats()`); } catch { denied2 = true; } expect('and cannot read owner_stats', denied2);
// a different account claiming the owner email in its token: not an owner (the id must match too)
await as('authenticated', OTHER, 'cam@example.com');
let denied3 = false; try { await q(`select owner_growth(30)`); } catch { denied3 = true; } expect('the owner email on another account id is refused', denied3);
await as('authenticated', CAM, 'cam@example.com');
const g = await one(`select owner_growth(30) as j`); expect('the real owner still gets in', !!g?.j?.steps, g);
const cr = (await one(`select owner_add_creator('Jo Bloggs', '@jo', 'jo@example.com', 'JO10', 100, null) as j`)).j;
expect('creator added', cr.ok === true, cr); expect('promo code has a random part', /^FREE-JO10-[A-Z0-9]{6}$/.test(cr.promo), cr);

// installed probe, open to everyone
await as('anon'); expect('fuel_hardening answers', (await one(`select fuel_hardening() as j`)).j.ok === true);
let anonDel = false; try { await q(`select delete_my_account()`); } catch { anonDel = true; } expect('anon cannot call delete_my_account', anonDel);

// promo codes: 8 wrong tries an hour, then locked even for a right code
await as('authenticated', BUYER, 'buyer@example.com');
let last; for (let i = 0; i < 8; i++) last = (await one(`select redeem_code('NOPE${i}') as j`)).j;
expect('wrong code is refused', last.ok === false && /valid/.test(last.error), last);
const locked = (await one(`select redeem_code('EXAMPLE-MATES') as j`)).j; expect('ninth try is locked out', locked.ok === false && /Too many/.test(locked.error), locked);
await as('authenticated', OTHER, 'other@example.com');
const good = (await one(`select redeem_code('example-mates') as j`)).j; expect('another account can still redeem', good.ok === true && good.plan === 'year', good);
const ent = await q(`select plan from entitlements`); expect('they see only their own entitlement', ent.length === 1 && ent[0].plan === 'year', ent);

// saved plan: own row only, and a size limit
await q(`insert into user_state (user_id, data) values ('${OTHER}', '{"weeks":{}}')`);
let big = false; try { await q(`update user_state set data = jsonb_build_object('x', repeat('a', 2100000)) where user_id = '${OTHER}'`); } catch { big = true; } expect('a 2 MB+ plan is refused', big);
let foreign = false; try { await q(`insert into user_state (user_id, data) values ('${BUYER}', '{}')`); } catch { foreign = true; } expect('cannot write another account\'s plan', foreign);
await as('authenticated', BUYER, 'buyer@example.com');
expect('cannot read another account\'s plan', (await q(`select * from user_state`)).length === 0);
const upd = await q(`update user_state set data = '{"hacked":true}' where user_id = '${OTHER}' returning user_id`); expect('cannot change another account\'s plan', upd.length === 0, upd);

// counters still work, and mate codes still come back the same
await as('anon');
await q(`select track('device-aaaa-0001', 'open', 'tt', null)`); const m1 = (await one(`select make_mate_code('device-aaaa-0001') as j`)).j; const m2 = (await one(`select make_mate_code('device-aaaa-0001') as j`)).j;
expect('mate code made once', m1.ok && m1.code === m2.code, [m1, m2]);
await db.exec('reset role'); expect('event written', (await q(`select 1 from events where anon = 'device-aaaa-0001'`)).length === 1);
// the ceiling: 400 rows in a minute, then nothing more is written
await db.exec(`insert into events (anon, step) select 'flood-' || lpad(g::text, 8, '0'), 'visit' from generate_series(1, 400) g`);
await as('anon'); await q(`select track('device-bbbb-0002', 'open', null, null)`);
await db.exec('reset role'); expect('past the ceiling nothing is written', (await q(`select 1 from events where anon = 'device-bbbb-0002'`)).length === 0);

// delete my account: everything of theirs goes, nobody else's
await as('authenticated', OTHER, 'other@example.com');
const del = (await one(`select delete_my_account() as j`)).j; expect('delete_my_account ok', del.ok === true, del);
await db.exec('reset role');
expect('account gone', (await q(`select 1 from auth.users where id = '${OTHER}'`)).length === 0);
expect('their plan gone', (await q(`select 1 from user_state where user_id = '${OTHER}'`)).length === 0);
expect('their access gone', (await q(`select 1 from entitlements where user_id = '${OTHER}'`)).length === 0);
expect('other accounts untouched', (await q(`select 1 from auth.users`)).length === 3);
// an owner who deletes their account stops being an owner
await as('authenticated', CAM, 'cam@example.com'); await q(`select delete_my_account()`);
await db.exec('reset role'); expect('owner row removed with the owner account', (await q(`select 1 from app_owners`)).length === 0);

console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
