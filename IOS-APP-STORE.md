# Fuel for the App Store: where things stand

Branch `ios-app-store`, written 27 November 2026. Phase 1: the code is ready for an iPhone build. Nothing here has been
compiled, because the machine it was written on has no Xcode. Nothing on the live site changes until this branch is merged.

## Read this first: this repo is now the source of truth

Decided by the owner on 27 November 2026: **`thefuelapp/thefuelapp.github.io` is the canonical source for Fuel.** (Phase 1 found
that this repo was only a deploy target: a private working copy held the source and its `deploy.sh` copied the site here with
`rsync --delete` and pushed `main`, which would have undone this branch.) What changed on that date, on this branch:

- The backend and tooling that existed only in the private copy were brought in: `supabase/` (all five SQL files, the deployed
  Stripe `payment-webhook`, the SQL tests, `config.toml`), `tools/` (the setup scripts, the price-refresh tooling, the screenshot
  scripts), `serve.mjs`, `SETUP-CLOUD.md`, and a `README.md` that maps the repo.
- `deploy.sh` was **not** brought in. It is disabled in the old folder (`deploy.sh.retired`) and must never be run again. Its
  safety checks live on as `npm run check` (`scripts/check.sh`), which never touches git.
- The old folder is archived as `~/Projects/fuel-app-ARCHIVED`. Marketing, brand and planning material stayed there, because this
  repo is public.

**The deploy flow now: merging to `main` = the live GitHub Pages deploy.** Work on a branch, bump the versions if the app changed,
`npm run check`, open a pull request, merge. There is no build step and no script. Details in `README.md`.

## What is in the branch

| Path | What it is |
| --- | --- |
| `app/native.js` | The iPhone-app layer: haptics, share sheet, local notifications. Does nothing on the web. |
| `app/iap.js` | Apple In-App Purchase through RevenueCat. Does nothing on the web. |
| `app/app.js`, `cloud.js`, `config.js`, `ios-fit.js`, `sw.js` | Wiring for the above (v103). On the web the only visible changes are the Help and contact link and a clearer message if account deletion is not installed. |
| `app/support.html` | Help and contact page (Instagram, and a labelled placeholder where an email will go). |
| `app/privacy.html`, `app/terms.html`, `index.html` | Contact wording fixed, account deletion described, Apple/RevenueCat named, footer link to Help. |
| `app/tests/native.test.mjs` | 15 new tests for the native layer. |
| `package.json`, `capacitor.config.json`, `scripts/build-ios-web.mjs` | Capacitor 8 set-up. Bundle id `com.thefuelapp.fuel`. |
| `ios/` | The Xcode project Capacitor generated (Swift Package Manager, so **no CocoaPods needed**), with the Fuel icon and launch screen. |
| `supabase/functions/revenuecat-webhook/index.ts` | Draft server function: an in-app purchase becomes a row in `entitlements`. Not deployed. |
| `supabase/delete-account.sql` | Reference copy of the account-deletion function. |
| `supabase/*.sql`, `supabase/functions/payment-webhook/`, `supabase/tests/`, `tools/`, `serve.mjs`, `SETUP-CLOUD.md`, `README.md`, `scripts/check.sh` | Brought in from the retired private copy on 27 November 2026 (see above and `README.md`). |

The web app is still `app/`, served exactly as before. The iPhone app is built from a copy of it (`ios-web/`, git-ignored) made by
`npm run build:web`. The website loads no Capacitor code: `native.js` only looks for `window.Capacitor`, which exists only inside the app.

## What the iPhone app does that the website cannot (guideline 4.2)

- **Taptic Engine haptics** (`@capacitor/haptics`) on every tap that already had a web "haptic".
- **The system share sheet** (`@capacitor/share`, `@capacitor/filesystem`) for the shopping list, the mates link and the picture of your week.
- **Local notifications** (`@capacitor/local-notifications`): a cooking timer that goes off when the phone is locked, and an optional
  "shop tomorrow / cook today" reminder pair set from Settings → App. No push server and no Apple push key are needed.
- **Apple In-App Purchase** with Restore purchases.

Push notifications were not scaffolded: they need an Apple Developer account for the key and a server to send them.

## Building it, once Xcode is installed

Needs: a Mac with a current Xcode (check the version Capacitor 8 asks for at capacitorjs.com; the project targets iOS 15 and up), Node, and an Apple Developer account for TestFlight.

```sh
git clone https://github.com/thefuelapp/thefuelapp.github.io.git && cd thefuelapp.github.io
git checkout ios-app-store
npm install            # Capacitor and the plugins
npm test               # 81 tests
npm run sync:ios       # copies app/ to ios-web/ and into the Xcode project
npm run open:ios       # opens ios/App/App.xcodeproj in Xcode
```

In Xcode: pick the App target → Signing & Capabilities → choose your team. The first build downloads the Swift packages
(Capacitor, RevenueCat). Then run on a simulator or a phone. Run `npm run sync:ios` again after any change to `app/`.

