/**
 * WhatsApp Daily Report — Phase G killer-feature seed.
 *
 * Sends each opted-in user a WhatsApp summary of their farm's previous
 * 24 hours: deaths, eggs collected (or biomass for fish), tasks done /
 * pending, water-quality emergencies, and what to do today.
 *
 * Trigger: scheduled cron — every 5 minutes. Each run picks up the
 * subscriptions whose delivery_time_local matches the current time in
 * the farm's timezone (and that haven't been sent in the last 23h).
 *
 * Force run: POST { farm_id, user_id, force: true } — used by the
 * settings UI's "Send a test message now" button.
 *
 * Per Meta's WhatsApp Cloud API:
 *   - Free-form messages are limited to a 24-hour window after the user
 *     last messages your business number.
 *   - Outside that window, you must send an APPROVED template.
 *   - This function uses a template named `daily_farm_report_v1` that
 *     the user must register in Meta Business Suite. The template body
 *     uses the variables: {{1}}=farm name, {{2}}=date, {{3}}=summary line.
 *   - We pass a single multi-line summary as {{3}} so we don't need to
 *     re-approve the template every time the format changes.
 *
 * Env vars required:
 *   WHATSAPP_ACCESS_TOKEN     — Meta Business token (System User token preferred)
 *   WHATSAPP_PHONE_NUMBER_ID  — the From number's Meta ID
 *   WHATSAPP_TEMPLATE_NAME    — defaults to 'daily_farm_report_v1'
 *
 * If any env var is missing the function returns 200 with skipped=true so
 * cron doesn't retry forever.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
const WHATSAPP_TEMPLATE_NAME = Deno.env.get("WHATSAPP_TEMPLATE_NAME") || "daily_farm_report_v1";

// Outbound HTTP target — Meta hasn't broken this URL since v15.
const META_BASE_URL = "https://graph.facebook.com/v19.0";

// Don't re-send for the same subscription within this window.
const RESEND_COOLDOWN_HOURS = 23;

interface Subscription {
  id: string;
  farm_id: string;
  user_id: string;
  phone_e164: string;
  enabled: boolean;
  delivery_time_local: string;  // 'HH:MM:SS' local
  last_sent_at: string | null;
  consecutive_failures: number;
}

interface Farm {
  id: string;
  name: string;
  timezone: string | null;
  farm_type: string;
  currency_code: string | null;
}

/**
 * Build the daily summary body. Pulls counts from the last 24h.
 * Caller is responsible for picking the right date window (we just use
 * "now − 24h" because the farm's timezone may shift the boundary by ≤1h
 * and the user clicked "deliver at 06:30 local" so it's "yesterday's
 * activity through now").
 */
