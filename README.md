# Fuel (FU£L)

A meal-prep app: pick the week's meals, hit protein and calories, get a batch-cook run sheet and the cheapest shopping list across
supermarkets. Live at https://thefuelapp.github.io/ (website) and https://thefuelapp.github.io/app/ (the app).

## This repo is the source of truth

Decided on 27 November 2026: **`thefuelapp/thefuelapp.github.io` is the canonical source for Fuel.** Edit here, nowhere else.

Until that date the source lived in a private working copy (`~/Projects/fuel-app`, repo `cameronatball-cloud/fuel`) whose
`deploy.sh` rebuilt the site and pushed it over this repo's `main`. That path is **retired**: the script is disabled and the folder
is archived as `~/Projects/fuel-app-ARCHIVED`. Never run that script again, and never bring a copy of it back: it mirrors with
`rsync --delete`, so it would wipe everything here that the old copy does not have (`ios/`, `supabase/`, `tools/`, this file).

## Deploying

**Merging to `main` = live.** GitHub Pages serves `main` as it is, with no build step, within a minute or two.

1. Work on a branch. Never commit straight to `main`.
2. If the app changed, bump `APP_VERSION` in `app/app.js` and `VERSION` in `app/sw.js` (the service worker only fetches new files when its version changes).
3. `npm run check` (every app script parses, the site's files are present, the tests pass).
4. Open a pull request. Merging it is the deploy.

Two things the old script did on every deploy now have to be done by hand when they matter:

- The website is `index.html` at the root. Its last line is a `<!-- deployed … -->` stamp that the old script rewrote on every deploy so
  GitHub's delivery network dropped its cached front page. If you change `index.html` the file changes anyway; nothing to do.
- `site/index.html` (a redirect from the website's first address) and the root `sw.js` (retires a service worker from when the app
  lived at `/`) are small fixed files. Leave them alone.

Everything on `main` is public **and served by Pages** (there is a `.nojekyll`), including `supabase/` and `tools/`. Nothing secret
may ever be committed: see "Secrets" below.

## What is where

| Path | What it is |
| --- | --- |
| `index.html` | The website (landing page). Hand-edited; was `app/site/index.html` in the old copy. |
| `app/` | The web app (PWA). No build step. `planner.js` is the pure logic, `app.js` the screens, `data/` the recipes, ingredients and dated price table, `tests/` the logic tests. |
| `ios/`, `capacitor.config.json`, `package.json`, `scripts/build-ios-web.mjs` | The iPhone wrapper (Capacitor 8). See `IOS-APP-STORE.md`. |
| `supabase/schema.sql`, `owner-dashboard.sql`, `growth.sql`, `growth-2.sql`, `hardening.sql` | The database, in the order they are run. Each is safe to run again. Checked 27 Nov 2026 with the public key: `growth.sql` is on the live project; `growth-2.sql` and `hardening.sql` are **not** (their functions answer 404). |
| `supabase/functions/payment-webhook/` | The deployed Stripe webhook: a paid checkout becomes a row in `entitlements`; a full refund removes it. |
| `supabase/functions/revenuecat-webhook/` | Draft webhook for Apple In-App Purchase. Not deployed. |
| `supabase/tests/` | Tests for the SQL on a real Postgres in Node (PGlite). How to run them is below. |
| `supabase/config.toml` | Supabase CLI config (local defaults; secrets are `env(...)` references, not values). |
| `tools/hardening-setup.sh`, `growth-setup.sh`, `growth-2-setup.sh` | One-off installers for the SQL above: they put the file on the clipboard, open Supabase's SQL editor, and check it went in. Still to run, in this order: `growth-2-setup.sh`, then `hardening-setup.sh` (it also re-deploys the payment webhook). |
| `tools/set-stripe-secret.sh` | Stores the Stripe webhook signing secret in Supabase from the clipboard, so it is never typed or saved. |
| `tools/prices/` | Supermarket price-refresh tooling. Its `README.md` is the routine. |
| `tools/shots/`, `tools/compact/` | Screenshot / screen-recording scripts (need Playwright) and a CSS density experiment. |
| `serve.mjs` | Local dev server for `app/`: `npm run serve` → http://localhost:8765 |
| `scripts/check.sh` | The pre-merge check (`npm run check`). |
| `SETUP-CLOUD.md` | The original Supabase set-up guide, kept as history. |
| `IOS-APP-STORE.md` | Where the App Store work stands. |

## Tests

```sh
cd app && node --test tests/*.mjs        # 81 app tests; or `npm test` from the root
npm run check                            # the same tests plus the syntax and file checks

# the database tests need PGlite, which is not a dependency of this repo:
mkdir -p /tmp/pg && (cd /tmp/pg && npm i @electric-sql/pglite@0.3)
export PGLITE=/tmp/pg/node_modules/@electric-sql/pglite/dist/index.js
node supabase/tests/growth.test.mjs      # expect: 41 passed, 0 failed
node supabase/tests/hardening.test.mjs   # expect: 28 passed, 0 failed
```

## Secrets: where they live (none are in this repo)

| Secret | Where it lives |
| --- | --- |
| `STRIPE_WEBHOOK_SECRET` (`whsec_…`) | Supabase → project `htdmdthyrehhvzflajuk` → Edge Functions → Secrets. Set with `tools/set-stripe-secret.sh`. The value is shown in Stripe → Webhooks. |
| `SUPABASE_SERVICE_ROLE_KEY` | Never stored by us. Supabase gives it to every Edge Function automatically. |
| `REVENUECAT_WEBHOOK_AUTH` | Not created yet. It will live in Supabase secrets and RevenueCat's dashboard. |
| Supabase database password, Stripe account, Supabase CLI login | With the owner (the CLI login is in the Mac's keychain). |
| Real promo codes | Only in the live `promo_codes` table. `schema.sql` here seeds examples (`EXAMPLE-…`), not the real ones. |

What **is** in the repo on purpose, because it ships to every browser anyway: the Supabase project URL and its publishable (anon)
key in `app/config.js` and the setup scripts, and the Stripe Payment Link. A RevenueCat **public** Apple key (`appl_…`) may go in
`app/config.js`; a secret key (`sk_…`) never.

## What stayed in the archive, not here

This repo is public, so the private business material from the old copy was **not** brought over. It is still in
`~/Projects/fuel-app-ARCHIVED` and in the private repo `cameronatball-cloud/fuel`: `marketing/` (about 560 MB of posts, film and
plans), `brand/` (logo SVGs, laptop skins), `design/redesign-2026-11/` (mock-up boards), `docs/` (design spec, go-to-market plan,
build plans), `plans/` and `research/`. Also left behind: the raw price-scrape dumps (git-ignored there too), and `deploy.sh`.
