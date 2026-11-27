// The iPhone app (Capacitor). On the website and the home-screen web app none of this does anything: isNative() is false,
// every helper returns false, and the caller carries on with what the browser offers.
// No bundler: inside the app Capacitor puts window.Capacitor on the page, and each installed plugin is at Capacitor.Plugins.<Name>.
const cap = () => (typeof globalThis !== 'undefined' ? globalThis.Capacitor : null) || null;
export const isNative = () => { try { return !!cap()?.isNativePlatform?.(); } catch { return false; } };
export const isIOSApp = () => isNative() && cap().getPlatform?.() === 'ios';
export const plugin = (name) => (isNative() ? cap().Plugins?.[name] || null : null);
// The address of the web app, for links that leave the phone (a password-reset email, a link sent to a mate). Inside the app
// location.href is capacitor://localhost, which means nothing to anyone else.
export const WEB_APP_URL = 'https://thefuelapp.github.io/app/';

// ---- a tap you can feel: the Taptic Engine, through @capacitor/haptics ----
export function hapticCall(kind) {
  if (kind === 'tick') return ['impact', { style: 'LIGHT' }];
  if (kind === 'save') return ['notification', { type: 'SUCCESS' }];
  if (kind === 'warn') return ['notification', { type: 'WARNING' }];
  return ['impact', { style: 'MEDIUM' }];
}
export function nativeHaptic(kind = 'tap') {
  const H = plugin('Haptics'); if (!H) return false;
  const [fn, arg] = hapticCall(kind);
  try { H[fn]?.(arg)?.catch?.(() => {}); } catch {}
  return true;
}

// ---- the system share sheet, through @capacitor/share (and @capacitor/filesystem for a picture) ----
// Returns 'shared', 'cancelled', or false when this is not the app (or sharing failed) and the caller should use its web way.
export async function nativeShare({ title, text, url, blob, fileName } = {}) {
  const Sh = plugin('Share'); if (!Sh) return false;
  const opts = {}; if (title) opts.title = title; if (text) opts.text = text; if (url) opts.url = url;
  try {
    if (blob) { const uri = await saveToCache(blob, fileName || 'fuel.png'); if (uri) opts.files = [uri]; }
    await Sh.share(opts); return 'shared';
  } catch (e) { return /cancel/i.test(String(e?.message || e)) ? 'cancelled' : false; }
}
async function saveToCache(blob, fileName) {
  const Fs = plugin('Filesystem'); if (!Fs) return null;
  const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const out = await Fs.writeFile({ path: fileName, data, directory: 'CACHE' });
  return out?.uri || null;
}

// ---- reminders on the lock screen, through @capacitor/local-notifications. Nothing leaves the phone: no push server, no account. ----
export const NOTE = { SHOP: 1001, COOK: 1002, TIMER: 2001 };
// The app counts days Monday = 0 … Sunday = 6. iOS counts Sunday = 1 … Saturday = 7.
export const iosWeekday = (dayIdx) => ((((dayIdx % 7) + 7) % 7 + 1) % 7) + 1;
// Two a week: the evening before cook day ("do the shop") and the morning of it ("time to cook").
export function reminderPlan(cookDay, { recipes = 0 } = {}) {
  const n = recipes > 0 ? `${recipes} recipe${recipes === 1 ? '' : 's'}` : 'your week';
  return [
    { id: NOTE.SHOP, title: 'Shop for tomorrow\'s cook', body: 'Your list is ready, cheapest shop first.', schedule: { on: { weekday: iosWeekday(cookDay - 1), hour: 17, minute: 0 }, allowWhileIdle: true } },
    { id: NOTE.COOK, title: 'Cook day', body: `Time to cook ${n}. Open FU£L for the order to do it in.`, schedule: { on: { weekday: iosWeekday(cookDay), hour: 10, minute: 0 }, allowWhileIdle: true } },
  ];
}
export function timerNote(endMs, what) {
  return { id: NOTE.TIMER, title: 'Time is up', body: what ? `${what}: your timer has finished.` : 'Your cooking timer has finished.', schedule: { at: new Date(endMs), allowWhileIdle: true } };
}
// Asks iOS for permission the first time. True if notifications may be shown.
export async function notifyAllowed(ask = true) {
  const N = plugin('LocalNotifications'); if (!N) return false;
  try { let p = await N.checkPermissions(); if (p?.display !== 'granted' && ask) p = await N.requestPermissions(); return p?.display === 'granted'; } catch { return false; }
}
export async function setReminders(on, cookDay, info) {
  const N = plugin('LocalNotifications'); if (!N) return false;
  try {
    await N.cancel({ notifications: [{ id: NOTE.SHOP }, { id: NOTE.COOK }] });
    if (!on) return true;
    if (!(await notifyAllowed(true))) return false;
    await N.schedule({ notifications: reminderPlan(cookDay, info) }); return true;
  } catch { return false; }
}
// A cooking timer that still goes off when the phone is locked or the app is in the background (a web page cannot do that).
export async function setTimerNote(endMs, what) {
  const N = plugin('LocalNotifications'); if (!N) return false;
  try {
    await N.cancel({ notifications: [{ id: NOTE.TIMER }] });
    if (!endMs || endMs <= Date.now()) return true;
    if (!(await notifyAllowed(true))) return false;
    await N.schedule({ notifications: [timerNote(endMs, what)] }); return true;
  } catch { return false; }
}
