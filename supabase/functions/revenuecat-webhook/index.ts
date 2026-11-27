// DRAFT, NOT DEPLOYED, NOT TESTED AGAINST A REAL REVENUECAT EVENT (written 27 Nov 2026, before any RevenueCat account existed).
// Supabase Edge Function: RevenueCat webhook. When someone buys the lifetime unlock in the iPhone app, RevenueCat calls this and it
// writes the same row in `entitlements` that the Stripe webhook (payment-webhook) writes for a website purchase, so the account
// opens everywhere. A refund takes an in-app purchase back; it never touches access that came from Stripe, a code or the mates unlock.
//
// The app sets RevenueCat's app_user_id to the Supabase user id (app/iap.js: configure / logIn), so the event says whose it is.
//
// Deploy:  npx supabase functions deploy revenuecat-webhook --no-verify-jwt --project-ref htdmdthyrehhvzflajuk
// Secrets: npx supabase secrets set REVENUECAT_WEBHOOK_AUTH=<a long random string> --project-ref htdmdthyrehhvzflajuk
//          Put the SAME string in RevenueCat → Project → Integrations → Webhooks → "Authorization header value".
//          It is a secret: it lives only in Supabase's secrets and in RevenueCat. Never in this repo, never in config.js.
//          (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to functions automatically; the service key is never written down.)
// Optional: REVENUECAT_ENTITLEMENT (default 'lifetime'), REVENUECAT_ALLOW_SANDBOX=1 while testing with a sandbox Apple ID.
// Check the event fields below against RevenueCat's current webhook docs before going live: https://www.revenuecat.com/docs/integrations/webhooks
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const GRANT = new Set(['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);
const REFUND_REASONS = new Set(['CUSTOMER_SUPPORT']); // a CANCELLATION with this reason is a refund

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || secret.length < 20 || !same(got, secret)) return new Response('unauthorized', { status: 401 });
  let evt; try { evt = (await req.json())?.event; } catch { return new Response('bad body', { status: 400 }); }
  if (!evt?.type) return new Response('ignored');
  if (evt.type === 'TEST') return new Response('ok');
  if (evt.environment === 'SANDBOX' && Deno.env.get('REVENUECAT_ALLOW_SANDBOX') !== '1') return new Response('sandbox ignored');
  const want = Deno.env.get('REVENUECAT_ENTITLEMENT') || 'lifetime';
  const ents: string[] = evt.entitlement_ids || (evt.entitlement_id ? [evt.entitlement_id] : []);
  if (ents.length && !ents.includes(want)) return new Response('other entitlement');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Whose it is: the account id the app gave RevenueCat. An anonymous RevenueCat id ($RCAnonymousID:…) is not an account.
  const ids: string[] = [evt.app_user_id, evt.original_app_user_id, ...(evt.aliases || [])].filter((x) => typeof x === 'string' && UUID.test(x));
  let userId: string | null = null;
  for (const id of ids) { const { data, error } = await admin.auth.admin.getUserById(id); if (!error && data?.user) { userId = id; break; } }
  if (!userId) { console.log(JSON.stringify({ event: evt.id, type: evt.type, problem: 'no account matches' })); return new Response('no matching user', { status: 202 }); }
  const txn = String(evt.original_transaction_id || evt.transaction_id || evt.id || '');
  const { data: have } = await admin.from('entitlements').select('plan, source').eq('user_id', userId).maybeSingle();

  if (GRANT.has(evt.type)) {
    if (have && !String(have.source || '').startsWith('iap:')) return new Response('already unlocked another way'); // keep the Stripe / code / mates row as it is
    const { error } = await admin.from('entitlements').upsert({ user_id: userId, plan: 'lifetime', expires_at: null, source: `iap:${txn}`, updated_at: new Date().toISOString() });
    if (error) return new Response(error.message, { status: 500 }); // RevenueCat retries on a 5xx
    console.log(JSON.stringify({ event: evt.id, type: evt.type, granted: userId }));
    return new Response('ok');
  }
  if ((evt.type === 'CANCELLATION' && REFUND_REASONS.has(evt.cancel_reason)) || evt.type === 'EXPIRATION') {
    const { data: gone, error } = await admin.from('entitlements').delete().eq('user_id', userId).like('source', 'iap:%').select('user_id');
    if (error) return new Response(error.message, { status: 500 });
    console.log(JSON.stringify({ event: evt.id, type: evt.type, accessRemoved: gone?.length || 0 }));
    return new Response('ok');
  }
  // TRANSFER (a purchase moved to another account by Restore purchases) is left for a human for now: it is logged, nothing is changed.
  console.log(JSON.stringify({ event: evt.id, type: evt.type, note: 'not handled' }));
  return new Response('ignored');
});