### Not done here, because there is no Xcode on this machine

- `xcodebuild` was never run, so **the project has never been compiled**. `npx cap add ios` and `npx cap sync ios` did run and succeeded.
- Swift package resolution (it happens on first open in Xcode).
- Any run on a simulator or a phone. The native layer was exercised only in desktop Chromium with a pretend `window.Capacitor`.
- **Layout on a real iPhone.** `styles.css` has several fixes written for the home-screen web app (`is-ios-app`, `ios-under`,
  `ios-short`). The app gets `is-native is-standalone` instead. Check the status bar area, the tab bar and the bottom sheets on a
  phone with a notch and one without.
- Signing, an archive, TestFlight, App Store Connect.

## What is stubbed, and what each stub needs

### In-app purchase (guideline 3.1.1)

In the iPhone app the Stripe link is never shown. The gate, the Upgrade row and the buy sheet show Apple's price and call
`iapBuy()`; "Restore purchases" is on the gate and in Settings. With no RevenueCat key in `config.js` the buttons say
"Buying is not switched on in this build yet", so a keyless build cannot take money and cannot be submitted.

To switch it on:

1. App Store Connect: make a **non-consumable** in-app purchase. Suggested id `com.thefuelapp.fuel.lifetime`, price tier £4.99.
2. RevenueCat: make a project and an iOS app with bundle id `com.thefuelapp.fuel`, add the product, an entitlement called
   `lifetime`, and an offering containing it.
3. `app/config.js` → `IAP.REVENUECAT_IOS_KEY`: the **public** Apple key (starts `appl_`). It is made to ship inside apps. Never
   put a secret key (`sk_…`) in this repo. Check `ENTITLEMENT_ID` and `PRODUCT_ID` match what you made.
4. Deploy the webhook (below) and point RevenueCat at it.
5. Test with a sandbox Apple ID: buy, restore, refund.

