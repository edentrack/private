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
// Keys: `${plan}:${billing_period}:${currency}` — falls back to quarterly if period missing.
const MIN_AMOUNTS: Record<string, Record<string, Record<string, number>>> = {
  monthly: {
    'pro:USD': 6.99, 'enterprise:USD': 14.99,
    'pro:NGN': 11000, 'enterprise:NGN': 24000,
    'pro:GHS': 105, 'enterprise:GHS': 235,
    'pro:KES': 900, 'enterprise:KES': 2000,
    'pro:ZAR': 129, 'enterprise:ZAR': 279,
    'pro:UGX': 26000, 'enterprise:UGX': 57000,
    'pro:TZS': 19000, 'enterprise:TZS': 41000,
    'pro:RWF': 9500, 'enterprise:RWF': 21000,
    'pro:XAF': 4500, 'enterprise:XAF': 10000,
    'pro:XOF': 4500, 'enterprise:XOF': 10000,
    'pro:EGP': 330, 'enterprise:EGP': 760,
    'pro:MAD': 70, 'enterprise:MAD': 162,
    'pro:ZMW': 185, 'enterprise:ZMW': 430,
    'pro:EUR': 6.49, 'enterprise:EUR': 13.99,
    'pro:GBP': 5.99, 'enterprise:GBP': 11.99,
  } as Record<string, number>,
  quarterly: {
    'pro:USD': 14.99, 'enterprise:USD': 34.99,
    'pro:NGN': 24000, 'enterprise:NGN': 56000,
    'pro:GHS': 230, 'enterprise:GHS': 540,
    'pro:KES': 2000, 'enterprise:KES': 4600,
    'pro:ZAR': 280, 'enterprise:ZAR': 650,
    'pro:UGX': 55000, 'enterprise:UGX': 130000,
    'pro:TZS': 40000, 'enterprise:TZS': 93000,
    'pro:RWF': 20000, 'enterprise:RWF': 47000,
    'pro:XAF': 9000, 'enterprise:XAF': 21000,
    'pro:XOF': 9000, 'enterprise:XOF': 21000,
    'pro:EGP': 720, 'enterprise:EGP': 1680,
    'pro:MAD': 150, 'enterprise:MAD': 350,
    'pro:ZMW': 405, 'enterprise:ZMW': 945,
    'pro:EUR': 13.99, 'enterprise:EUR': 31.99,
    'pro:GBP': 11.99, 'enterprise:GBP': 27.99,
  } as Record<string, number>,
  yearly: {
    'pro:USD': 49.99, 'enterprise:USD': 114.99,
    'pro:NGN': 80000, 'enterprise:NGN': 185000,
    'pro:GHS': 760, 'enterprise:GHS': 1790,
    'pro:KES': 6500, 'enterprise:KES': 15000,
    'pro:ZAR': 920, 'enterprise:ZAR': 2150,
    'pro:UGX': 185000, 'enterprise:UGX': 430000,
    'pro:TZS': 132000, 'enterprise:TZS': 307000,
    'pro:RWF': 67000, 'enterprise:RWF': 155000,
    'pro:XAF': 30000, 'enterprise:XAF': 69000,
    'pro:XOF': 30000, 'enterprise:XOF': 69000,
    'pro:EGP': 2400, 'enterprise:EGP': 5520,
    'pro:MAD': 500, 'enterprise:MAD': 1150,
    'pro:ZMW': 1350, 'enterprise:ZMW': 3105,
    'pro:EUR': 45.99, 'enterprise:EUR': 104.99,
    'pro:GBP': 39.99, 'enterprise:GBP': 91.99,
  } as Record<string, number>,
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
  const minimum = (periodMins as Record<string, number>)[minKey] ?? (periodMins as Record<string, number>)[minUsdKey] ?? 14.99;
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
