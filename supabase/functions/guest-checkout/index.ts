import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY")!;
const FLW_SECRET = Deno.env.get("FLW_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://edentrack.app";

// Stripe prices (USD cents)
const STRIPE_PRICES: Record<string, Record<string, number>> = {
  monthly:   { pro: 699,  enterprise: 1499 },
  quarterly: { pro: 1499, enterprise: 3499 },
  yearly:    { pro: 4999, enterprise: 11499 },
};

// Flutterwave prices (local currency units) — mirrors FIXED_PRICES in regionalPayment.ts
const FLW_PRICES: Record<string, Record<string, Record<string, number>>> = {
  NGN: { monthly: { pro: 11000, enterprise: 24000 }, quarterly: { pro: 24000, enterprise: 56000 }, yearly: { pro: 80000, enterprise: 185000 } },
  GHS: { monthly: { pro: 105,   enterprise: 235   }, quarterly: { pro: 230,   enterprise: 540   }, yearly: { pro: 760,   enterprise: 1790  } },
  KES: { monthly: { pro: 900,   enterprise: 2000  }, quarterly: { pro: 2000,  enterprise: 4600  }, yearly: { pro: 6500,  enterprise: 15000 } },
  ZAR: { monthly: { pro: 129,   enterprise: 279   }, quarterly: { pro: 280,   enterprise: 650   }, yearly: { pro: 920,   enterprise: 2150  } },
  UGX: { monthly: { pro: 26000, enterprise: 57000 }, quarterly: { pro: 55000, enterprise: 130000 }, yearly: { pro: 185000, enterprise: 430000 } },
  TZS: { monthly: { pro: 19000, enterprise: 41000 }, quarterly: { pro: 40000, enterprise: 93000  }, yearly: { pro: 132000, enterprise: 307000 } },
  RWF: { monthly: { pro: 9500,  enterprise: 21000 }, quarterly: { pro: 20000, enterprise: 47000  }, yearly: { pro: 67000,  enterprise: 155000 } },
  XAF: { monthly: { pro: 4500,  enterprise: 10000 }, quarterly: { pro: 9000,  enterprise: 21000  }, yearly: { pro: 30000,  enterprise: 69000  } },
  XOF: { monthly: { pro: 4500,  enterprise: 10000 }, quarterly: { pro: 9000,  enterprise: 21000  }, yearly: { pro: 30000,  enterprise: 69000  } },
  EGP: { monthly: { pro: 330,   enterprise: 760   }, quarterly: { pro: 720,   enterprise: 1680  }, yearly: { pro: 2400,  enterprise: 5520  } },
  MAD: { monthly: { pro: 70,    enterprise: 162   }, quarterly: { pro: 150,   enterprise: 350   }, yearly: { pro: 500,   enterprise: 1150  } },
  USD: { monthly: { pro: 699,   enterprise: 1499  }, quarterly: { pro: 1499,  enterprise: 3499  }, yearly: { pro: 4999,  enterprise: 11499 } },
};

const PLAN_NAMES: Record<string, string> = { pro: "Grower", enterprise: "Farm Boss" };
const BILLING_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status = 200, h: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...h, "Content-Type": "application/json" },
  });
}

function emailToName(email: string): string {
  const prefix = email.split("@")[0];
  return prefix.replace(/[._\-+]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim() || "Farmer";
}

async function findOrCreateUser(
  supabase: ReturnType<typeof createClient>,
  email: string
): Promise<{ userId: string; stripeCustomerId: string; fullName: string }> {
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, stripe_customer_id, full_name")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile) {
    return {
      userId: existingProfile.id,
      stripeCustomerId: existingProfile.stripe_customer_id || "",
      fullName: existingProfile.full_name || emailToName(email),
    };
  }

  const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: emailToName(email) },
  });

  if (createErr || !newUser?.user) {
    throw new Error(createErr?.message || "Could not create account");
  }

  const userId = newUser.user.id;
  const fullName = emailToName(email);

  await supabase.from("profiles").upsert(
    { id: userId, full_name: fullName, email, account_status: "active", subscription_tier: "free", onboarding_completed: false },
    { onConflict: "id" }
  );

  return { userId, stripeCustomerId: "", fullName };
}

