import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://edentrack.app";
const APP_URL = Deno.env.get("APP_URL") || "https://edentrack.app";

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const ok = origin === ALLOWED_ORIGIN || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data: unknown, status = 200, h: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers: { ...h, "Content-Type": "application/json" } });
}

// Prices in smallest currency unit (cents for USD/EUR/GBP, pence, etc.)
const PRICES_USD_CENTS: Record<string, Record<string, number>> = {
  quarterly: { pro: 1499, enterprise: 3499, industry: 9999 },
  yearly:    { pro: 4999, enterprise: 11499, industry: 32999 },
};

const PRICES_LOCAL: Record<string, Record<string, Record<string, number>>> = {
  gbp: { quarterly: { pro: 1199, enterprise: 2799, industry: 7999  }, yearly: { pro: 3999, enterprise: 9199,  industry: 25999 } },
  eur: { quarterly: { pro: 1399, enterprise: 3199, industry: 9199  }, yearly: { pro: 4599, enterprise: 10499, industry: 29999 } },
  cad: { quarterly: { pro: 2099, enterprise: 4799, industry: 13799 }, yearly: { pro: 6899, enterprise: 15899, industry: 45499 } },
  aud: { quarterly: { pro: 2299, enterprise: 5399, industry: 15399 }, yearly: { pro: 7599, enterprise: 17799, industry: 50899 } },
  zar: { quarterly: { pro: 28000, enterprise: 65000, industry: 185000 }, yearly: { pro: 92000, enterprise: 215000, industry: 610000 } },
};

const PLAN_NAMES: Record<string, string> = { pro: "Grower", enterprise: "Farm Boss", industry: "Industry" };
const BILLING_MONTHS: Record<string, number> = { quarterly: 3, yearly: 12 };

Deno.serve(async (req: Request) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: h });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, h);
  if (!STRIPE_SECRET) return json({ error: "Stripe not configured" }, 503, h);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401, h);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401, h);

  const body = await req.json();
  const { action } = body;
  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-04-10" });

  // ── Create subscription checkout session ───────────────────────────────
  if (action === "create_session") {
    const { plan, billing_period = "quarterly", currency = "usd" } = body;
    const cur = currency.toLowerCase();

    const localPrices = PRICES_LOCAL[cur];
    const amountCents = localPrices
      ? localPrices[billing_period]?.[plan]
      : PRICES_USD_CENTS[billing_period]?.[plan];

    if (!amountCents) return json({ error: "Invalid plan or currency" }, 400, h);

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    // Get or create Stripe customer so card is saved for renewals
    let customerId: string = profile?.stripe_customer_id || "";
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || user.email || undefined,
        name: profile?.full_name || undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const reference = `edentrack-st-${user.id.substring(0, 8)}-${Date.now()}`;
    const months = BILLING_MONTHS[billing_period] ?? 3;
    const planName = PLAN_NAMES[plan] ?? plan;

    await supabase.from("payments").insert({
      user_id: user.id,
      processor: "stripe",
      reference,
      plan,
      billing_period,
      amount_usd: PRICES_USD_CENTS[billing_period][plan] / 100,
      currency: cur.toUpperCase(),
      status: "pending",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: cur,
          unit_amount: amountCents,
          recurring: { interval: "month", interval_count: months },
          product_data: {
            name: `Edentrack ${planName}`,
            description: `${months}-month farm management subscription — auto-renews`,
          },
        },
        quantity: 1,
      }],
      subscription_data: {
        metadata: { user_id: user.id, plan, billing_period, reference },
      },
      success_url: `${APP_URL}/?stripe_session={CHECKOUT_SESSION_ID}&ref=${reference}`,
      cancel_url: `${APP_URL}/?billing=1`,
      metadata: { user_id: user.id, plan, billing_period, reference },
    });

    return json({ url: session.url, session_id: session.id, reference }, 200, h);
  }

  // ── Verify after redirect ──────────────────────────────────────────────
  if (action === "verify") {
    const { session_id, reference } = body;
    const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ["subscription"] });

    if (session.payment_status !== "paid" && session.status !== "complete") {
      return json({ error: "Payment not complete", status: session.payment_status }, 400, h);
    }

    const { data: payment } = await supabase.from("payments").select("*").eq("reference", reference).maybeSingle();
    if (!payment) return json({ error: "Payment record not found" }, 404, h);
    if (payment.status === "completed") return json({ success: true, already: true }, 200, h);

    const months = payment.billing_period === "yearly" ? 12 : 3;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const sub = session.subscription as Stripe.Subscription | null;
    const subscriptionId = sub?.id ?? null;
    const customerId = (typeof session.customer === "string" ? session.customer : session.customer?.id) ?? null;

    await Promise.all([
      supabase.from("profiles").update({
        subscription_tier: payment.plan,
        subscription_expires_at: expiresAt.toISOString(),
        billing_period: payment.billing_period,
        stripe_customer_id: customerId || undefined,
        stripe_subscription_id: subscriptionId || undefined,
        cancel_at_period_end: false,
      }).eq("id", payment.user_id),
      supabase.from("payments").update({
        status: "completed",
        paid_at: new Date().toISOString(),
        processor_ref: session_id,
      }).eq("reference", reference),
    ]);

    return json({ success: true }, 200, h);
  }

  // ── Cancel subscription at period end ─────────────────────────────────
  if (action === "cancel_subscription") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_subscription_id, cancel_at_period_end")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.stripe_subscription_id) return json({ error: "No active Stripe subscription" }, 400, h);
    if (profile.cancel_at_period_end) return json({ success: true, already: true }, 200, h);

    await stripe.subscriptions.update(profile.stripe_subscription_id, { cancel_at_period_end: true });
    await supabase.from("profiles").update({ cancel_at_period_end: true }).eq("id", user.id);
    return json({ success: true }, 200, h);
  }

  // ── Reactivate (undo cancellation before period ends) ─────────────────
  if (action === "reactivate_subscription") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_subscription_id, cancel_at_period_end")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.stripe_subscription_id) return json({ error: "No active Stripe subscription" }, 400, h);
    if (!profile.cancel_at_period_end) return json({ success: true, already: true }, 200, h);

    await stripe.subscriptions.update(profile.stripe_subscription_id, { cancel_at_period_end: false });
    await supabase.from("profiles").update({ cancel_at_period_end: false }).eq("id", user.id);
    return json({ success: true }, 200, h);
  }

  // ── Stripe Customer Portal (for users who want to update card, etc.) ───
  if (action === "portal") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.stripe_customer_id) return json({ error: "No Stripe customer found" }, 400, h);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${APP_URL}/?billing=1`,
    });
    return json({ url: portalSession.url }, 200, h);
  }

  return json({ error: "Unknown action" }, 400, h);
});
