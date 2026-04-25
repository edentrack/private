import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FLW_SECRET_KEY = Deno.env.get("FLW_SECRET_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "billing@edentrack.app";
const APP_URL = Deno.env.get("APP_URL") || "https://edentrack.app";

// This is called by pg_cron daily at 06:00 UTC.
// The Authorization header carries the service-role key (set in the cron SQL).
Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const results = {
    autoRenewed: 0,
    renewalFailed: 0,
    reminders7d: 0,
    reminders1d: 0,
    downgrades: 0,
    errors: [] as string[],
  };

  // ── 1. FLW card auto-renewal (expiring in 1–4 days, has card token) ───
  const renewBy = new Date(now); renewBy.setDate(renewBy.getDate() + 4);
  const renewAfter = new Date(now); renewAfter.setDate(renewAfter.getDate() + 1);

  const { data: toRenew = [] } = await supabase
    .from("profiles")
    .select("id, email, full_name, subscription_tier, billing_period, flw_card_token, flw_card_last4, flw_card_currency, renewal_failure_count, country, subscription_expires_at")
    .neq("subscription_tier", "free")
    .is("stripe_subscription_id", null)
    .not("flw_card_token", "is", null)
    .gte("subscription_expires_at", renewAfter.toISOString())
    .lte("subscription_expires_at", renewBy.toISOString());

  for (const p of toRenew) {
    // Skip if we already charged or attempted today
    const { count } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", p.id)
      .gte("created_at", `${todayStr}T00:00:00Z`);
    if ((count ?? 0) > 0) continue;

    const plan = p.subscription_tier as string;
    const period = (p.billing_period as string) || "quarterly";
    const currency = (p.flw_card_currency as string) || "USD";
    const amount = lookupPrice(plan, period, currency);
    const tx_ref = `renewal-flw-${p.id}-${Date.now()}`;

    try {
      const res = await fetch("https://api.flutterwave.com/v3/tokenized-charges", {
        method: "POST",
        headers: { Authorization: `Bearer ${FLW_SECRET_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          token: p.flw_card_token,
          currency,
          country: (p.country as string) || "NG",
          amount,
          email: p.email,
          tx_ref,
          narration: `Edentrack ${PLAN_NAMES[plan] ?? plan} renewal`,
        }),
      });
      const data = await res.json();

      if (data.status === "success" && data.data?.status === "successful") {
        const months = period === "yearly" ? 12 : 3;
        const prevExpiry = new Date(p.subscription_expires_at as string);
        const newExpiry = new Date(prevExpiry);
        newExpiry.setMonth(newExpiry.getMonth() + months);

        await Promise.all([
          supabase.from("profiles").update({
            subscription_expires_at: newExpiry.toISOString(),
            renewal_failure_count: 0,
          }).eq("id", p.id),
          supabase.from("payments").insert({
            user_id: p.id,
            processor: "flutterwave",
            tx_ref,
            reference: tx_ref,
            plan,
            billing_period: period,
            amount_usd: lookupPrice(plan, period, "USD"),
            currency: currency.toUpperCase(),
            status: "successful",
            flw_ref: data.data.flw_ref,
            paid_at: new Date().toISOString(),
          }),
        ]);
        await sendEmail(p.email as string, "Your Edentrack subscription has been renewed", renewedHtml(p, PLAN_NAMES[plan] ?? plan, newExpiry));
        results.autoRenewed++;
      } else {
        const failures = ((p.renewal_failure_count as number) || 0) + 1;
        if (failures >= 3) {
          await supabase.from("profiles").update({
            subscription_tier: "free",
            flw_card_token: null,
            renewal_failure_count: 0,
          }).eq("id", p.id);
          await sendEmail(p.email as string, "Your Edentrack subscription has been cancelled", cancelledHtml(p, PLAN_NAMES[plan] ?? plan));
        } else {
          await supabase.from("profiles").update({ renewal_failure_count: failures }).eq("id", p.id);
          await sendEmail(p.email as string, "We couldn't renew your Edentrack subscription", failedHtml(p, PLAN_NAMES[plan] ?? plan, p.flw_card_last4 as string | null));
        }
        results.renewalFailed++;
      }
    } catch (e: unknown) {
      results.errors.push(`auto-renew ${p.id}: ${(e as Error).message}`);
    }
  }

  // ── 2. 7-day reminders ────────────────────────────────────────────────
  const day7start = dateOnly(now, 7) + "T00:00:00Z";
  const day7end   = dateOnly(now, 7) + "T23:59:59Z";

  const { data: remind7 = [] } = await supabase
    .from("profiles")
    .select("id, email, full_name, subscription_tier, billing_period, flw_card_token, flw_card_last4, subscription_expires_at, stripe_subscription_id")
    .neq("subscription_tier", "free")
    .gte("subscription_expires_at", day7start)
    .lte("subscription_expires_at", day7end);

  for (const p of remind7) {
    const isAutoRenew = !!(p.stripe_subscription_id || p.flw_card_token);
    const planName = PLAN_NAMES[p.subscription_tier as string] ?? (p.subscription_tier as string);
    const expiry = new Date(p.subscription_expires_at as string);
    try {
      if (isAutoRenew) {
        await sendEmail(p.email as string, "Your Edentrack subscription renews in 7 days",
          autoRenewReminder(p, planName, expiry, p.flw_card_last4 as string | null, "7 days"));
      } else {
        await sendEmail(p.email as string, "Renew your Edentrack subscription — 7 days left",
          manualRenewReminder(p, planName, expiry, "7 days"));
      }
      results.reminders7d++;
    } catch (e: unknown) {
      results.errors.push(`7d reminder ${p.id}: ${(e as Error).message}`);
    }
  }

  // ── 3. 1-day reminders (mobile money users only — card users auto-charge) ──
  const day1start = dateOnly(now, 1) + "T00:00:00Z";
  const day1end   = dateOnly(now, 1) + "T23:59:59Z";

  const { data: remind1 = [] } = await supabase
    .from("profiles")
    .select("id, email, full_name, subscription_tier, billing_period, flw_card_token, subscription_expires_at, stripe_subscription_id")
    .neq("subscription_tier", "free")
    .is("stripe_subscription_id", null)
    .is("flw_card_token", null)
    .gte("subscription_expires_at", day1start)
    .lte("subscription_expires_at", day1end);

  for (const p of remind1) {
    const planName = PLAN_NAMES[p.subscription_tier as string] ?? (p.subscription_tier as string);
    const expiry = new Date(p.subscription_expires_at as string);
    try {
      await sendEmail(p.email as string, "Your Edentrack subscription expires tomorrow", urgentReminder(p, planName, expiry));
      results.reminders1d++;
    } catch (e: unknown) {
      results.errors.push(`1d reminder ${p.id}: ${(e as Error).message}`);
    }
  }

  // ── 4. Downgrade expired non-Stripe accounts (3-day grace period) ─────
  const graceCutoff = new Date(now); graceCutoff.setDate(graceCutoff.getDate() - 3);

  const { data: expired = [] } = await supabase
    .from("profiles")
    .select("id, email, full_name, subscription_tier")
    .neq("subscription_tier", "free")
    .is("stripe_subscription_id", null)
    .lte("subscription_expires_at", graceCutoff.toISOString());

  for (const p of expired) {
    try {
      await supabase.from("profiles").update({
        subscription_tier: "free",
        flw_card_token: null,
        renewal_failure_count: 0,
      }).eq("id", p.id);
      const planName = PLAN_NAMES[p.subscription_tier as string] ?? (p.subscription_tier as string);
      await sendEmail(p.email as string, "Your Edentrack subscription has expired", cancelledHtml(p, planName));
      results.downgrades++;
    } catch (e: unknown) {
      results.errors.push(`downgrade ${p.id}: ${(e as Error).message}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, ran: todayStr, ...results }), {
    headers: { "Content-Type": "application/json" },
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────

const PLAN_NAMES: Record<string, string> = { pro: "Grower", enterprise: "Farm Boss", industry: "Industry" };

function dateOnly(base: Date, offsetDays: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

const PRICES: Record<string, Record<string, Record<string, number>>> = {
  USD: { quarterly: { pro: 14.99, enterprise: 34.99, industry: 99.99 }, yearly: { pro: 49.99, enterprise: 114.99, industry: 329.99 } },
  NGN: { quarterly: { pro: 24000, enterprise: 56000, industry: 160000 }, yearly: { pro: 80000, enterprise: 185000, industry: 530000 } },
  GHS: { quarterly: { pro: 230, enterprise: 540, industry: 1550 }, yearly: { pro: 760, enterprise: 1790, industry: 5100 } },
  KES: { quarterly: { pro: 2000, enterprise: 4600, industry: 13000 }, yearly: { pro: 6500, enterprise: 15000, industry: 43000 } },
  ZAR: { quarterly: { pro: 280, enterprise: 650, industry: 1850 }, yearly: { pro: 920, enterprise: 2150, industry: 6100 } },
  EGP: { quarterly: { pro: 720, enterprise: 1680, industry: 4800 }, yearly: { pro: 2400, enterprise: 5520, industry: 15840 } },
  MAD: { quarterly: { pro: 150, enterprise: 350, industry: 1000 }, yearly: { pro: 500, enterprise: 1150, industry: 3300 } },
  ZMW: { quarterly: { pro: 405, enterprise: 945, industry: 2700 }, yearly: { pro: 1350, enterprise: 3105, industry: 8910 } },
};

function lookupPrice(plan: string, period: string, currency: string): number {
  return PRICES[currency]?.[period]?.[plan] ?? PRICES.USD[period]?.[plan] ?? 14.99;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
}

function fmt(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function emailShell(name: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:0;background:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.wrap{max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.hdr{background:#3D5F42;padding:28px 32px;color:#fff}.hdr h1{margin:0;font-size:20px;font-weight:700}
.hdr p{margin:4px 0 0;font-size:13px;opacity:.8}.body{padding:28px 32px}.body p{margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6}
.btn{display:inline-block;background:#3D5F42;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:15px;margin:8px 0 16px}
.tag{display:inline-block;padding:4px 12px;border-radius:99px;font-size:13px;font-weight:600}
.tag-green{background:#DCFCE7;color:#166534}.tag-amber{background:#FEF3C7;color:#92400E}.tag-red{background:#FEE2E2;color:#991B1B}
.ftr{padding:20px 32px;border-top:1px solid #F3F4F6;font-size:12px;color:#9CA3AF}
</style></head><body>
<div class="wrap">
<div class="hdr"><h1>🌱 Edentrack</h1><p>Farm management for African farmers</p></div>
<div class="body"><p>Hi ${name || "there"},</p>${body}</div>
<div class="ftr">Edentrack · <a href="${APP_URL}" style="color:#9CA3AF">${APP_URL}</a><br>
You're receiving this because you have an Edentrack account. <a href="${APP_URL}/settings" style="color:#9CA3AF">Manage preferences</a></div>
</div></body></html>`;
}

function renewedHtml(p: Record<string, unknown>, planName: string, newExpiry: Date): string {
  return emailShell(p.full_name as string, `
<p><span class="tag tag-green">✓ Renewed</span></p>
<p>Your <strong>${planName}</strong> plan has been successfully renewed.</p>
<p>Your next billing date is <strong>${fmt(newExpiry)}</strong>. We'll charge the same card automatically — no action needed.</p>
<a href="${APP_URL}" class="btn">Go to Dashboard</a>
<p style="font-size:13px;color:#6B7280">Questions? Reply to this email or contact <a href="mailto:support@edentrack.app">support@edentrack.app</a></p>`);
}

function failedHtml(p: Record<string, unknown>, planName: string, last4: string | null): string {
  return emailShell(p.full_name as string, `
<p><span class="tag tag-amber">⚠ Payment failed</span></p>
<p>We tried to renew your <strong>${planName}</strong> plan${last4 ? ` using your card ending in <strong>${last4}</strong>` : ""}, but the charge was declined.</p>
<p>Your subscription is still active for now. Please renew manually to avoid losing access.</p>
<a href="${APP_URL}/?billing=1" class="btn">Renew now</a>
<p style="font-size:13px;color:#6B7280">If your card details have changed, you can update them when you renew. After 3 failed attempts, your account will move to the free plan.</p>`);
}

function cancelledHtml(p: Record<string, unknown>, planName: string): string {
  return emailShell(p.full_name as string, `
<p><span class="tag tag-red">Subscription ended</span></p>
<p>Your <strong>${planName}</strong> plan has expired and your account has been moved to the free Starter plan.</p>
<p>You can still log in and view your data. Renew anytime to restore full access.</p>
<a href="${APP_URL}/?billing=1" class="btn">Renew my plan</a>
<p style="font-size:13px;color:#6B7280">Your farm data is safe and will never be deleted.</p>`);
}

function autoRenewReminder(p: Record<string, unknown>, planName: string, expiry: Date, last4: string | null, when: string): string {
  return emailShell(p.full_name as string, `
<p>Your <strong>${planName}</strong> plan will automatically renew in <strong>${when}</strong> on <strong>${fmt(expiry)}</strong>.</p>
${last4 ? `<p>Your card ending in <strong>${last4}</strong> will be charged.</p>` : ""}
<p>No action needed — we'll handle it automatically.</p>
<a href="${APP_URL}" class="btn">View Dashboard</a>
<p style="font-size:13px;color:#6B7280">Want to cancel? You can do that from <a href="${APP_URL}/?billing=1">Billing settings</a>. Cancelling keeps your access until ${fmt(expiry)}.</p>`);
}

function manualRenewReminder(p: Record<string, unknown>, planName: string, expiry: Date, when: string): string {
  return emailShell(p.full_name as string, `
<p>Your <strong>${planName}</strong> plan expires in <strong>${when}</strong> on <strong>${fmt(expiry)}</strong>.</p>
<p>To keep uninterrupted access to your farm data, reports, and Eden AI, please renew before that date.</p>
<a href="${APP_URL}/?billing=1" class="btn">Renew now</a>
<p style="font-size:13px;color:#6B7280">After expiry you'll have a 3-day grace period before your account moves to the free Starter plan.</p>`);
}

function urgentReminder(p: Record<string, unknown>, planName: string, expiry: Date): string {
  return emailShell(p.full_name as string, `
<p><span class="tag tag-amber">⏰ Expires tomorrow</span></p>
<p>Your <strong>${planName}</strong> plan expires tomorrow on <strong>${fmt(expiry)}</strong>.</p>
<p>Renew today to keep access to all your farm data, weekly reports, and Eden AI without interruption.</p>
<a href="${APP_URL}/?billing=1" class="btn">Renew now →</a>
<p style="font-size:13px;color:#6B7280">After expiry you'll have a 3-day grace period before your account moves to the free plan. Your data is always safe.</p>`);
}
