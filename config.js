// Cloud settings. Leave the two Supabase values empty and the app runs entirely on the phone (no accounts, everything unlocked).
// Fill them in and the app gains sign-in, sync between devices, and the free/paid tiers.
export const CONFIG = {
  SUPABASE_URL: 'https://htdmdthyrehhvzflajuk.supabase.co',        // e.g. https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: 'sb_publishable_ghYVovG_UYVNy6fxnUFd8w_Au3Tryvm',   // the "anon public" key from Supabase → Project Settings → API
  CHECKOUT_URL: 'https://buy.stripe.com/14A7sL43lgAH0S7dnSebu01',        // your Stripe Payment Link (https://buy.stripe.com/...); empty hides the Buy button
  APP_NAME: 'Fuel',
  PRICE_LABEL: '£4.99',    // shown on the access screen; the real price lives in the checkout
};