async function sendPasswordResetEmail(supabase: ReturnType<typeof createClient>, userId: string) {
  try {
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
    if (profile?.email) {
      await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_SERVICE_KEY },
        body: JSON.stringify({ email: profile.email }),
      });
    }
  } catch {}
}

Deno.serve(async (req: Request) => {
  const h = cors();
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: h });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, h);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const body = await req.json();
  const { action } = body;

  // ── Stripe: no email needed, Stripe collects it ───────────────────────
  if (action === "create_session" && body.gateway !== "flutterwave") {
    const { plan, billing_period = "quarterly" } = body;
    if (!plan) return json({ error: "plan is required" }, 400, h);

    const amountCents = STRIPE_PRICES[billing_period]?.[plan];
    if (!amountCents) return json({ error: "Invalid plan or billing period" }, 400, h);
    if (!STRIPE_SECRET) return json({ error: "Stripe not configured" }, 503, h);

    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-04-10" });
    const months = BILLING_MONTHS[billing_period] ?? 3;
    const planName = PLAN_NAMES[plan] ?? plan;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          recurring: { interval: "month", interval_count: months },
          product_data: { name: `Edentrack ${planName}`, description: `${months}-month subscription — auto-renews` },
        },
        quantity: 1,
      }],
      subscription_data: { metadata: { plan, billing_period } },
      success_url: `${APP_URL}/?stripe_session={CHECKOUT_SESSION_ID}&guest=1`,
      cancel_url: `${APP_URL}/`,
      metadata: { plan, billing_period },
    });

    return json({ url: session.url }, 200, h);
  }

  // ── Flutterwave: email required ───────────────────────────────────────
  if (action === "create_session" && body.gateway === "flutterwave") {
    const { email, plan, billing_period = "quarterly", currency = "NGN" } = body;
    if (!email || !plan) return json({ error: "email and plan are required" }, 400, h);
    if (!FLW_SECRET) return json({ error: "Flutterwave not configured" }, 503, h);

    const cur = currency.toUpperCase();
    const amount = FLW_PRICES[cur]?.[billing_period]?.[plan] ?? FLW_PRICES.USD[billing_period]?.[plan];
    if (!amount) return json({ error: "Invalid plan or currency" }, 400, h);

    const { userId, fullName } = await findOrCreateUser(supabase, email);

    const months = BILLING_MONTHS[billing_period] ?? 3;
    const planName = PLAN_NAMES[plan] ?? plan;
    const reference = `edentrack-fw-${userId.substring(0, 8)}-${Date.now()}`;
    const billingLabel = months === 1 ? "1 month" : `${months} months`;

    await supabase.from("payments").insert({
      user_id: userId,
      processor: "flutterwave",
      reference,
      plan,
      billing_period,
      amount_usd: STRIPE_PRICES[billing_period]?.[plan] ? STRIPE_PRICES[billing_period][plan] / 100 : 0,
      currency: cur,
      status: "pending",
    });

    const flwRes = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${FLW_SECRET}` },
      body: JSON.stringify({
        tx_ref: reference,
        amount,
        currency: cur,
        redirect_url: `${APP_URL}/?guest=1`,
        customer: { email, name: fullName },
        customizations: {
          title: `Edentrack ${planName}`,
          description: `${billingLabel} farm management subscription`,
          logo: `${APP_URL}/logo.png`,
        },
        meta: { user_id: userId, plan, billing_period },
      }),
    });
    const flwData = await flwRes.json();

    if (flwData.status !== "success" || !flwData.data?.link) {
      console.error("[guest-checkout] Flutterwave init error:", flwData);
      return json({ error: flwData.message || "Payment init failed" }, 500, h);
    }

    return json({ url: flwData.data.link }, 200, h);
  }

  // ── Verify Stripe payment ─────────────────────────────────────────────
  if (action === "verify") {
    const { session_id } = body;
    if (!session_id) return json({ error: "session_id is required" }, 400, h);
    if (!STRIPE_SECRET) return json({ error: "Stripe not configured" }, 503, h);

    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-04-10" });
    const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ["subscription", "customer"] });

    if (session.payment_status !== "paid" && session.status !== "complete") {
      return json({ error: "Payment not complete" }, 400, h);
    }

    const email = session.customer_details?.email;
    if (!email) return json({ error: "No email in session" }, 400, h);

    const plan = session.metadata?.plan;
    const billing_period = session.metadata?.billing_period ?? "quarterly";
    if (!plan) return json({ error: "No plan in session metadata" }, 400, h);

    const { data: existingPayment } = await supabase.from("payments").select("id, status").eq("processor_ref", session_id).maybeSingle();
    if (existingPayment?.status === "completed") return json({ success: true, already: true }, 200, h);

    const { userId, stripeCustomerId } = await findOrCreateUser(supabase, email);

    const months = BILLING_MONTHS[billing_period] ?? 3;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const sub = session.subscription as any;
    const customerId = typeof session.customer === "string" ? session.customer : (session.customer as any)?.id ?? null;

    await Promise.all([
      supabase.from("profiles").update({
        subscription_tier: plan,
        subscription_expires_at: expiresAt.toISOString(),
        billing_period,
        stripe_customer_id: customerId || stripeCustomerId || undefined,
        stripe_subscription_id: sub?.id || undefined,
        cancel_at_period_end: false,
      }).eq("id", userId),
      supabase.from("payments").insert({
        user_id: userId,
        processor: "stripe",
        reference: `edentrack-st-${userId.substring(0, 8)}-${Date.now()}`,
        plan, billing_period,
        amount_usd: (STRIPE_PRICES[billing_period]?.[plan] ?? 0) / 100,
        currency: "USD",
        status: "completed",
        paid_at: new Date().toISOString(),
        processor_ref: session_id,
      }),
    ]);

    await sendPasswordResetEmail(supabase, userId);
    return json({ success: true }, 200, h);
  }

  // ── Verify Flutterwave payment ────────────────────────────────────────
  if (action === "verify_flutterwave") {
    const { transaction_id, tx_ref } = body;
    if (!transaction_id || !tx_ref) return json({ error: "transaction_id and tx_ref are required" }, 400, h);
    if (!FLW_SECRET) return json({ error: "Flutterwave not configured" }, 503, h);

    const { data: payment } = await supabase.from("payments").select("*").eq("reference", tx_ref).maybeSingle();
    if (!payment) return json({ error: "Payment record not found" }, 404, h);
    if (payment.status === "completed") return json({ success: true, already: true }, 200, h);

    const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: { Authorization: `Bearer ${FLW_SECRET}` },
    });
    const verifyData = await verifyRes.json();

    if (verifyData.data?.status !== "successful") {
      return json({ error: "Payment not successful", status: verifyData.data?.status }, 400, h);
    }

    const months = BILLING_MONTHS[payment.billing_period] ?? 3;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    await Promise.all([
      supabase.from("profiles").update({
        subscription_tier: payment.plan,
        subscription_expires_at: expiresAt.toISOString(),
        billing_period: payment.billing_period,
        cancel_at_period_end: false,
      }).eq("id", payment.user_id),
      supabase.from("payments").update({
        status: "completed",
        paid_at: new Date().toISOString(),
        processor_ref: String(transaction_id),
      }).eq("reference", tx_ref),
    ]);

    await sendPasswordResetEmail(supabase, payment.user_id);
    return json({ success: true }, 200, h);
  }

  return json({ error: "Unknown action" }, 400, h);
});
