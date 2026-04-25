import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  if (!sig || !STRIPE_WEBHOOK_SECRET) return new Response("Missing signature", { status: 400 });

  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-04-10" });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    return new Response(`Webhook signature error: ${err.message}`, { status: 400 });
  }

  switch (event.type) {

    // First payment + subscription created via Checkout
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;

      const userId = session.metadata?.user_id;
      const plan = session.metadata?.plan;
      const billingPeriod = session.metadata?.billing_period;
      const reference = session.metadata?.reference;
      if (!userId || !plan) break;

      const months = billingPeriod === "yearly" ? 12 : 3;
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + months);

      const subscriptionId = typeof session.subscription === "string" ? session.subscription : (session.subscription as any)?.id;
      const customerId = typeof session.customer === "string" ? session.customer : (session.customer as any)?.id;

      await Promise.all([
        supabase.from("profiles").update({
          subscription_tier: plan,
          subscription_expires_at: expiresAt.toISOString(),
          billing_period: billingPeriod || "quarterly",
          stripe_customer_id: customerId || undefined,
          stripe_subscription_id: subscriptionId || undefined,
          cancel_at_period_end: false,
        }).eq("id", userId),
        reference
          ? supabase.from("payments").update({
              status: "completed",
              paid_at: new Date().toISOString(),
              processor_ref: session.id,
            }).eq("reference", reference)
          : Promise.resolve(),
      ]);
      break;
    }

    // Auto-renewal succeeded
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      // Skip the initial invoice (handled by checkout.session.completed)
      if ((invoice as any).billing_reason === "subscription_create") break;

      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription as any)?.id;
      if (!subscriptionId) break;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, subscription_tier")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      if (!profile) break;

      // Use the subscription's own period_end + metadata for accuracy
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const currentPeriodEnd = new Date(sub.current_period_end * 1000);
      const billingPeriodMeta = sub.metadata?.billing_period || "quarterly";

      await supabase.from("profiles").update({
        subscription_expires_at: currentPeriodEnd.toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
      }).eq("id", profile.id);

      await supabase.from("payments").insert({
        user_id: profile.id,
        processor: "stripe",
        reference: `renewal-${subscriptionId}-${invoice.id}`,
        plan: profile.subscription_tier,
        billing_period: billingPeriodMeta,
        amount_usd: (invoice.amount_paid || 0) / 100,
        currency: (invoice.currency || "usd").toUpperCase(),
        status: "completed",
        paid_at: new Date().toISOString(),
        processor_ref: invoice.id,
      });
      break;
    }

    // Auto-renewal failed — Stripe will retry; we log but don't downgrade yet
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription as any)?.id;
      if (!subscriptionId) break;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      if (!profile) break;

      // Log failed attempt so we can trigger reminder email separately
      await supabase.from("payments").insert({
        user_id: profile.id,
        processor: "stripe",
        reference: `failed-${subscriptionId}-${invoice.id}`,
        plan: "unknown",
        billing_period: "quarterly",
        amount_usd: (invoice.amount_due || 0) / 100,
        currency: (invoice.currency || "usd").toUpperCase(),
        status: "failed",
        processor_ref: invoice.id,
      }).select();
      break;
    }

    // Subscription cancelled — either by user at period end, or by Stripe after 3 failed renewals
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer as any)?.id;

      let profileId = userId;
      if (!profileId && customerId) {
        const { data: p } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        profileId = p?.id;
      }
      if (!profileId) break;

      await supabase.from("profiles").update({
        subscription_tier: "free",
        subscription_expires_at: new Date().toISOString(),
        stripe_subscription_id: null,
        cancel_at_period_end: false,
      }).eq("id", profileId);
      break;
    }

    // cancel_at_period_end toggled or period dates updated
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();
      if (!profile) break;

      await supabase.from("profiles").update({
        cancel_at_period_end: sub.cancel_at_period_end,
        subscription_expires_at: new Date(sub.current_period_end * 1000).toISOString(),
      }).eq("id", profile.id);
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