How a purchase reaches `entitlements`: the app tells RevenueCat the buyer's Supabase user id; after Apple takes the payment the
app opens at once (a note in the phone's storage, `fuel:iap`); RevenueCat's webhook then writes the `entitlements` row
(`source = 'iap:<transaction>'`), which is what opens the same account on the website or another phone. On every launch the app
asks RevenueCat again, so a refund closes it.

`supabase/functions/revenuecat-webhook/index.ts` is a **draft**: it has never received a real event. Check its field names against
RevenueCat's webhook documentation before trusting it. It needs one secret, `REVENUECAT_WEBHOOK_AUTH`, which lives only in Supabase
secrets and in RevenueCat's dashboard. The deploy commands are in the file's header.

Decisions already taken in the code, easy to reverse:

- **Unlock codes are hidden in the iPhone app** (`IAP.HIDE_CODES`). Apple does not allow licence keys or codes to unlock paid
  features. A code redeemed on the website still opens the app after sign-in.
- **An account is required before buying**, as on the web, so the purchase follows the account. A reviewer may question this.
- **The "bring 3 mates, get it free" unlock is still shown in the app.** That is a referral reward that unlocks a paid feature
  without In-App Purchase, and a reviewer could object. Decide whether to hide it on iOS.
- **iPhone only**, portrait only (`TARGETED_DEVICE_FAMILY = 1`). The layout was designed for a phone.

### Account deletion (guideline 5.1.1(v))

The app already had this in v102: Settings → Delete my account → confirm → `delete_my_account()` on Supabase → the account and
everything saved to it are deleted, the phone's copy is cleared. No service-role key is involved.

**It does not work on the live project yet.** Checked on 27 November 2026 with the public key: `delete_my_account` and
`fuel_hardening` do not exist there (the API answers `PGRST202`, function not found). `supabase/hardening.sql`
has not been run. Until it is, the website hides the row, and the iPhone app (which always shows it, because Apple requires it)
answers "Deleting from inside the app is not switched on yet". Run `./tools/hardening-setup.sh` (from this repo) before submitting.

### Support and privacy

`app/support.html` gives Instagram `@the.fuelapp` and a visibly labelled placeholder for an email address. No address has been
invented. When there is a real, monitored one: replace the placeholder paragraph in `support.html`, set `SUPPORT_EMAIL` in
`config.js`, and use the same address in App Store Connect. The App Store listing also needs a Support URL
(`https://thefuelapp.github.io/app/support.html` once deployed) and a Privacy Policy URL (`…/app/privacy.html`).

`privacy.html` now names Apple and RevenueCat. If anything else is added (analytics, push), update it and the App Store privacy answers together.

### Smaller things

- The Supabase library still loads from a CDN at start-up, as on the web. The app's first ever launch therefore needs a signal.
  Bundling it into the app would remove that.
- Password-reset emails sent from the iPhone app link to the website (`https://thefuelapp.github.io/app/`), where the new
  password is set. There is no deep link back into the app.
- The app name on the home screen is "Fuel" (`CFBundleDisplayName`). Change it in `ios/App/App/Info.plist` if it should be different.
- Version 1.0, build 1.

## How a Stripe purchase reaches `entitlements` today (investigated, nothing changed)

The code is `supabase/functions/payment-webhook/index.ts` (in this repo since 27 November 2026):

1. The app opens the Stripe Payment Link with `?client_reference_id=<Supabase user id>&prefilled_email=<email>` (`app.js: checkoutUrl`).
2. Stripe calls a Supabase Edge Function, `payment-webhook`, on `checkout.session.completed`. It checks Stripe's signature
   (`STRIPE_WEBHOOK_SECRET`, held in Supabase secrets), finds the account by that id (or, failing that, by the receipt email), and
   upserts `entitlements` with `plan = 'lifetime'`, `source = 'stripe:<session>|<payment intent>'` using the service-role key that
   Supabase gives every function. It then records the sale for creator commission (`record_purchase`).
3. On `charge.refunded` it voids the commission and, for a full refund, deletes the `entitlements` row for that payment.
4. The app polls `entitlements` when it comes back to the foreground and for 90 seconds after a Buy tap.

Other ways a row gets there: `redeem_code()` (promo codes, `schema.sql` / `hardening.sql`), `claim_mates()` (`growth.sql`), or by hand in the SQL editor.

Evidence the function is live: a plain GET to `https://htdmdthyrehhvzflajuk.supabase.co/functions/v1/payment-webhook` answers
`ok` (200), which is what the function's code does for anything that is not a POST. Not verified: whether the Stripe dashboard's
webhook points at it, whether the secret is set, and whether the deployed copy is the latest (the full-refund step was added in
v102 and is sent up by the same script that installs `hardening.sql`, which has not been run).

Where it was found during phase 1: only in the private working copy's `supabase/` folder, which is now this repo's `supabase/`.

## How supermarket prices are updated (documented only; no refresh was run)

Prices live in `app/data/ingredients.json`, each pack with the date it was `checked`. The tooling is
at `tools/prices/` and its `README.md` is the full routine. In short, about an hour:

1. Start the dev server with a drop box: `FUEL_DUMP_DIR=$PWD/tools/prices/dumps node serve.mjs`.
2. **Aldi, Tesco, Sainsbury's**: `python3 gen2.py <shop> <start> 40` prints a script for 40 search terms; it is run in a browser tab
   open on that shop's own site and the results are relayed back into `dumps/`. Tesco's bot protection blocks after about 40 quick
   requests, so it is slow and sometimes fails for the day.
3. **ASDA**: `python3 asda_algolia.py` reads the public search index the ASDA site uses. No browser.
4. `python3 refresh.py` matches every pack to its old self and writes `dumps/refresh_report.txt`. Every STALE / AMBIG / FILL / NOFILL
   line is a decision for a person, recorded in `dumps/overrides.json`; re-run until none are left.
5. `python3 apply.py aldi asda sainsburys tesco "note"` writes the new prices into the app. Bump the version, `npm run check`, pull request, merge.

Shelf prices only (no Clubcard or Nectar prices). Lidl publishes no core-range prices, so it cannot be included. The last full refresh
noted in that README was 14 September 2026, and the public prices page says its lists were checked around 20 September 2026: the
prices are about two months old and should be refreshed before launch.

## Tests

```sh
cd app && node --test tests/*.mjs      # or: npm test, from the repo root
```

81 tests, 81 pass (the 66 that were there, plus 15 in `tests/native.test.mjs`). `npm run check` runs them with the syntax and
file checks. The database tests in `supabase/tests/` run separately (see `README.md`): 41 and 28 pass.

A browser check was also done by hand (headless Chromium, Supabase calls answered locally so nothing reached the live project):
the website build loads with no script errors and still shows the Stripe link and the code box; a pretend iPhone build shows
Apple's price, no Stripe link, no code box, Restore purchases, the reminders switch and Delete my account, and a pretend purchase opens the app.

## Still to do, by a person

1. ~~Decide where the source lives.~~ Done 27 November 2026: this repo. Merging this pull request puts v103 live.
2. Run `./tools/growth-2-setup.sh`, then `./tools/hardening-setup.sh`, so `growth-2.sql` and `hardening.sql` are on the live
   Supabase project and account deletion works. (Checked 27 November 2026: `code_kind` and `fuel_hardening` both answer 404, so neither file has been run.)
3. Join the Apple Developer Program (a yearly fee; about £79 at the time of writing, check Apple's page).
4. Install Xcode on a Mac, open the project, fix whatever the first compile and the first run on a phone turn up.
5. Decide: the name on the App Store, the price tier, whether the mates unlock stays in the iPhone app, a real support email.
6. Sign up to RevenueCat, make the product in App Store Connect, fill in `config.js`, deploy the webhook.
7. Refresh the supermarket prices.
8. App Store Connect listing: screenshots, description, privacy answers, a demo account for the reviewer (one with access, and one
   whose free week has ended so they can see the purchase).