async function buildDailySummary(
  supabase: SupabaseClient,
  farm: Farm,
): Promise<string> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const today = new Date().toISOString().split('T')[0];

  // Mortality, eggs, sales, expenses — keep each query cheap, scoped to farm.
  const [
    mortalityRes,
    eggCollectionsRes,
    eggSalesRes,
    birdSalesRes,
    expensesRes,
    pendingTasksRes,
    completedTasksRes,
    upcomingVaxRes,
    waterEmergencyRes,
  ] = await Promise.all([
    supabase
      .from('mortality_logs')
      .select('count')
      .eq('farm_id', farm.id)
      .gte('created_at', since),
    supabase
      .from('egg_collections')
      .select('total_eggs')
      .eq('farm_id', farm.id)
      .gte('created_at', since),
    supabase
      .from('egg_sales')
      .select('total_amount, total_eggs')
      .eq('farm_id', farm.id)
      .gte('created_at', since),
    supabase
      .from('bird_sales')
      .select('total_amount, birds_sold')
      .eq('farm_id', farm.id)
      .gte('created_at', since),
    supabase
      .from('expenses')
      .select('amount')
      .eq('farm_id', farm.id)
      .gte('created_at', since),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('farm_id', farm.id)
      .eq('status', 'pending')
      .lte('due_date', today),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('farm_id', farm.id)
      .eq('status', 'completed')
      .gte('completed_at', since),
    supabase
      .from('vaccinations')
      .select('vaccine_name, scheduled_date')
      .eq('farm_id', farm.id)
      .eq('completed', false)
      .gte('scheduled_date', today)
      .lte('scheduled_date', new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0])
      .order('scheduled_date', { ascending: true })
      .limit(2),
    supabase
      .from('water_quality_logs')
      .select('flock_id, dissolved_oxygen, ammonia_mgl')
      .eq('farm_id', farm.id)
      .gte('logged_at', since),
  ]);

  const totalDeaths = (mortalityRes.data || []).reduce((s, r: any) => s + (r.count || 0), 0);
  const totalEggsCollected = (eggCollectionsRes.data || []).reduce((s, r: any) => s + (r.total_eggs || 0), 0);
  const totalEggSales = (eggSalesRes.data || []).reduce((s, r: any) => s + Number(r.total_amount || 0), 0);
  const totalBirdSales = (birdSalesRes.data || []).reduce((s, r: any) => s + Number(r.total_amount || 0), 0);
  const totalExpenses = (expensesRes.data || []).reduce((s, r: any) => s + Number(r.amount || 0), 0);
  const totalRevenue = totalEggSales + totalBirdSales;
  const netToday = totalRevenue - totalExpenses;

  const pendingTasks = (pendingTasksRes as any).count ?? 0;
  const completedTasks = (completedTasksRes as any).count ?? 0;
  const upcomingVax = upcomingVaxRes.data || [];

  // Water-quality emergency check — DO < 3 or NH3 > 0.5
  const waterEmergencies = (waterEmergencyRes.data || []).filter(
    (r: any) => (r.dissolved_oxygen != null && r.dissolved_oxygen < 3) || (r.ammonia_mgl != null && r.ammonia_mgl > 0.5),
  );

  const currency = farm.currency_code || 'XAF';
  const fmt = (n: number) => Math.round(n).toLocaleString();

  // Build the multi-line body. WhatsApp template variables don't preserve
  // newlines reliably across all clients — we use • as a row separator
  // and keep the lines short.
  const lines: string[] = [];

  if (farm.farm_type === 'aquaculture') {
    lines.push(`🐟 Yesterday: ${totalDeaths} losses · ${fmt(totalRevenue)} ${currency} sales`);
  } else if (farm.farm_type === 'rabbits') {
    lines.push(`🐰 Yesterday: ${totalDeaths} deaths · ${fmt(totalRevenue)} ${currency} sales`);
  } else {
    lines.push(`🐔 Yesterday: ${totalDeaths} deaths · ${totalEggsCollected} eggs · ${fmt(totalRevenue)} ${currency} sales`);
  }

  lines.push(`Net: ${netToday >= 0 ? '+' : ''}${fmt(netToday)} ${currency}`);
  lines.push(`Tasks: ${completedTasks} done · ${pendingTasks} pending`);

  if (waterEmergencies.length > 0) {
    lines.push(`⚠️ Water emergency on ${waterEmergencies.length} pond(s) — open the app`);
  }

  if (upcomingVax.length > 0) {
    const v = upcomingVax[0] as any;
    lines.push(`💉 Vaccine due ${v.scheduled_date}: ${v.vaccine_name}`);
  }

  return lines.join('\n');
}

