// Buying FU£L inside the iPhone app: Apple In-App Purchase through RevenueCat (@revenuecat/purchases-capacitor).
// Apple does not allow the iPhone app to sell the unlock through Stripe (App Review 3.1.1), so in the app the Stripe link is never
// shown and this file is the only way to pay. The website and the home-screen web app never load a purchase from here: iapWanted() is false.
//
// How a purchase reaches the account:
//   1. The buyer is signed in. RevenueCat is told their Supabase user id (logIn), so the purchase belongs to that id.
//   2. They pay on Apple's sheet. RevenueCat checks the receipt with Apple and answers with the buyer's entitlements.
//   3. The app opens straight away (cloud.js: noteStorePurchase).
//   4. RevenueCat calls supabase/functions/revenuecat-webhook, which writes the row in `entitlements` (source 'iap:…'),
//      so the same account opens on the website and on any other phone.
// STILL TO DO before this can take money (see IOS-APP-STORE.md): the RevenueCat key and ids in config.js, the product in
// App Store Connect, and the webhook deployed with its secret.
import { CONFIG } from './config.js';
import { isIOSApp, plugin } from './native.js';
import { cloud, noteStorePurchase } from './cloud.js';

const IAP = () => CONFIG.IAP || {};
export const iapWanted = () => isIOSApp();                                                  // the iPhone app: never show Stripe
export const iapReady = () => iapWanted() && !!IAP().REVENUECAT_IOS_KEY && !!plugin('Purchases'); // and the keys are in, so it can sell
export const codesHidden = () => iapWanted() && IAP().HIDE_CODES !== false;

// Does this RevenueCat customer own the lifetime unlock?
export function entitled(info, id = IAP().ENTITLEMENT_ID || 'lifetime') {
  const e = info?.entitlements?.active?.[id];
  return !!e && e.isActive !== false;
}
// The one thing on sale: the lifetime product inside the current offering (or any offering, if "current" is not set).
export function pickPackage(offerings, productId = IAP().PRODUCT_ID) {
  const lists = [offerings?.current, ...Object.values(offerings?.all || {})].filter(Boolean).map((o) => o.availablePackages || []);
  const all = lists.flat();
  return all.find((p) => p?.product?.identifier === productId) || lists[0]?.[0] || null;
}
export const cancelled = (e) => e?.userCancelled === true || String(e?.code) === '1' || /cancel/i.test(String(e?.message || ''));

const st = { configured: false, uid: null, pkg: null, price: '' };
export const iapPrice = () => st.price; // Apple's own price text for this buyer's country ("£4.99"); empty until the shop has answered

// Call whenever the signed-in account changes. Safe to call again and again.
export async function iapSync() {
  if (!iapReady()) return false;
  const Pu = plugin('Purchases'); const uid = cloud.user?.id || null;
  try {
    if (!st.configured) { await Pu.configure({ apiKey: IAP().REVENUECAT_IOS_KEY, appUserID: uid }); st.configured = true; st.uid = uid; }
    else if (uid && uid !== st.uid) { await Pu.logIn({ appUserID: uid }); st.uid = uid; }
    else if (!uid && st.uid) { await Pu.logOut(); st.uid = null; }
    if (!st.pkg) { st.pkg = pickPackage(await Pu.getOfferings()); st.price = st.pkg?.product?.priceString || ''; }
    if (uid) { const { customerInfo } = await Pu.getCustomerInfo(); noteStorePurchase(entitled(customerInfo)); } // also takes access back after a refund
    return true;
  } catch { return false; }
}
// Returns { ok, cancelled, error }. ok = Apple took the payment and the unlock is active.
export async function iapBuy() {
  if (!cloud.user) return { ok: false, error: 'Sign in first.' };
  if (!(await iapSync()) || !st.pkg) return { ok: false, error: 'The App Store did not answer. Check your signal and try again.' };
  try {
    const { customerInfo } = await plugin('Purchases').purchasePackage({ aPackage: st.pkg });
    const ok = entitled(customerInfo); if (ok) noteStorePurchase(true);
    return ok ? { ok } : { ok, error: 'Paid, but the unlock has not arrived yet. Tap Restore purchases in a moment.' };
  } catch (e) { return cancelled(e) ? { ok: false, cancelled: true } : { ok: false, error: e?.message || 'The purchase did not go through.' }; }
}
// "Restore purchases": Apple requires the button. Finds a purchase made with this Apple ID and ties it to the signed-in account.
export async function iapRestore() {
  if (!cloud.user) return { ok: false, error: 'Sign in first.' };
  if (!(await iapSync())) return { ok: false, error: 'The App Store did not answer. Check your signal and try again.' };
  try { const { customerInfo } = await plugin('Purchases').restorePurchases(); const ok = entitled(customerInfo); if (ok) noteStorePurchase(true); return { ok }; }
  catch (e) { return { ok: false, error: e?.message || 'Could not restore.' }; }
}
