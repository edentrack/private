import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CAMPAY_USERNAME = Deno.env.get("CAMPAY_USERNAME")!;
const CAMPAY_PASSWORD = Deno.env.get("CAMPAY_PASSWORD")!;
const CAMPAY_BASE = "https://www.campay.net/api"; // use https://demo.campay.net/api for testing
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

function json(data: unknown, status = 200, h: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers: { ...h, "Content-Type": "application/json" } });
}

const PLAN_PRICES_USD: Record<string, Record<string, number>> = {
  quarterly: { pro: 14.99, enterprise: 34.99, industry: 99.99 },
  yearly:    { pro: 49.99, enterprise: 114.99, industry: 329.99 },
};

async function getCampayToken(): Promise<string> {
  const res = await fetch(`${CAMPAY_BASE}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: CAMPAY_USERNAME, password: CAMPAY_PASSWORD }),
  });
  const data = await res.json();
  if (!data.token) throw new Error("Campay auth failed");
  return data.token;
}

Deno.serve(async (req: Request) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: h });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, h);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401, h);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401, h);

  const body = await req.json();
  const { action } = body;

  if (action === "initiate") {
    if (!CAMPAY_USERNAME || !CAMPAY_PASSWORD) return json({ error: "Campay not configured" }, 503, h);

    const { plan, billing_period = "quarterly", phone, amount_xaf } = body;
    const usdPrice = PLAN_PRICES_USD[billing_period]?.[plan];
    if (!usdPrice) return json({ error: "Invalid plan" }, 400, h);

    // Use fixed amount passed from client (pre-defined in regionalPayment.ts)
    const amountXAF: number = amount_xaf || PLAN_PRICES_USD[billing_period][plan] * 605;

    const reference = `edentrack-cp-${user.id.substring(0, 8)}-${Date.now()}`;

    // Store pending payment
    await supabase.from("payments").insert({
      user_id: user.id,
      processor: "campay",
      reference,
      plan,
      billing_period,
      amount_usd: usdPrice,
      currency: "XAF",
      fx_rate,
      status: "pending",
    });

    try {
      const token = await getCampayToken();
      const collectRes = await fetch(`${CAMPAY_BASE}/collect/`, {
        method: "POST",
        headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: String(amountXAF),
          currency: "XAF",
          from: phone,
          description: `Edentrack ${plan === "enterprise" ? "Farm Boss" : plan === "industry" ? "Industry" : "Grower"} — ${billing_period === "yearly" ? "12 months" : "3 months"}`,
          external_reference: reference,
        }),
      });
      const collectData = await collectRes.json();
      if (!collectData.reference && !collectData.ussd_code) {
        throw new Error(collectData.message || "Campay collection failed");
      }

      // Store campay's internal reference for polling
      await supabase.from("payments").update({ processor_ref: collectData.reference || reference }).eq("reference", reference);

      return json({ reference, ussd_code: collectData.ussd_code || null, amount_xaf: amountXAF }, 200, h);
    } catch (err: any) {
      await supabase.from("payments").update({ status: "failed" }).eq("reference", reference);
      return json({ error: err.message || "Payment initiation failed" }, 400, h);
    }
  }

  if (action === "check") {
    const { reference } = body;
    const { data: payment } = await supabase.from("payments").select("*").eq("reference", reference).maybeSingle();
    if (!payment) return json({ error: "Not found" }, 404, h);
    if (payment.status === "completed") return json({ status: "SUCCESSFUL" }, 200, h);

    try {
      const token = await getCampayToken();
      const processorRef = payment.processor_ref || reference;
      const statusRes = await fetch(`${CAMPAY_BASE}/transaction/${processorRef}/`, {
        headers: { Authorization: `Token ${token}` },
      });
      const statusData = await statusRes.json();
      const campayStatus: string = statusData.status || "PENDING";

      if (campayStatus === "SUCCESSFUL") {
        const months = payment.billing_period === "yearly" ? 12 : 3;
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + months);
        await Promise.all([
          supabase.from("profiles").update({ subscription_tier: payment.plan, subscription_expires_at: expiresAt.toISOString() }).eq("id", payment.user_id),
          supabase.from("payments").update({ status: "completed", paid_at: new Date().toISOString() }).eq("reference", reference),
        ]);
      } else if (campayStatus === "FAILED") {
        await supabase.from("payments").update({ status: "failed" }).eq("reference", reference);
      }

      return json({ status: campayStatus }, 200, h);
    } catch (err: any) {
      return json({ status: "PENDING", error: err.message }, 200, h);
    }
  }

  return json({ error: "Unknown action" }, 400, h);
});