async function sendWhatsappTemplate(
  toE164: string,
  farmName: string,
  date: string,
  summary: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, error: 'WhatsApp env vars not configured' };
  }
  // Strip the leading + because Meta wants the international number without it.
  const to = toE164.replace(/^\+/, '');

  const res = await fetch(
    `${META_BASE_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: WHATSAPP_TEMPLATE_NAME,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: farmName.slice(0, 60) },
                { type: 'text', text: date },
                { type: 'text', text: summary.slice(0, 1024) },
              ],
            },
          ],
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error');
    return { ok: false, error: `Meta API ${res.status}: ${errText.slice(0, 300)}` };
  }
  return { ok: true };
}

/**
 * Decide whether `now` matches a subscription's delivery_time_local in the
 * farm's timezone, with a 5-minute window on either side (so a 06:30
 * scheduled report fires once between 06:25 and 06:35 local time).
 */
function isInDeliveryWindow(
  delivery_time_local: string,
  farmTimezone: string,
  windowMinutes = 5,
): boolean {
  const tz = farmTimezone || 'UTC';
  const now = new Date();
  // Get current time in farm tz as HH:mm
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const nowHM = fmt.format(now); // 'HH:mm'
  const [nowH, nowM] = nowHM.split(':').map(Number);
  const [tH, tM] = delivery_time_local.split(':').slice(0, 2).map(Number);
  const nowMin = nowH * 60 + nowM;
  const tgtMin = tH * 60 + tM;
  const diff = Math.abs(nowMin - tgtMin);
  return diff <= windowMinutes;
}

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Allow callers to force-send for a specific (farm_id, user_id) pair
  // (used by the settings UI test button).
  let force = false;
  let forceFarmId: string | null = null;
  let forceUserId: string | null = null;
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      force = !!body.force;
      forceFarmId = body.farm_id ?? null;
      forceUserId = body.user_id ?? null;
    } catch { /* allow GET-style invocation too */ }
  }

  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'WhatsApp env vars not configured' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  // Pull all enabled subscriptions (with a cooldown filter except for force).
  const cooldownCutoff = new Date(Date.now() - RESEND_COOLDOWN_HOURS * 3600_000).toISOString();
  let query = supabase
    .from('whatsapp_subscriptions')
    .select('*')
    .eq('enabled', true);
  if (force) {
    if (forceFarmId) query = query.eq('farm_id', forceFarmId);
    if (forceUserId) query = query.eq('user_id', forceUserId);
  } else {
    query = query.or(`last_sent_at.is.null,last_sent_at.lt.${cooldownCutoff}`);
  }
  const { data: subs, error: subsError } = await query;
  if (subsError) {
    return new Response(JSON.stringify({ error: subsError.message }), { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }));
  }

  // Pull farm metadata for timezone + name.
  const farmIds = Array.from(new Set(subs.map((s: any) => s.farm_id)));
  const { data: farms } = await supabase
    .from('farms')
    .select('id, name, timezone, farm_type, currency_code')
    .in('id', farmIds);
  const farmById = new Map<string, Farm>();
  for (const f of (farms || []) as any[]) farmById.set(f.id, f);

  let sent = 0;
  let failed = 0;
  const results: any[] = [];

  for (const sub of subs as Subscription[]) {
    const farm = farmById.get(sub.farm_id);
    if (!farm) {
      results.push({ id: sub.id, skipped: 'farm not found' });
      continue;
    }

    if (!force && !isInDeliveryWindow(sub.delivery_time_local, farm.timezone || 'UTC')) {
      // Not their delivery time yet
      continue;
    }

    try {
      const summary = await buildDailySummary(supabase, farm);
      const todayLocal = new Intl.DateTimeFormat('en-GB', {
        timeZone: farm.timezone || 'UTC',
        day: '2-digit',
        month: 'short',
      }).format(new Date());
      const send = await sendWhatsappTemplate(sub.phone_e164, farm.name, todayLocal, summary);

      if (send.ok) {
        sent += 1;
        await supabase
          .from('whatsapp_subscriptions')
          .update({
            last_sent_at: new Date().toISOString(),
            last_send_status: 'ok',
            consecutive_failures: 0,
          })
          .eq('id', sub.id);
        results.push({ id: sub.id, ok: true });
      } else {
        failed += 1;
        await supabase
          .from('whatsapp_subscriptions')
          .update({
            last_send_status: send.error?.slice(0, 200) || 'failed',
            consecutive_failures: sub.consecutive_failures + 1,
            // Auto-disable after 5 consecutive failures (typically a bad
            // phone number or a revoked WhatsApp opt-in by the user).
            enabled: sub.consecutive_failures + 1 < 5,
          })
          .eq('id', sub.id);
        results.push({ id: sub.id, ok: false, error: send.error });
      }
    } catch (err: any) {
      failed += 1;
      console.error('whatsapp send error', sub.id, err);
      results.push({ id: sub.id, ok: false, error: err?.message || String(err) });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, sent, failed, total: subs.length, results: force ? results : undefined }),
    { headers: { 'content-type': 'application/json' } },
  );
});
