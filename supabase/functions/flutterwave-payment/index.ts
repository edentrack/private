import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
// Must match FIXED_PRICES in src/utils/regionalPayment.ts exactly.
const MIN_AMOUNTS: Record<string, Record<string, number>> = {
  monthly: {
    'pro:USD': 12,    'enterprise:USD': 35,    'industry:USD': 89,
    'pro:NGN': 19000, 'enterprise:NGN': 56000,  'industry:NGN': 145000,
    'pro:GHS': 180,   'enterprise:GHS': 549,    'industry:GHS': 1445,
    'pro:KES': 1550,  'enterprise:KES': 4700,   'industry:KES': 12200,
    'pro:ZAR': 220,   'enterprise:ZAR': 650,    'industry:ZAR': 1670,
    'pro:UGX': 44500, 'enterprise:UGX': 133000, 'industry:UGX': 356000,
    'pro:TZS': 32500, 'enterprise:TZS': 95700,  'industry:TZS': 244900,
    'pro:RWF': 16300, 'enterprise:RWF': 49000,  'industry:RWF': 129000,
    'pro:XAF': 7500,  'enterprise:XAF': 21000,  'industry:XAF': 53000,
    'pro:XOF': 7500,  'enterprise:XOF': 21000,  'industry:XOF': 53000,
    'pro:EGP': 565,   'enterprise:EGP': 1775,   'industry:EGP': 4560,
    'pro:MAD': 120,   'enterprise:MAD': 378,    'industry:MAD': 979,
    'pro:ZMW': 318,   'enterprise:ZMW': 1004,   'industry:ZMW': 2670,
    'pro:EUR': 10.99, 'enterprise:EUR': 32.99,  'industry:EUR': 81.99,
    'pro:GBP': 9.99,  'enterprise:GBP': 27.99,  'industry:GBP': 69.99,
  },
  quarterly: {
    'pro:USD': 30,    'enterprise:USD': 87,    'industry:USD': 222,
    'pro:NGN': 48000, 'enterprise:NGN': 139000, 'industry:NGN': 355000,
    'pro:GHS': 460,   'enterprise:GHS': 1342,   'industry:GHS': 3440,
    'pro:KES': 4000,  'enterprise:KES': 11400,  'industry:KES': 28900,
    'pro:ZAR': 560,   'enterprise:ZAR': 1616,   'industry:ZAR': 4100,
    'pro:UGX': 110000,'enterprise:UGX': 323000, 'industry:UGX': 832000,
    'pro:TZS': 80000, 'enterprise:TZS': 231000, 'industry:TZS': 588000,
    'pro:RWF': 40000, 'enterprise:RWF': 117000, 'industry:RWF': 300000,
    'pro:XAF': 18000, 'enterprise:XAF': 52000,  'industry:XAF': 132000,
    'pro:XOF': 18000, 'enterprise:XOF': 52000,  'industry:XOF': 132000,
    'pro:EGP': 1440,  'enterprise:EGP': 4180,   'industry:EGP': 10660,
    'pro:MAD': 300,   'enterprise:MAD': 870,    'industry:MAD': 2220,
    'pro:ZMW': 810,   'enterprise:ZMW': 2349,   'industry:ZMW': 5994,
    'pro:EUR': 27.99, 'enterprise:EUR': 79.99,  'industry:EUR': 204.99,
    'pro:GBP': 24.99, 'enterprise:GBP': 69.99,  'industry:GBP': 174.99,
  },
  yearly: {
    'pro:USD': 108,    'enterprise:USD': 300,    'industry:USD': 800,
    'pro:NGN': 173000, 'enterprise:NGN': 483000, 'industry:NGN': 1285000,
    'pro:GHS': 1642,   'enterprise:GHS': 4670,   'industry:GHS': 12360,
    'pro:KES': 14000,  'enterprise:KES': 39000,  'industry:KES': 104000,
    'pro:ZAR': 1990,   'enterprise:ZAR': 5610,   'industry:ZAR': 14790,
    'pro:UGX': 400000, 'enterprise:UGX': 1122000,'industry:UGX': 3030000,
    'pro:TZS': 285000, 'enterprise:TZS': 801000, 'industry:TZS': 2121000,
    'pro:RWF': 145000, 'enterprise:RWF': 404000, 'industry:RWF': 1079000,
    'pro:XAF': 65000,  'enterprise:XAF': 180000, 'industry:XAF': 480000,
    'pro:XOF': 65000,  'enterprise:XOF': 180000, 'industry:XOF': 480000,
    'pro:EGP': 5180,   'enterprise:EGP': 14400,  'industry:EGP': 38400,
    'pro:MAD': 1080,   'enterprise:MAD': 3000,   'industry:MAD': 8000,
    'pro:ZMW': 2916,   'enterprise:ZMW': 8100,   'industry:ZMW': 21598,
    'pro:EUR': 99.99,  'enterprise:EUR': 274.99, 'industry:EUR': 739.99,
    'pro:GBP': 89.99,  'enterprise:GBP': 239.99, 'industry:GBP': 639.99,
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

  // Validate amount is at least the minimum for this plan/billing_period/currency
  const periodMins = MIN_AMOUNTS[billing_period] ?? MIN_AMOUNTS.quarterly;
  const minKey = `${plan}:${currency}`;
  const minUsdKey = `${plan}:USD`;
  const minimum = (periodMins as Record<string, number>)[minKey] ?? (periodMins as Record<string, number>)[minUsdKey] ?? 30;
  const amount = typeof clientAmount === 'number' && clientAmount >= minimum
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
