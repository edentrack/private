import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";
import { getCurrentDiscountPct, applyDiscount } from "../_shared/pricingDiscount.ts";

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

// Prices in smallest currency unit (cents for USD, etc.).
// Must match FIXED_PRICES in src/utils/regionalPayment.ts exactly.
// USD ladder: $7 / $19 / $49 monthly. See that file for ratios + sources.
const PRICES_USD_CENTS: Record<string, Record<string, number>> = {
  monthly:   { pro: 700,   enterprise: 1900,  industry: 4900  },
  quarterly: { pro: 1800,  enterprise: 5000,  industry: 13000 },
  yearly:    { pro: 6000,  enterprise: 18000, industry: 48000 },
};

const PRICES_LOCAL: Record<string, Record<string, Record<string, number>>> = {
  gbp: { monthly: { pro: 599,   enterprise: 1499,  industry: 3999  }, quarterly: { pro: 1499, enterprise: 3999,  industry: 9999   }, yearly: { pro: 5399,  enterprise: 13999, industry: 36999  } },
  eur: { monthly: { pro: 699,   enterprise: 1799,  industry: 4799  }, quarterly: { pro: 1699, enterprise: 4599,  industry: 11999  }, yearly: { pro: 5999,  enterprise: 15999, industry: 42999  } },
  cad: { monthly: { pro: 899,   enterprise: 2599,  industry: 6499  }, quarterly: { pro: 2299, enterprise: 6499,  industry: 16999  }, yearly: { pro: 8499,  enterprise: 23999, industry: 62999  } },
  aud: { monthly: { pro: 1099,  enterprise: 2999,  industry: 7999  }, quarterly: { pro: 2699, enterprise: 7699,  industry: 19999  }, yearly: { pro: 9999,  enterprise: 26999, industry: 72999  } },
  zar: { monthly: { pro: 13000, enterprise: 38000, industry: 97000 }, quarterly: { pro: 32500, enterprise: 93500, industry: 238000 }, yearly: { pro: 115500, enterprise: 325000, industry: 858000 } },
};

// plan IDs: 'pro' = Grower, 'enterprise' = Farm Boss, 'industry' = Industry
const PLAN_NAMES: Record<string, string> = { pro: "Grower", enterprise: "Farm Boss", industry: "Industry" };
const BILLING_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

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
    const baselineCents = localPrices
      ? localPrices[billing_period]?.[plan]
      : PRICES_USD_CENTS[billing_period]?.[plan];

    if (!baselineCents) return json({ error: "Invalid plan or currency" }, 400, h);

    // Apply the current admin-set discount. Cents are integer so
    // decimals=0 — applyDiscount rounds correctly. The result is what
    // Stripe will actually charge.
    const discountPct = await getCurrentDiscountPct(supabase);
    const amountCents = applyDiscount(baselineCents, discountPct, 0);

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
      // amount_usd reflects the actual charged USD (post-discount) so the
      // payments table is the source of truth for finance reports.
      amount_usd: applyDiscount(PRICES_USD_CENTS[billing_period][plan], discountPct, 0) / 100,
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

    const months = BILLING_MONTHS[payment.billing_period] ?? 3;
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

    // Send "set your password" email for new checkout signups (account < 1 hour old)
    try {
      const userAge = Date.now() - new Date((user as any).created_at || 0).getTime();
      if (userAge < 3_600_000) {
        await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_KEY },
          body: JSON.stringify({ email: user.email }),
        });
      }
    } catch {}

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
