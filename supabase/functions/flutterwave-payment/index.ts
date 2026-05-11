import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCurrentDiscountPct, applyDiscount, decimalsFor } from '../_shared/pricingDiscount.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FLW_SECRET_KEY = Deno.env.get('FLW_SECRET_KEY');
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://edentrack.app';

if (!FLW_SECRET_KEY) {
  console.warn('[flutterwave-payment] FLW_SECRET_KEY not set — payments will not work');
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowed =
    origin === ALLOWED_ORIGIN ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Minimum amounts per plan/billing_period/currency to guard against manipulation.
// MUST match FIXED_PRICES in src/utils/regionalPayment.ts exactly.
// USD ladder: $7 / $19 / $49 monthly (Grower / Farm Boss / Industry).
const MIN_AMOUNTS: Record<string, Record<string, number>> = {
  monthly: {
    'pro:USD': 7,     'enterprise:USD': 19,    'industry:USD': 49,
    'pro:NGN': 11000, 'enterprise:NGN': 32000, 'industry:NGN': 84000,
    'pro:GHS': 105,   'enterprise:GHS': 320,   'industry:GHS': 840,
    'pro:KES': 900,   'enterprise:KES': 2700,  'industry:KES': 7100,
    'pro:ZAR': 130,   'enterprise:ZAR': 380,   'industry:ZAR': 970,
    'pro:UGX': 26000, 'enterprise:UGX': 77000, 'industry:UGX': 207000,
    'pro:TZS': 19000, 'enterprise:TZS': 55000, 'industry:TZS': 142000,
    'pro:RWF': 9500,  'enterprise:RWF': 28000, 'industry:RWF': 75000,
    'pro:XAF': 4500,  'enterprise:XAF': 12000, 'industry:XAF': 30000,
    'pro:XOF': 4500,  'enterprise:XOF': 12000, 'industry:XOF': 30000,
    'pro:EGP': 330,   'enterprise:EGP': 1000,  'industry:EGP': 2640,
    'pro:MAD': 70,    'enterprise:MAD': 220,   'industry:MAD': 570,
    'pro:ZMW': 185,   'enterprise:ZMW': 580,   'industry:ZMW': 1550,
    'pro:EUR': 6.99,  'enterprise:EUR': 17.99, 'industry:EUR': 47.99,
    'pro:GBP': 5.99,  'enterprise:GBP': 14.99, 'industry:GBP': 39.99,
  },
  quarterly: {
    'pro:USD': 18,    'enterprise:USD': 50,    'industry:USD': 130,
    'pro:NGN': 28000, 'enterprise:NGN': 80000, 'industry:NGN': 205000,
    'pro:GHS': 270,   'enterprise:GHS': 780,   'industry:GHS': 2000,
    'pro:KES': 2300,  'enterprise:KES': 6600,  'industry:KES': 16800,
    'pro:ZAR': 325,   'enterprise:ZAR': 935,   'industry:ZAR': 2380,
    'pro:UGX': 64000, 'enterprise:UGX': 187000,'industry:UGX': 482000,
    'pro:TZS': 46000, 'enterprise:TZS': 134000,'industry:TZS': 341000,
    'pro:RWF': 23000, 'enterprise:RWF': 68000, 'industry:RWF': 174000,
    'pro:XAF': 11000, 'enterprise:XAF': 30000, 'industry:XAF': 77000,
    'pro:XOF': 11000, 'enterprise:XOF': 30000, 'industry:XOF': 77000,
    'pro:EGP': 835,   'enterprise:EGP': 2400,  'industry:EGP': 6180,
    'pro:MAD': 175,   'enterprise:MAD': 505,   'industry:MAD': 1290,
    'pro:ZMW': 470,   'enterprise:ZMW': 1360,  'industry:ZMW': 3475,
    'pro:EUR': 16.99, 'enterprise:EUR': 45.99, 'industry:EUR': 119.99,
    'pro:GBP': 14.99, 'enterprise:GBP': 39.99, 'industry:GBP': 99.99,
  },
  yearly: {
    'pro:USD': 60,     'enterprise:USD': 180,    'industry:USD': 480,
    'pro:NGN': 100000, 'enterprise:NGN': 280000, 'industry:NGN': 745000,
    'pro:GHS': 950,    'enterprise:GHS': 2700,   'industry:GHS': 7200,
    'pro:KES': 8100,   'enterprise:KES': 22600,  'industry:KES': 60300,
    'pro:ZAR': 1155,   'enterprise:ZAR': 3250,   'industry:ZAR': 8580,
    'pro:UGX': 232000, 'enterprise:UGX': 651000, 'industry:UGX': 1757000,
    'pro:TZS': 165000, 'enterprise:TZS': 465000, 'industry:TZS': 1230000,
    'pro:RWF': 84000,  'enterprise:RWF': 234000, 'industry:RWF': 626000,
    'pro:XAF': 39000,  'enterprise:XAF': 108000, 'industry:XAF': 285000,
    'pro:XOF': 39000,  'enterprise:XOF': 108000, 'industry:XOF': 285000,
    'pro:EGP': 3000,   'enterprise:EGP': 8350,   'industry:EGP': 22270,
    'pro:MAD': 625,    'enterprise:MAD': 1740,   'industry:MAD': 4640,
    'pro:ZMW': 1690,   'enterprise:ZMW': 4700,   'industry:ZMW': 12525,
    'pro:EUR': 59.99,  'enterprise:EUR': 159.99, 'industry:EUR': 429.99,
    'pro:GBP': 53.99,  'enterprise:GBP': 139.99, 'industry:GBP': 369.99,
  },
};

const BILLING_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

const PLAN_DISPLAY: Record<string, string> = { pro: 'Grower', enterprise: 'Farm Boss', industry: 'Industry' };

serve(async (req) => {
  const ch = corsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: ch });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401, headers: { ...ch, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...ch, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/.*flutterwave-payment\/?/, '');

  try {
    if (path === 'create' || path === '') {
      return await handleCreate(req, user, supabase, ch);
    }
    if (path === 'verify') {
      return await handleVerify(req, user, supabase, ch);
    }
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404, headers: { ...ch, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[flutterwave-payment] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...ch, 'Content-Type': 'application/json' },
    });
  }
});

