// Cloud settings. Leave the two Supabase values empty and the app runs entirely on the phone (no accounts, everything unlocked).
// Fill them in and the app gains sign-in, sync between devices, and the free/paid tiers.
export const CONFIG = {
  SUPABASE_URL: 'https://htdmdthyrehhvzflajuk.supabase.co',        // e.g. https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: 'sb_publishable_ghYVovG_UYVNy6fxnUFd8w_Au3Tryvm',   // the "anon public" key from Supabase → Project Settings → API
  CHECKOUT_URL: 'https://buy.stripe.com/14A7sL43lgAH0S7dnSebu01',        // your Stripe Payment Link (https://buy.stripe.com/...); empty hides the Buy button
  APP_NAME: 'Fuel',
  PRICE_LABEL: '£4.99',    // shown on the access screen; the real price lives in the checkout
  // Help and contact (app/support.html and Settings → About). Instagram is the only public contact today.
  SUPPORT_INSTAGRAM: 'https://www.instagram.com/the.fuelapp/',
  SUPPORT_EMAIL: '',       // TODO(owner): the support address for the App Store listing. Empty = the app shows no email. Also fill it in on support.html and privacy.html.
  // The iPhone app only (Capacitor). The website and the home-screen web app keep paying through CHECKOUT_URL above.
  IAP: {
    REVENUECAT_IOS_KEY: '',                       // TODO(owner): RevenueCat → Project → API keys → the PUBLIC Apple key (starts appl_). Never a secret key (sk_). Empty = buying is switched off in the iPhone app.
    ENTITLEMENT_ID: 'lifetime',                   // TODO: must match the entitlement made in RevenueCat
    PRODUCT_ID: 'com.thefuelapp.fuel.lifetime',   // TODO: must match the non-consumable made in App Store Connect
    HIDE_CODES: true,                             // App Review 3.1.1: no unlock codes inside the iPhone app. A code used on the website still opens the app after sign-in.
  },
};
