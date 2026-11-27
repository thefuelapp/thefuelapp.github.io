# Switching Fuel from "my phone" to "accounts and sync"

> **History, kept for reference.** This is the original September 2026 set-up guide for the Supabase project, brought over from the
> retired private working copy on 27 November 2026. The project already exists (`htdmdthyrehhvzflajuk`). Two things have moved on
> since it was written: payments go through a **Stripe** Payment Link and `supabase/functions/payment-webhook` (section 6 below
> describes a Lemon Squeezy plan that was never used), and "Deploy" now means **merging to `main`** (see `README.md`).
> The current SQL files, in the order to run them on a fresh project: `supabase/schema.sql`, `owner-dashboard.sql`, `growth.sql`,
> `growth-2.sql`, `hardening.sql`.

The app works fully without this. These steps add sign-in, sync between devices, and the free/paid tiers. About 15 minutes.

## 1. Create the Supabase project (you)
1. Go to https://supabase.com, sign up (GitHub login is fine), **New project**. Name: fuel. Region: West EU (London). Set a database password and keep it somewhere.
2. Wait for it to finish provisioning (~2 min).
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

## 2. Create the tables (you, 1 minute)
1. Left menu → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/schema.sql` and press **Run**. It creates two tables and locks each user to their own rows.

## 3. Turn on email sign-in (you)
1. **Authentication → Providers → Email**: keep Email enabled. Turn **Confirm email** off (the magic link already proves the address).
2. **Authentication → URL Configuration**: Site URL = `https://thefuelapp.github.io/app/` (or your own domain later). Add the same URL under Redirect URLs.
3. Optional but worth it: **Authentication → Email Templates → Magic Link**, change the subject to "Your Fuel sign-in link".

## 4. Paste the keys (me, or you)
Open `app/config.js` and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Deploy. The Account card on the Pantry tab switches from "saved on this phone only" to a sign-in form.

## 5. Give yourself full access (you, 30 seconds)
Sign in to the app with your email once, then in Supabase → SQL Editor run:
```sql
insert into public.entitlements (user_id, plan, expires_at, source)
select id, 'founder', null, 'manual' from auth.users where email = 'YOUR-EMAIL'
on conflict (user_id) do update set plan = 'founder', expires_at = null, source = 'manual', updated_at = now();
```
Same query, different email and `plan = 'year', expires_at = now() + interval '12 months'`, unlocks a friend.

## 6. Payments (later, when you're ready to charge)
1. Create a Lemon Squeezy store (they handle UK VAT). Make products: Term pass £6.99, Year £14.99. Note each variant id.
2. Paste the checkout link into `CHECKOUT_URL` in `config.js`. The app appends the signed-in user's id as custom data.
3. Deploy the webhook: install the Supabase CLI, `supabase login`, `supabase link`, then `supabase functions deploy payment-webhook --no-verify-jwt`, and set the secrets named at the top of `supabase/functions/payment-webhook/index.ts`. Put the function URL into Lemon Squeezy → Settings → Webhooks for `order_created`.
4. Fill `PLAN_BY_VARIANT` in the webhook with your variant ids.

## How access works
- **No cloud configured**: the app is open and nothing leaves the phone (dev machine / local testing).
- **Cloud on**: you must sign in, and your account must be active (a row in `entitlements`). Then everything is unlocked: there are no tiers inside the app. Without an active row you see the "Nearly there" screen with the buy button (or "ask for access" until payments are live).


## Update, 9 Sep 2026: password sign-in and promo codes

- Sign-in is now **email + password**, created inside the app. "Confirm email" is switched off in Supabase, so no email is sent at sign-up and no SMTP service is needed. Custom SMTP is disabled. The only emails Supabase ever sends now are password resets, through its built-in sender (a couple an hour; fine for that).
- **Promo codes** live in `public.promo_codes` and are redeemed by the `redeem_code()` function from the "Have a code?" box on the access screen. Two were seeded when the project was set up (one founder code, one 12-month code for friends); their real names are kept out of this public repo and live only in the `promo_codes` table. Add more in the SQL editor:
  `insert into public.promo_codes (code, plan, months, max_uses, note) values ('RUGBY-CLUB', 'year', 12, 30, 'club');`
- To see who has access: `select u.email, e.plan, e.expires_at, e.source from public.entitlements e join auth.users u on u.id = e.user_id;`
