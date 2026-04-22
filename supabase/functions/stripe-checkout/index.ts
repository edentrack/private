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

// Fixed prices in USD cents (Stripe uses smallest currency unit)
const PRICES_USD_CENTS: Record<string, Record<string, number>> = {
  quarterly: { pro: 1499, enterprise: 3499, industry: 9999 },
  yearly:    { pro: 4999, enterprise: 11499, industry: 32999 },
};

// For non-USD currencies that Stripe supports, prices in minor units
// Keys match Stripe's currency codes (lowercase)
const PRICES_LOCAL: Record<string, Record<string, Record<string, number>>> = {
  gbp: { quarterly: { pro: 1199, enterprise: 2799, industry: 7999 }, yearly: { pro: 3999, enterprise: 9199, industry: 25999 } },
  eur: { quarterly: { pro: 1399, enterprise: 3199, industry: 9199 }, yearly: { pro: 4599, enterprise: 10499, industry: 29999 } },
  cad: { quarterly: { pro: 2099, enterprise: 4799, industry: 13799 }, yearly: { pro: 6899, enterprise: 15899, industry: 45499 } },
  aud: { quarterly: { pro: 2299, enterprise: 5399, industry: 15399 }, yearly: { pro: 7599, enterprise: 17799, industry: 50899 } },
  zar: { quarterly: { pro: 28000, enterprise: 65000, industry: 185000 }, yearly: { pro: 92000, enterprise: 215000, industry: 610000 } },
};

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

  if (action === "create_session") {
    const { plan, billing_period = "quarterly", currency = "usd" } = body;
    const cur = currency.toLowerCase();

    const localPrices = PRICES_LOCAL[cur];
    const amountCents = localPrices
      ? localPrices[billing_period]?.[plan]
      : PRICES_USD_CENTS[billing_period]?.[plan];

    if (!amountCents) return json({ error: "Invalid plan or currency" }, 400, h);

    const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();
    const reference = `edentrack-st-${user.id.substring(0, 8)}-${Date.now()}`;

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

    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-04-10" });
    const months = billing_period === "yearly" ? 12 : 3;
    const planName = plan === "enterprise" ? "Farm Boss" : plan === "industry" ? "Industry" : "Grower";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: cur,
          unit_amount: amountCents,
          product_data: {
            name: `Edentrack ${planName}`,
            description: `${months}-month farm management subscription`,
          },
        },
        quantity: 1,
      }],
      customer_email: profile?.email || user.email || undefined,
      success_url: `${APP_URL}/?stripe_session={CHECKOUT_SESSION_ID}&ref=${reference}`,
      cancel_url: `${APP_URL}/?billing=1`,
      metadata: { user_id: user.id, plan, billing_period, reference },
    });

    return json({ url: session.url, session_id: session.id, reference }, 200, h);
  }

  if (action === "verify") {
    const { session_id, reference } = body;

    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-04-10" });
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      return json({ error: "Payment not complete", status: session.payment_status }, 400, h);
    }

    const { data: payment } = await supabase.from("payments").select("*").eq("reference", reference).maybeSingle();
    if (!payment) return json({ error: "Payment record not found" }, 404, h);
    if (payment.status === "completed") return json({ success: true, already: true }, 200, h);

    const months = payment.billing_period === "yearly" ? 12 : 3;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    await Promise.all([
      supabase.from("profiles").update({ subscription_tier: payment.plan, subscription_expires_at: expiresAt.toISOString() }).eq("id", payment.user_id),
      supabase.from("payments").update({ status: "completed", paid_at: new Date().toISOString(), processor_ref: session_id }).eq("reference", reference),
    ]);

    return json({ success: true }, 200, h);
  }

  return json({ error: "Unknown action" }, 400, h);
});
