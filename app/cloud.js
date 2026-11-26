// Accounts, sync and entitlements on Supabase. Everything here is optional: if CONFIG is empty, cloud.enabled is false.
import { CONFIG } from './config.js';

export const cloud = { enabled: !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY), client: null, user: null, plan: null, planExpires: null, status: 'off', lastSync: null, error: null, recovery: false };

// The last plan the server confirmed for this phone. A paid plan must still open with no signal (in a shop) or when the server cannot be
// reached, so the answer is kept here and only cleared when the server says there is no plan, or on sign-out.
const PLAN_KEY = 'fuel:plan';
function cachedPlan(uid) {
  try { const c = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null'); if (!c || !c.plan || (uid && c.uid !== uid)) return null; if (c.expires && new Date(c.expires) <= new Date()) return null; return c; } catch { return null; }
}
function cachePlan(c) { try { if (c) localStorage.setItem(PLAN_KEY, JSON.stringify(c)); else localStorage.removeItem(PLAN_KEY); } catch {} }

let onChange = () => {};
export function onCloudChange(fn) { onChange = fn; }
function set(patch) { Object.assign(cloud, patch); onChange(cloud); }

export async function initCloud() {
  if (!cloud.enabled) return;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm');
    cloud.client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data } = await cloud.client.auth.getSession();
    await applySession(data.session);
    cloud.client.auth.onAuthStateChange((evt, session) => { if (evt === 'PASSWORD_RECOVERY') cloud.recovery = true; applySession(session); }); // a reset link signs you in: the app then asks for the new password
    set({ status: cloud.user ? 'signed-in' : 'signed-out' });
  } catch (e) { const c = cachedPlan(); if (c) { cloud.plan = c.plan; cloud.planExpires = c.expires || null; } set({ status: 'error', error: e.message }); } // offline at start-up: a plan this phone already had still opens
}

async function applySession(session) {
  cloud.user = session?.user || null;
  if (cloud.user) await loadEntitlement(); else { cloud.plan = null; cloud.planExpires = null; }
  set({ status: cloud.user ? 'signed-in' : 'signed-out' });
}

// Email + password. No confirmation email: "Confirm email" is off in the Supabase project, so sign-up logs you straight in.
export async function signIn(email, password) {
  const { error } = await cloud.client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signUp(email, password) {
  const { data, error } = await cloud.client.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('Account created but not signed in. Try signing in.');
}
export async function resetPassword(email) {
  const { error } = await cloud.client.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
  if (error) throw error;
}
export async function redeemCode(code) {
  const { data, error } = await cloud.client.rpc('redeem_code', { p_code: code });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Code not accepted');
  await loadEntitlement(); set({ status: 'signed-in' });
  return data;
}
export async function updatePassword(password) {
  const { error } = await cloud.client.auth.updateUser({ password });
  if (error) throw error;
}
export async function signOut() { try { await cloud.client.auth.signOut(); } catch {} cachePlan(null); cloud.user = null; cloud.plan = null; cloud.planExpires = null; cloud.recovery = false; set({ status: 'signed-out' }); }
// Deletes the account and everything saved to it on the server (supabase/hardening.sql: delete_my_account). The phone's own copy is cleared by the app.
export async function deleteAccount() {
  const { data, error } = await cloud.client.rpc('delete_my_account');
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Could not delete the account');
  await signOut();
}

async function loadEntitlement() {
  const uid = cloud.user.id;
  const { data, error } = await cloud.client.from('entitlements').select('plan, expires_at').eq('user_id', uid).maybeSingle();
  if (error) { const c = cachedPlan(uid); cloud.plan = c ? c.plan : null; cloud.planExpires = c ? c.expires || null : null; return; } // no signal, or the server is down: keep what this phone last knew
  cloud.plan = data && (!data.expires_at || new Date(data.expires_at) > new Date()) ? data.plan : null;
  cloud.planExpires = data?.expires_at || null;
  cachePlan(cloud.plan ? { uid, plan: cloud.plan, expires: cloud.planExpires } : null);
}

// Which code and source this account came with (first one wins; supabase/growth.sql). Quietly does nothing if growth.sql isn't in yet.
export async function setReferral(code, src, anon) {
  if (!cloud.user) return null;
  const { data, error } = await cloud.client.rpc('set_referral', { p_code: code || null, p_src: src || null, p_anon: anon || null });
  if (error) throw error; return data;
}
// Three mates planned a week with this phone's code: make it free for life on the account.
export async function claimMates(code, secret) {
  const { data, error } = await cloud.client.rpc('claim_mates', { p_code: code, p_secret: secret });
  if (error) throw error;
  if (data?.ok) { await loadEntitlement(); set({ status: 'signed-in' }); }
  return data;
}

// Access = signed in with an active plan. With no cloud configured, the app is open (that's how it runs on a dev machine).
export async function refreshAccess() { if (cloud.user) await loadEntitlement(); set({ status: cloud.user ? 'signed-in' : 'signed-out' }); }
export function hasAccess() { return !cloud.enabled || !!cloud.plan; }

// ---- state sync: one JSON document per user, last write wins by updated_at ----
export async function pullState() {
  if (!cloud.user) return null;
  const { data, error } = await cloud.client.from('user_state').select('data, updated_at').eq('user_id', cloud.user.id).maybeSingle();
  if (error) { set({ error: error.message }); return null; }
  return data;
}
let pushTimer = null, lastGet = null, unsent = false;
export function pushStateSoon(getState) {
  lastGet = getState;
  if (!cloud.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushState(getState()), 1500);
}
export async function pushState(state) {
  if (!cloud.user || !cloud.client) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { unsent = true; return; } // no signal: it is saved on the phone and goes up when the signal is back
  const uid = cloud.user.id;
  const { error } = await cloud.client.from('user_state').upsert({ user_id: uid, data: state, updated_at: new Date().toISOString() });
  if (!cloud.user || cloud.user.id !== uid) return; // signed out, or someone else signed in, while it was sending
  if (error) { unsent = true; if (/fetch|network|load failed/i.test(error.message || '')) return; set({ status: 'error', error: error.message }); } else { unsent = false; set({ lastSync: new Date().toISOString(), error: null, status: 'signed-in' }); }
}
// Back in signal: send what could not be sent.
if (typeof window !== 'undefined') window.addEventListener('online', () => { if (unsent && lastGet && cloud.user) pushState(lastGet()); });
