// The iPhone-app layer (native.js, iap.js) and the bits of cloud.js it leans on. Run from app/: node --test tests/*.mjs
// A pretend Capacitor is put on globalThis; with none there, everything must stand down so the website is untouched.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const N = await import('../native.js');
const { CONFIG } = await import('../config.js');
const C = await import('../cloud.js');
const I = await import('../iap.js');

let calls;
function fakeApp({ platform = 'ios', perm = 'granted', plugins = {} } = {}) {
  calls = [];
  const rec = (name, out) => async (arg) => { calls.push([name, arg]); return typeof out === 'function' ? out(arg) : out; };
  globalThis.Capacitor = {
    isNativePlatform: () => true, getPlatform: () => platform,
    Plugins: {
      Haptics: { impact: rec('impact'), notification: rec('notification') },
      Share: { share: rec('share') },
      Filesystem: { writeFile: rec('writeFile', { uri: 'file:///cache/x.png' }) },
      LocalNotifications: { checkPermissions: rec('check', { display: perm }), requestPermissions: rec('request', { display: perm }), cancel: rec('cancel'), schedule: rec('schedule') },
      ...plugins,
    },
  };
}
beforeEach(() => { delete globalThis.Capacitor; store.clear(); calls = []; C.cloud.user = null; C.cloud.plan = null; });

test('on the website (no Capacitor) every native helper stands down, so the browser way is used', async () => {
  assert.equal(N.isNative(), false); assert.equal(N.isIOSApp(), false); assert.equal(N.plugin('Haptics'), null);
  assert.equal(N.nativeHaptic('save'), false);
  assert.equal(await N.nativeShare({ text: 'hi' }), false);
  assert.equal(await N.setReminders(true, 6), false);
  assert.equal(await N.setTimerNote(Date.now() + 60000, 'Chilli'), false);
  assert.equal(I.iapWanted(), false); assert.equal(I.iapReady(), false); assert.equal(I.codesHidden(), false);
});
test('a web page that merely has window.Capacitor (the web build) is not the app', () => {
  globalThis.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', Plugins: { Haptics: {} } };
  assert.equal(N.isNative(), false); assert.equal(N.plugin('Haptics'), null); assert.equal(I.iapWanted(), false);
});
test('haptics: each kind of tap maps to a Taptic Engine call', () => {
  assert.deepEqual(N.hapticCall('tick'), ['impact', { style: 'LIGHT' }]);
  assert.deepEqual(N.hapticCall('tap'), ['impact', { style: 'MEDIUM' }]);
  assert.deepEqual(N.hapticCall('save'), ['notification', { type: 'SUCCESS' }]);
  assert.deepEqual(N.hapticCall('warn'), ['notification', { type: 'WARNING' }]);
  fakeApp(); assert.equal(N.nativeHaptic('save'), true); assert.deepEqual(calls, [['notification', { type: 'SUCCESS' }]]);
});
test('share sheet: text and link go to the Share plugin; a cancel is reported as cancelled, not as a failure', async () => {
  fakeApp(); assert.equal(await N.nativeShare({ title: 'FU£L', text: 'my week', url: 'https://thefuelapp.github.io/?c=AB' }), 'shared');
  assert.deepEqual(calls, [['share', { title: 'FU£L', text: 'my week', url: 'https://thefuelapp.github.io/?c=AB' }]]);
  fakeApp({ plugins: { Share: { share: async () => { throw new Error('Share canceled'); } } } });
  assert.equal(await N.nativeShare({ text: 'x' }), 'cancelled');
  fakeApp({ plugins: { Share: { share: async () => { throw new Error('boom'); } } } });
  assert.equal(await N.nativeShare({ text: 'x' }), false);
});
test('weekdays: the app counts Monday = 0, iOS counts Sunday = 1', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(N.iosWeekday), [2, 3, 4, 5, 6, 7, 1]);
  assert.equal(N.iosWeekday(-1), 1); // the day before Monday is Sunday
});
test('reminders: shop the evening before cook day, cook that morning', () => {
  const [shop, cook] = N.reminderPlan(6); // cook on Sunday
  assert.deepEqual(shop.schedule.on, { weekday: 7, hour: 17, minute: 0 }); // Saturday 5pm
  assert.deepEqual(cook.schedule.on, { weekday: 1, hour: 10, minute: 0 }); // Sunday 10am
  assert.deepEqual(N.reminderPlan(0)[0].schedule.on.weekday, 1); // cook Monday: shop Sunday
  assert.notEqual(shop.id, cook.id);
});
test('reminders: switching on asks permission and schedules both; switching off only cancels', async () => {
  fakeApp(); assert.equal(await N.setReminders(true, 6), true);
  assert.deepEqual(calls.map((c) => c[0]), ['cancel', 'check', 'schedule']); assert.equal(calls[2][1].notifications.length, 2);
  fakeApp(); assert.equal(await N.setReminders(false, 6), true); assert.deepEqual(calls.map((c) => c[0]), ['cancel']);
});
test('reminders: if the phone says no to notifications, nothing is scheduled and the caller is told', async () => {
  fakeApp({ perm: 'denied' }); assert.equal(await N.setReminders(true, 6), false);
  assert.deepEqual(calls.map((c) => c[0]), ['cancel', 'check', 'request']);
});
test('cooking timer: a notification at the moment it ends; stopping the timer cancels it', async () => {
  const end = Date.now() + 5 * 60000; const n = N.timerNote(end, 'Chilli con carne');
  assert.equal(n.schedule.at.getTime(), end); assert.match(n.body, /Chilli con carne/);
  fakeApp(); assert.equal(await N.setTimerNote(end, 'Chilli'), true); assert.deepEqual(calls.map((c) => c[0]), ['cancel', 'check', 'schedule']);
  fakeApp(); assert.equal(await N.setTimerNote(0), true); assert.deepEqual(calls.map((c) => c[0]), ['cancel']);
});

