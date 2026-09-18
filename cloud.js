// Accounts, sync and entitlements on Supabase. Everything here is optional: if CONFIG is empty, cloud.enabled is false.
import { CONFIG } from './config.js';

export const cloud = { enabled: !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY), client: null, user: null, plan: null, planExpires: null, status: 'off', lastSync: null, error: null };

let onChange = () => {};
export function onCloudChange(fn) { onChange = fn; }
function set(patch) { Object.assign(cloud, patch); onChange(cloud); }

export async function initCloud() {
  if (!cloud.enabled) return;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    cloud.client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data } = await cloud.client.auth.getSession();
    await applySession(data.session);
    cloud.client.auth.onAuthStateChange((_e, session) => { applySession(session); });
    set({ status: cloud.user ? 'signed-in' : 'signed-out' });
  } catch (e) { set({ status: 'error', error: e.message }); }
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
export async function signOut() { await cloud.client.auth.signOut(); cloud.user = null; cloud.plan = null; set({ status: 'signed-out' }); }

async function loadEntitlement() {
  const { data } = await cloud.client.from('entitlements').select('plan, expires_at').eq('user_id', cloud.user.id).maybeSingle();
  cloud.plan = data && (!data.expires_at || new Date(data.expires_at) > new Date()) ? data.plan : null;
  cloud.planExpires = data?.expires_at || null;
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
let pushTimer = null;
export function pushStateSoon(getState) {
  if (!cloud.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushState(getState()), 1500);
}
export async function pushState(state) {
  if (!cloud.user) return;
  const { error } = await cloud.client.from('user_state').upsert({ user_id: cloud.user.id, data: state, updated_at: new Date().toISOString() });
  if (error) set({ status: 'error', error: error.message }); else set({ lastSync: new Date().toISOString(), error: null });
}
