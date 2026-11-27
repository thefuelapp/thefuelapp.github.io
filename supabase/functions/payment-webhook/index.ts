// Supabase Edge Function: Stripe webhook. On checkout.session.completed, grant lifetime access to the buyer, then (since 3 Oct 2026)
// record the sale for the creator whose code they came with (supabase/growth.sql: record_purchase). On charge.refunded, cancel that
// creator's commission if it hasn't been paid out (void_purchase). The unlock never waits on, or fails because of, the commission step.
// Deploy:  npx supabase functions deploy payment-webhook --no-verify-jwt --project-ref htdmdthyrehhvzflajuk
// Secrets: npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref htdmdthyrehhvzflajuk
//          (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to functions automatically.)
// The app sends the buyer to the Payment Link with ?client_reference_id=<supabase user id>&prefilled_email=<email>,
// so the session carries the user id. If it's missing, we fall back to matching the email.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function verifyStripe(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
  const sig = req.headers.get('stripe-signature') || '';
  // The header is "t=…,v1=…" and can carry more than one v1 (Stripe sends two while a signing secret is being rolled).
  const pairs = sig.split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; });
  const t = pairs.find(([k]) => k === 't')?.[1]; const v1s = pairs.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!secret.startsWith('whsec_')) console.log(JSON.stringify({ problem: 'STRIPE_WEBHOOK_SECRET is missing or the wrong kind of value' }));
  if (!secret || !t || !v1s.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // 5-minute replay window
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  // Compared without stopping at the first wrong character, so the time it takes gives nothing away.
  const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
  return v1s.some((v) => same(hex, v));
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const body = await req.text();
  if (!(await verifyStripe(req, body))) return new Response('bad signature', { status: 401 });
  let evt; try { evt = JSON.parse(body); } catch { return new Response('bad body', { status: 400 }); }
  if (evt.type === 'charge.refunded') {
    const ch = evt.data?.object || {}; const intent = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id;
    if (!intent || !/^pi_[A-Za-z0-9]+$/.test(String(intent))) return new Response('ignored');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await admin.rpc('void_purchase', { p_intent: String(intent) });
    // v102: a FULL refund also takes the access back (a part refund leaves it). The unlock row remembers which payment bought it.
    let removed = 0;
    if (ch.refunded === true) {
      const { data: gone, error: e3 } = await admin.from('entitlements').delete().like('source', `stripe:%|${intent}`).select('user_id');
      removed = gone?.length || 0; if (e3) console.log(JSON.stringify({ refund: true, removeError: e3.message }));
    }
    console.log(JSON.stringify({ refund: true, voided: data, accessRemoved: removed, error: error?.message || null }));
    return new Response('ok');
  }
  if (evt.type !== 'checkout.session.completed') return new Response('ignored');
  const s = evt.data?.object || {};
  if (s.payment_status && s.payment_status !== 'paid') return new Response('not paid');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Who paid: the account id the app put on the link, but only if it is a real account. Anything else falls back to the email on the receipt.
  let userId: string | null = typeof s.client_reference_id === 'string' && UUID.test(s.client_reference_id) ? s.client_reference_id : null;
  if (userId) { const { data, error } = await admin.auth.admin.getUserById(userId); if (error || !data?.user) userId = null; }
  const email: string | null = s.customer_details?.email || s.customer_email || null;
  if (!userId && email) {
    for (let page = 1; page <= 50 && !userId; page++) { // every account, a thousand at a time
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 }); const users = data?.users || [];
      userId = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())?.id || null;
      if (users.length < 1000) break;
    }
  }
  if (!userId) { console.log(JSON.stringify({ sale: s.id, problem: 'paid, but no account matches' })); return new Response('no matching user', { status: 202 }); }
  const intentId = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id || '';
  const { error } = await admin.from('entitlements').upsert({ user_id: userId, plan: 'lifetime', expires_at: null, source: `stripe:${s.id}|${intentId}`, updated_at: new Date().toISOString() });
  if (error) return new Response(error.message, { status: 500 });
  // Creator commission + the "paid" step. Best effort: a problem here is logged, never turned into a failed unlock.
  try {
    const intent = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id || null;
    const { data, error: e2 } = await admin.rpc('record_purchase', { p_user: userId, p_session: s.id, p_intent: intent, p_amount: s.amount_total ?? null });
    console.log(JSON.stringify({ sale: s.id, referral: data, error: e2?.message || null }));
  } catch (e) { console.log(JSON.stringify({ sale: s.id, referralError: String(e) })); }
  return new Response('ok');
});