async function handleCreate(req: Request, user: any, supabase: any, ch: Record<string, string>) {
  const body = await req.json().catch(() => ({}));
  const {
    plan,
    currency = 'USD',
    amount: clientAmount,
    billing_period = 'quarterly',
    redirect_url,
  } = body;

  if (!plan || !PLAN_DISPLAY[plan]) {
    return err('Invalid plan', 400, ch);
  }
  if (!FLW_SECRET_KEY) {
    return err('Payment system not configured. Contact support.', 503, ch);
  }

  // Validate amount is at least the minimum for this plan/billing_period/currency.
  // Pulls the live discount % from pricing_settings and relaxes the
  // minimum by that amount, so users actually CAN pay the discounted
  // price the client showed them. 1% rounding tolerance below.
  const periodMins = MIN_AMOUNTS[billing_period] ?? MIN_AMOUNTS.quarterly;
  const minKey = `${plan}:${currency}`;
  const minUsdKey = `${plan}:USD`;
  const baselineMin = (periodMins as Record<string, number>)[minKey] ?? (periodMins as Record<string, number>)[minUsdKey] ?? 30;
  const discountPct = await getCurrentDiscountPct(supabase);
  const minimum = applyDiscount(baselineMin, discountPct, decimalsFor(currency));
  const amount = typeof clientAmount === 'number' && clientAmount >= minimum * 0.99
    ? clientAmount
    : minimum;

  const tx_ref = `edentrack-${user.id}-${Date.now()}`;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single();

  await supabase.from('payments').insert({
    user_id: user.id,
    tx_ref,
    amount,
    currency,
    plan,
    billing_period,
    status: 'pending',
    processor: 'flutterwave',
  });

  const billingLabel = billing_period === 'yearly' ? '12 months' : billing_period === 'monthly' ? '1 month' : '3 months';
  const flwPayload = {
    tx_ref,
    amount,
    currency,
    redirect_url: redirect_url || 'https://edentrack.app/#/billing/callback',
    customer: {
      email: profile?.email || user.email,
      name: profile?.full_name || 'Edentrack User',
    },
    customizations: {
      title: 'Edentrack',
      description: `${PLAN_DISPLAY[plan] ?? plan} Plan — ${billingLabel}`,
      logo: 'https://edentrack.app/logo.png',
    },
    meta: { user_id: user.id, plan, billing_period },
  };

  const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FLW_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(flwPayload),
  });

  const flwData = await flwRes.json();

  if (flwData.status !== 'success') {
    console.error('[flutterwave-payment] Create error:', flwData);
    return err('Failed to create payment. Try again.', 502, ch);
  }

  return ok({ payment_link: flwData.data.link, tx_ref }, ch);
}

