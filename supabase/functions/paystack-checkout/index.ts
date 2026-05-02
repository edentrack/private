import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://edentrack.app";

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const ok = origin === ALLOWED_ORIGIN || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data: unknown, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Plan → USD price map — must match FIXED_PRICES in src/utils/regionalPayment.ts
const PLAN_PRICES_USD: Record<string, Record<string, number>> = {
  monthly:   { pro: 12,  enterprise: 35,  industry: 89  },
  quarterly: { pro: 30,  enterprise: 87,  industry: 222 },
  yearly:    { pro: 108, enterprise: 300, industry: 800 },
};

// Convert USD to local currency amount in minor units (kobo, pesewas, etc.)
// Paystack expects amounts in the smallest currency unit
function toMinorUnits(usdAmount: number, currency: string, fxRate: number): number {
  const local = usdAmount * fxRate;
  const noSubunit = ["NGN", "GHS", "KES", "ZAR"]; // Paystack handles these without subunits for mobile
  // Paystack actually expects: NGN in kobo (×100), GHS in pesewas (×100), KES in cents (×100), ZAR in cents (×100)
  return Math.round(local * 100);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = cors(req);

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const { action, plan, billing_period = "quarterly", currency = "NGN", fx_rate = 1 } = await req.json();

  if (action === "initialize") {
    if (!PAYSTACK_SECRET) return json({ error: "Paystack not configured" }, 503, corsHeaders);

    const usdPrice = PLAN_PRICES_USD[billing_period]?.[plan];
    if (!usdPrice) return json({ error: "Invalid plan" }, 400, corsHeaders);

    const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();
    const email = profile?.email || user.email || "";

    const reference = `edentrack-ps-${user.id.substring(0, 8)}-${Date.now()}`;
    const amountMinor = toMinorUnits(usdPrice, currency, fx_rate);

    // Store pending payment
    await supabase.from("payments").insert({
      user_id: user.id,
      processor: "paystack",
      reference,
      plan,
      billing_period,
      amount_usd: usdPrice,
      currency,
      fx_rate,
      status: "pending",
    }).select().single();

    const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: amountMinor,
        currency,
        reference,
        channels: ["card", "bank", "ussd", "mobile_money", "bank_transfer"],
        metadata: { user_id: user.id, plan, billing_period },
      }),
    });

    const psData = await psRes.json();
    if (!psData.status) return json({ error: psData.message || "Paystack error" }, 400, corsHeaders);

    return json({ reference, authorization_url: psData.data.authorization_url, access_code: psData.data.access_code }, 200, corsHeaders);
  }

  if (action === "verify") {
    const { reference } = await req.json().catch(() => ({}));
    if (!reference) return json({ error: "Missing reference" }, 400, corsHeaders);

    const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const psData = await psRes.json();

    if (!psData.status || psData.data?.status !== "success") {
      return json({ error: "Payment not confirmed", status: psData.data?.status }, 400, corsHeaders);
    }

    // Look up pending payment
    const { data: payment } = await supabase.from("payments").select("*").eq("reference", reference).maybeSingle();
    if (!payment) return json({ error: "Payment record not found" }, 404, corsHeaders);
    if (payment.status === "completed") return json({ success: true, already: true }, 200, corsHeaders);

    // Activate subscription
    const months = payment.billing_period === "yearly" ? 12 : 3;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    await Promise.all([
      supabase.from("profiles").update({ subscription_tier: payment.plan, subscription_expires_at: expiresAt.toISOString() }).eq("id", payment.user_id),
      supabase.from("payments").update({ status: "completed", paid_at: new Date().toISOString() }).eq("reference", reference),
    ]);

    return json({ success: true }, 200, corsHeaders);
  }

  return json({ error: "Unknown action" }, 400, corsHeaders);
});
