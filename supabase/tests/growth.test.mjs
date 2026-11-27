// Tests supabase/growth.sql on a real Postgres (PGlite, in Node) with stand-ins for Supabase's auth schema and roles.
// Run:  mkdir -p /tmp/pg && (cd /tmp/pg && npm i @electric-sql/pglite@0.3) && NODE_PATH=/tmp/pg/node_modules node supabase/tests/growth.test.mjs
// (or copy it into /tmp/pg and run it there). Expect: '39 passed, 0 failed'.
const { PGlite } = await import(process.env.PGLITE || '@electric-sql/pglite');
import fs from 'fs';
const R = new URL('../', import.meta.url).pathname;
const db = new PGlite();
const q = async (sql, params) => { try { return (await db.query(sql, params)).rows; } catch (e) { throw new Error(e.message + '\n  in: ' + sql.slice(0, 120)); } };
// Supabase stand-ins: roles, auth.users, auth.uid(), auth.jwt() read from a session setting
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('t.jwt', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`);
for (const f of ['schema.sql', 'owner-dashboard.sql', 'growth.sql', 'growth.sql', 'growth-2.sql']) { await db.exec(fs.readFileSync(R + f, 'utf8')); console.log('ran', f); }
const as = async (role, uid, email) => { await db.exec(`reset role; select set_config('t.uid', '${uid || ''}', false), set_config('t.jwt', '${email ? JSON.stringify({ email }) : ''}', false); set role ${role};`); };
const one = async (sql, p) => (await q(sql, p))[0];
let ok = 0, bad = 0; const expect = (name, cond, got) => { if (cond) { ok++; } else { bad++; console.log('FAIL', name, JSON.stringify(got)); } };
await db.exec(`reset role; insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'cam@example.com'), ('22222222-2222-2222-2222-222222222222', 'buyer@example.com'), ('33333333-3333-3333-3333-333333333333', 'jess@example.com'); update app_owners set email = 'cam@example.com';`);
await db.exec(`insert into app_owners values ('cam@example.com') on conflict do nothing; delete from app_owners where email = 'you@example.com';`);

// tables are closed to the app
await as('anon');
for (const t of ['events', 'ref_codes', 'referrals', 'commissions']) { let blocked = false; try { await q(`select * from ${t}`); } catch { blocked = true; } expect('anon cannot read ' + t, blocked); }
let blockedRec = false; try { await q(`select record_purchase('22222222-2222-2222-2222-222222222222', 'cs_x', 'pi_x', 499)`); } catch { blockedRec = true; } expect('anon cannot record a purchase', blockedRec);
let blockedOwner = false; try { await q(`select owner_growth(30)`); } catch { blockedOwner = true; } expect('anon cannot read owner_growth', blockedOwner);

// owner adds a creator
await as('authenticated', '33333333-3333-3333-3333-333333333333', 'jess@example.com');
let notOwner = false; try { await q(`select owner_add_creator('Jess','@jess','j@x.com','JESS',200)`); } catch (e) { notOwner = /not allowed/.test(e.message); } expect('non-owner cannot add creators', notOwner);
await as('authenticated', '11111111-1111-1111-1111-111111111111', 'cam@example.com');
const add = (await one(`select owner_add_creator('Jess Smith','@jesscooks','jess@example.com','jess',200) j`)).j;
{ const ck = (await one(`select code_kind('jess') j`)).j; expect('code_kind: a creator code says creator and first name', ck.ok === true && ck.kind === 'creator' && ck.name === 'Jess', ck);
  const ck2 = (await one(`select code_kind('NOPE') j`)).j; expect('code_kind: unknown code is ok:false', ck2.ok === false, ck2); }
expect('creator added', add.ok && add.code === 'JESS' && add.promo === 'FREE-JESS' && add.secret.length === 32, add);
const dup = (await one(`select owner_add_creator('X','@x','x@x','JESS',200) j`)).j; expect('duplicate code refused', !dup.ok, dup);
const badc = (await one(`select owner_add_creator('X','@x','x@x','A',200) j`)).j; expect('short code refused', !badc.ok, badc);

// visitors through Jess's link
await as('anon');
for (const [anon, steps] of [['dev-aaaa-1111', ['visit', 'open', 'setup', 'planned']], ['dev-bbbb-2222', ['visit', 'open']], ['dev-cccc-3333', ['open', 'setup', 'planned', 'planned']]]) for (const s of steps) await q(`select track($1, $2, 'tt', 'jess')`, [anon, s]);
await q(`select track('dev-dddd-4444', 'visit', 'ig', 'NOPE')`); // unknown code dropped
await q(`select track('BAD ID', 'visit', null, null)`); await q(`select track('dev-eeee-5555', 'hack', null, null)`);
await as('authenticated', '11111111-1111-1111-1111-111111111111', 'cam@example.com');
const g1 = (await one(`select owner_growth(30) j`)).j;
expect('steps counted once per device', g1.steps.visit === 3 && g1.steps.planned === 2 && g1.steps.open === 3 && !g1.steps.hack, g1.steps);
expect('unknown code not stored', g1.by_source.find((x) => x.source === 'ig')?.visits === 1, g1.by_source);

// a visitor makes an account (with Jess's code) and pays
await as('authenticated', '22222222-2222-2222-2222-222222222222', 'buyer@example.com');
const ref = (await one(`select set_referral('JESS', 'tt', 'dev-aaaa-1111') j`)).j; expect('referral saved', ref.ok && ref.code === 'JESS', ref);
const ref2 = (await one(`select set_referral('OTHER', 'ig', 'dev-aaaa-1111') j`)).j; expect('first referral wins', ref2.code === 'JESS', ref2);
await as('service_role');
const p1 = (await one(`select record_purchase('22222222-2222-2222-2222-222222222222', 'cs_1', 'pi_1', 499) j`)).j; expect('commission made', p1.commission === true, p1);
const p1b = (await one(`select record_purchase('22222222-2222-2222-2222-222222222222', 'cs_1', 'pi_1', 499) j`)).j; // webhook retried
await db.exec('reset role'); const nCom = (await one(`select count(*)::int n from commissions`)).n; expect('a retried webhook makes no second commission', nCom === 1, nCom);
const paidEv = (await one(`select count(*)::int n from events where step = 'paid' and anon = 'dev-aaaa-1111'`)).n; expect('paid step counted', paidEv === 1, paidEv);

// creator's dashboard
await as('anon');
const ps = (await one(`select partner_stats('jess', $1) j`, [add.secret])).j;
expect('partner stats', ps.ok && ps.reached === 3 && ps.sales === 1 && ps.earned_pence === 200 && ps.on_hold_pence === 200 && ps.payable_pence === 0 && ps.steps.planned === 2, ps);
const wrong = (await one(`select partner_stats('jess', 'nope') j`)).j; expect('wrong secret sees nothing', wrong.ok === false && !wrong.sales, wrong);

// 14 days later it becomes payable; owner marks it paid
await db.exec(`reset role; update commissions set at = now() - interval '15 days'`);
await as('authenticated', '11111111-1111-1111-1111-111111111111', 'cam@example.com');
const g2 = (await one(`select owner_growth(30) j`)).j; const jc = g2.creators.find((c) => c.code === 'JESS');
expect('owner sees payable', jc.payable_pence === 200 && jc.sales === 1 && jc.accounts === 1 && jc.planned === 2, jc);
const mp = (await one(`select owner_mark_paid('JESS') j`)).j; expect('marked paid', mp.sales === 1 && mp.pence === 200, mp);
await as('anon'); const ps2 = (await one(`select partner_stats('JESS', $1) j`, [add.secret])).j; expect('creator sees paid', ps2.paid_pence === 200 && ps2.payable_pence === 0, ps2);

// refund voids a pending commission only
await db.exec(`reset role; insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'b2@example.com')`);
await as('authenticated', '44444444-4444-4444-4444-444444444444', 'b2@example.com'); await q(`select set_referral('JESS', null, 'dev-cccc-3333')`);
await as('service_role'); await q(`select record_purchase('44444444-4444-4444-4444-444444444444', 'cs_2', 'pi_2', 499)`);
const v = (await one(`select void_purchase('pi_2') n`)).n; expect('refund voids', v === 1, v);
await as('anon'); const ps3 = (await one(`select partner_stats('JESS', $1) j`, [add.secret])).j; expect('refund shows', ps3.refunded === 1 && ps3.sales === 1, ps3);

// creator buying through their own code earns nothing
await db.exec(`reset role; update ref_codes set owner_user = '33333333-3333-3333-3333-333333333333' where code = 'JESS'`);
await as('authenticated', '33333333-3333-3333-3333-333333333333', 'jess@example.com'); const self = (await one(`select set_referral('JESS', null, 'dev-ffff-6666') j`)).j; expect('own code ignored', self.code === null, self);

// bring 3 mates
await as('anon');
const m = (await one(`select make_mate_code('dev-mate-0000') j`)).j; expect('mate code made', m.ok && /^[A-Z2-9]{6}$/.test(m.code), m);
const m2 = (await one(`select make_mate_code('dev-mate-0000') j`)).j; expect('same code again', m2.code === m.code && m2.secret === m.secret, m2);
await q(`select track('dev-mate-0000', 'planned', null, $1)`, [m.code]); // the owner's own week doesn't count
for (const a of ['dev-mate-0001', 'dev-mate-0002']) await q(`select track($1, 'planned', null, $2)`, [a, m.code]);
let st = (await one(`select mate_status($1, $2) j`, [m.code, m.secret])).j; expect('2 of 3', st.planned === 2 && !st.unlocked, st);
await as('authenticated', '33333333-3333-3333-3333-333333333333', 'jess@example.com');
const early = (await one(`select claim_mates($1, $2) j`, [m.code, m.secret])).j; expect('claim refused before 3', !early.ok, early);
await as('anon'); await q(`select track('dev-mate-0003', 'planned', null, $1)`, [m.code]);
st = (await one(`select mate_status($1, $2) j`, [m.code, m.secret])).j; expect('3 of 3 unlocked', st.planned === 3 && st.unlocked, st);
const stw = (await one(`select mate_status($1, 'wrong') j`, [m.code])).j; expect('mate status needs the secret', stw.ok === false, stw);
await as('authenticated', '33333333-3333-3333-3333-333333333333', 'jess@example.com');
const cl = (await one(`select claim_mates($1, $2) j`, [m.code, m.secret])).j; expect('claimed', cl.ok && cl.plan === 'mates', cl);
await db.exec('reset role'); const ent = (await one(`select plan, source from entitlements where user_id = '33333333-3333-3333-3333-333333333333'`)); expect('entitlement', ent.plan === 'mates' && ent.source === 'mates:' + m.code, ent);
// claim never downgrades a paid user
await db.exec(`reset role; insert into entitlements (user_id, plan, source) values ('22222222-2222-2222-2222-222222222222', 'lifetime', 'stripe:cs_1')`);
await as('authenticated', '22222222-2222-2222-2222-222222222222', 'buyer@example.com'); const cl2 = (await one(`select claim_mates($1, $2) j`, [m.code, m.secret])).j;
await db.exec('reset role'); const ent2 = (await one(`select plan, source from entitlements where user_id = '22222222-2222-2222-2222-222222222222'`)); expect('paid user kept', ent2.plan === 'lifetime' && ent2.source === 'stripe:cs_1', [cl2, ent2]);
// owner view of mates + update creator
await as('authenticated', '11111111-1111-1111-1111-111111111111', 'cam@example.com');
const g3 = (await one(`select owner_growth(7) j`)).j; expect('mates summary', g3.mates.codes === 1 && g3.mates.unlocked === 1 && g3.mates.claimed === 1, g3.mates);
const up = (await one(`select owner_update_creator('jess', false, 150) j`)).j; expect('creator updated', up.ok, up);
await db.exec('reset role'); const rc = await one(`select active, commission_pence from ref_codes where code='JESS'`); expect('paused at 150p', rc.active === false && rc.commission_pence === 150, rc);
// old owner_stats still works
await as('authenticated', '11111111-1111-1111-1111-111111111111', 'cam@example.com'); const os = (await one(`select owner_stats() j`)).j; expect('owner_stats intact', os.users.total === 4, os.users);
// promo for the creator works with the existing redeem_code
await as('authenticated', '33333333-3333-3333-3333-333333333333', 'jess@example.com'); await db.exec(`reset role; delete from entitlements where user_id='33333333-3333-3333-3333-333333333333'`); await as('authenticated', '33333333-3333-3333-3333-333333333333', 'jess@example.com');
const red = (await one(`select redeem_code('free-jess') j`)).j; expect('creator promo redeems', red.ok && red.plan === 'founder', red);
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