async function handleVerify(req: Request, user: any, supabase: any, ch: Record<string, string>) {
  const body = await req.json().catch(() => ({}));
  const { transaction_id, tx_ref } = body;

  if (!transaction_id && !tx_ref) {
    return err('transaction_id or tx_ref required', 400, ch);
  }
  if (!FLW_SECRET_KEY) {
    return err('Payment system not configured', 503, ch);
  }

  const { data: payment, error: paymentErr } = await supabase
    .from('payments')
    .select('*')
    .eq('tx_ref', tx_ref)
    .eq('user_id', user.id)
    .single();

  if (paymentErr || !payment) {
    return err('Payment record not found', 404, ch);
  }

  // Idempotency: already processed — return without re-running rewards/subscription logic
  if (payment.status === 'successful') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_expires_at')
      .eq('id', user.id)
      .single();
    return ok({ success: true, plan: payment.plan, expires_at: profile?.subscription_expires_at }, ch);
  }

  const verifyRes = await fetch(
    `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
    { headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` } }
  );
  const verifyData = await verifyRes.json();

  if (
    verifyData.status !== 'success' ||
    verifyData.data.status !== 'successful' ||
    verifyData.data.tx_ref !== tx_ref ||
    verifyData.data.amount < payment.amount ||
    verifyData.data.currency !== payment.currency
  ) {
    await supabase
      .from('payments')
      .update({ status: 'failed', flutterwave_data: verifyData, updated_at: new Date().toISOString() })
      .eq('tx_ref', tx_ref);
    return err('Payment verification failed', 400, ch);
  }

  await supabase
    .from('payments')
    .update({
      status: 'successful',
      flw_ref: verifyData.data.flw_ref,
      flutterwave_data: verifyData.data,
      updated_at: new Date().toISOString(),
    })
    .eq('tx_ref', tx_ref);

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_expires_at')
    .eq('id', user.id)
    .single();

  const months = BILLING_MONTHS[payment.billing_period] ?? 3;
  const base = profile?.subscription_expires_at && new Date(profile.subscription_expires_at) > new Date()
    ? new Date(profile.subscription_expires_at)
    : new Date();
  base.setMonth(base.getMonth() + months);

  // Save card token for future auto-renewals (card payments only)
  const card = verifyData.data?.card;
  const profileUpdate: Record<string, unknown> = {
    subscription_tier: payment.plan,
    subscription_expires_at: base.toISOString(),
    billing_period: payment.billing_period || 'quarterly',
    renewal_failure_count: 0,
    updated_at: new Date().toISOString(),
  };
  if (card?.token) {
    profileUpdate.flw_card_token = card.token;
    profileUpdate.flw_card_last4 = card.last_4digits || null;
    profileUpdate.flw_card_expiry = card.expiry || null;
    profileUpdate.flw_card_currency = payment.currency || 'USD';
  }

  await supabase.from('profiles').update(profileUpdate).eq('id', user.id);

  // Reward referral on first ever successful payment
  const { count: priorPayments } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'successful')
    .neq('tx_ref', tx_ref);
  if (priorPayments === 0) {
    await supabase.rpc('reward_referral', { p_referred_user_id: user.id });
  }

  // Send "set your password" email for new checkout signups (account < 1 hour old)
  try {
    const userAge = Date.now() - new Date((user as any).created_at || 0).getTime();
    if (userAge < 3_600_000) {
      await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_ROLE_KEY },
        body: JSON.stringify({ email: user.email }),
      });
    }
  } catch {}

  return ok({ success: true, plan: payment.plan, expires_at: base.toISOString() }, ch);
}

function ok(data: unknown, ch: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...ch, 'Content-Type': 'application/json' },
  });
}

function err(message: string, status: number, ch: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...ch, 'Content-Type': 'application/json' },
  });
}