test('in-app purchase: who owns the unlock, from RevenueCat\'s answer', () => {
  assert.equal(I.entitled(null), false); assert.equal(I.entitled({ entitlements: { active: {} } }), false);
  assert.equal(I.entitled({ entitlements: { active: { lifetime: { isActive: true } } } }), true);
  assert.equal(I.entitled({ entitlements: { active: { other: { isActive: true } } } }), false);
  assert.equal(I.entitled({ entitlements: { active: { pro: {} } } }, 'pro'), true);
});
test('in-app purchase: the lifetime product is picked out of the offerings, wherever it sits', () => {
  const life = { identifier: '$rc_lifetime', product: { identifier: 'com.thefuelapp.fuel.lifetime', priceString: '£4.99' } };
  const other = { identifier: 'x', product: { identifier: 'something.else', priceString: '£1.00' } };
  assert.equal(I.pickPackage({ current: { availablePackages: [other, life] }, all: {} }, 'com.thefuelapp.fuel.lifetime'), life);
  assert.equal(I.pickPackage({ current: null, all: { main: { availablePackages: [life] } } }, 'com.thefuelapp.fuel.lifetime'), life);
  assert.equal(I.pickPackage({ current: { availablePackages: [other] }, all: {} }, 'com.thefuelapp.fuel.lifetime'), other); // one thing on sale: sell it
  assert.equal(I.pickPackage({ current: null, all: {} }), null); assert.equal(I.pickPackage(null), null);
});
test('in-app purchase: closing Apple\'s sheet is a cancel, not an error', () => {
  assert.equal(I.cancelled({ userCancelled: true }), true); assert.equal(I.cancelled({ code: '1' }), true);
  assert.equal(I.cancelled({ message: 'Purchase was cancelled.' }), true); assert.equal(I.cancelled({ code: '2', message: 'Store problem' }), false);
});
test('in the iPhone app Stripe and codes are out, and with no RevenueCat key committed buying is off rather than broken', async () => {
  fakeApp(); assert.equal(I.iapWanted(), true); assert.equal(I.codesHidden(), true);
  assert.equal(CONFIG.IAP.REVENUECAT_IOS_KEY, '', 'no RevenueCat key may be committed');
  assert.equal(I.iapReady(), false); assert.equal(await I.iapSync(), false);
  C.cloud.user = { id: 'u1' }; const r = await I.iapBuy(); assert.equal(r.ok, false); assert.ok(r.error);
});
test('in-app purchase, with a key: sign-in is passed to RevenueCat, the price is Apple\'s, and a purchase opens the app at once', async () => {
  const life = { identifier: '$rc_lifetime', product: { identifier: CONFIG.IAP.PRODUCT_ID, priceString: '£4.99' } };
  const owns = { entitlements: { active: { [CONFIG.IAP.ENTITLEMENT_ID]: { isActive: true } } } }, none = { entitlements: { active: {} } };
  const log = [];
  fakeApp({ plugins: { Purchases: {
    configure: async (a) => { log.push(['configure', a]); }, logIn: async (a) => { log.push(['logIn', a]); return { customerInfo: none }; }, logOut: async () => { log.push(['logOut']); return { customerInfo: none }; },
    getOfferings: async () => ({ current: { availablePackages: [life] }, all: {} }), getCustomerInfo: async () => ({ customerInfo: none }),
    purchasePackage: async (a) => { log.push(['purchase', a.aPackage.identifier]); return { customerInfo: owns }; }, restorePurchases: async () => ({ customerInfo: owns }),
  } } });
  CONFIG.IAP.REVENUECAT_IOS_KEY = 'appl_test_only';
  try {
    C.cloud.user = { id: 'user-1' };
    assert.equal(await I.iapSync(), true); assert.deepEqual(log[0], ['configure', { apiKey: 'appl_test_only', appUserID: 'user-1' }]);
    assert.equal(I.iapPrice(), '£4.99'); assert.equal(C.cloud.plan, null);
    const r = await I.iapBuy(); assert.deepEqual(r, { ok: true }); assert.deepEqual(log.at(-1), ['purchase', '$rc_lifetime']);
    assert.equal(C.cloud.plan, 'lifetime'); assert.equal(C.hasAccess(), true); assert.equal(store.get('fuel:iap'), 'user-1');
    C.cloud.user = { id: 'user-2' }; C.cloud.plan = null; await I.iapSync(); assert.deepEqual(log.at(-1), ['logIn', { appUserID: 'user-2' }]);
    assert.equal(C.cloud.plan, null, 'another account on the same phone does not inherit the purchase'); assert.equal(store.has('fuel:iap'), false);
    assert.deepEqual(await I.iapRestore(), { ok: true }); assert.equal(C.cloud.plan, 'lifetime');
  } finally { CONFIG.IAP.REVENUECAT_IOS_KEY = ''; }
});
test('no secrets in config.js: only the publishable Supabase key and an empty RevenueCat slot', async () => {
  const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /sk_(live|test)_|service_role|sb_secret_|whsec_|appl_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,}/);
});
