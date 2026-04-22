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

// Quarterly prices per plan (USD)
const PLAN_PRICES: Record<string, { amount: number; display_name: string }> = {
  pro: { amount: 9.00, display_name: 'Grower' },
  enterprise: { amount: 21.00, display_name: 'Farm Boss' },
};

// How many months a quarterly subscription extends
const QUARTERLY_MONTHS = 3;

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

  // Verify caller JWT
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
      return await handleCreate(req, user, supabase);
    }
    if (path === 'verify') {
      return await handleVerify(req, user, supabase);
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

async function handleCreate(req: Request, user: any, supabase: any) {
  const body = await req.json().catch(() => ({}));
  const { plan, currency = 'USD', redirect_url } = body;

  if (!plan || !PLAN_PRICES[plan]) {
    return jsonError('Invalid plan. Must be "pro" or "enterprise"', 400);
  }
  if (!FLW_SECRET_KEY) {
    return jsonError('Payment system not configured. Contact support.', 503);
  }

  const planInfo = PLAN_PRICES[plan];
  const tx_ref = `edentrack-${user.id}-${Date.now()}`;

  // Get user profile for name/email
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single();

  // Record pending payment
  await supabase.from('payments').insert({
    user_id: user.id,
    tx_ref,
    amount: planInfo.amount,
    currency,
    plan,
    billing_period: 'quarterly',
    status: 'pending',
  });

  // Call Flutterwave to create payment link
  const flwPayload = {
    tx_ref,
    amount: planInfo.amount,
    currency,
    redirect_url: redirect_url || 'https://edentrack.app/#/billing/callback',
    customer: {
      email: profile?.email || user.email,
      name: profile?.full_name || 'Edentrack User',
    },
    customizations: {
      title: 'Edentrack',
      description: `${planInfo.display_name} Plan — 3 months`,
      logo: 'https://edentrack.app/logo.png',
    },
    meta: {
      user_id: user.id,
      plan,
    },
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
    return jsonError('Failed to create payment. Try again.', 502);
  }

  return json({ payment_link: flwData.data.link, tx_ref });
}

async function handleVerify(req: Request, user: any, supabase: any) {
  const body = await req.json().catch(() => ({}));
  const { transaction_id, tx_ref } = body;

  if (!transaction_id && !tx_ref) {
    return jsonError('transaction_id or tx_ref required', 400);
  }
  if (!FLW_SECRET_KEY) {
    return jsonError('Payment system not configured', 503);
  }

  // Look up pending payment
  const { data: payment, error: paymentErr } = await supabase
    .from('payments')
    .select('*')
    .eq('tx_ref', tx_ref)
    .eq('user_id', user.id)
    .single();

  if (paymentErr || !payment) {
    return jsonError('Payment record not found', 404);
  }

  // Verify with Flutterwave
  const verifyRes = await fetch(
    `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
    {
      headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` },
    }
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
    return jsonError('Payment verification failed', 400);
  }

  // Payment is good — update record + extend subscription
  const flw_ref = verifyData.data.flw_ref;
  await supabase
    .from('payments')
    .update({
      status: 'successful',
      flw_ref,
      flutterwave_data: verifyData.data,
      updated_at: new Date().toISOString(),
    })
    .eq('tx_ref', tx_ref);

  // Extend subscription: if user already has a future expiry, extend from there; else extend from now
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_expires_at, subscription_tier')
    .eq('id', user.id)
    .single();

  const base = profile?.subscription_expires_at && new Date(profile.subscription_expires_at) > new Date()
    ? new Date(profile.subscription_expires_at)
    : new Date();

  base.setMonth(base.getMonth() + QUARTERLY_MONTHS);
  const new_expires_at = base.toISOString();

  await supabase
    .from('profiles')
    .update({
      subscription_tier: payment.plan,
      subscription_expires_at: new_expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  return json({
    success: true,
    plan: payment.plan,
    expires_at: new_expires_at,
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...ch, 'Content-Type': 'application/json' },
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...ch, 'Content-Type': 'application/json' },
  });
}
