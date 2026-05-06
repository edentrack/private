/**
 * Pond Alerts Evaluator — Phase B Step 24 cron.
 *
 * For every enabled rule in `pond_alerts`, fetch the latest data for that
 * pond and decide whether the rule has tripped. If yes, write a row to the
 * `notifications` table (per farm member) and update `last_triggered_at`.
 *
 * Trigger: Supabase scheduled cron, runs every 15 minutes.
 *
 * Designed to be cheap — one query for active rules, then one query per
 * (pond, alert_type) combination. A farm with 5 ponds and 8 rules each
 * = 40 evaluations per cron run.
 *
 * Idempotency: a rule that's already triggered in the last 12 hours
 * doesn't fire again — avoids spam.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Don't re-trigger the same rule more than once every 12 hours.
const RETRIGGER_COOLDOWN_HOURS = 12;

interface PondAlert {
  id: string;
  farm_id: string;
  flock_id: string;
  alert_type: string;
  threshold: number;
  enabled: boolean;
  last_triggered_at: string | null;
  notify_via: string[];
}

interface Flock {
  id: string;
  name: string;
  current_count: number;
  type: string;
  arrival_date: string;
}

interface EvaluationResult {
  triggered: boolean;
  message?: string;
}

async function evaluateRule(
  supabase: SupabaseClient,
  alert: PondAlert,
  flock: Flock,
): Promise<EvaluationResult> {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

  switch (alert.alert_type) {
    // ─── Mortality per day ────────────────────────────────────────────
    case 'mortality_per_day': {
      const { data } = await supabase
        .from('mortality_logs')
        .select('count')
        .eq('farm_id', alert.farm_id)
        .eq('flock_id', alert.flock_id)
        .eq('event_date', today);
      const todaysMortality = (data || []).reduce((sum, r) => sum + (r.count || 0), 0);
      if (todaysMortality > alert.threshold) {
        return {
          triggered: true,
          message: `${flock.name}: ${todaysMortality} deaths today (threshold ${alert.threshold}).`,
        };
      }
      return { triggered: false };
    }

    // ─── No inspection logged in N days ───────────────────────────────
    case 'no_inspection_days': {
      const cutoff = new Date(Date.now() - alert.threshold * 86_400_000).toISOString();
      const { data } = await supabase
        .from('pond_inspections')
        .select('id')
        .eq('farm_id', alert.farm_id)
        .eq('flock_id', alert.flock_id)
        .gte('created_at', cutoff)
        .limit(1);
      if (!data || data.length === 0) {
        return {
          triggered: true,
          message: `${flock.name}: no inspection logged in ${alert.threshold}+ days.`,
        };
      }
      return { triggered: false };
    }

    // ─── Water quality breach (DO / pH / temp / NH3) ──────────────────
    case 'do_below':
    case 'ammonia_above':
    case 'ph_below':
    case 'ph_above':
    case 'temp_below':
    case 'temp_above': {
      // Latest water quality reading
      const { data: latest } = await supabase
        .from('water_quality_logs')
        .select('dissolved_oxygen, ph, ammonia_mgl, temperature_c, logged_at')
        .eq('farm_id', alert.farm_id)
        .eq('flock_id', alert.flock_id)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return { triggered: false };

      const { dissolved_oxygen, ph, ammonia_mgl, temperature_c } = latest as any;

      if (alert.alert_type === 'do_below' && dissolved_oxygen != null && dissolved_oxygen < alert.threshold) {
        return { triggered: true, message: `${flock.name}: DO is ${dissolved_oxygen} mg/L (below ${alert.threshold}). Aerate now.` };
      }
      if (alert.alert_type === 'ammonia_above' && ammonia_mgl != null && ammonia_mgl > alert.threshold) {
        return { triggered: true, message: `${flock.name}: ammonia is ${ammonia_mgl} mg/L (above ${alert.threshold}).` };
      }
      if (alert.alert_type === 'ph_below' && ph != null && ph < alert.threshold) {
        return { triggered: true, message: `${flock.name}: pH is ${ph} (below ${alert.threshold}).` };
      }
      if (alert.alert_type === 'ph_above' && ph != null && ph > alert.threshold) {
        return { triggered: true, message: `${flock.name}: pH is ${ph} (above ${alert.threshold}).` };
      }
      if (alert.alert_type === 'temp_below' && temperature_c != null && temperature_c < alert.threshold) {
        return { triggered: true, message: `${flock.name}: temperature is ${temperature_c}°C (below ${alert.threshold}).` };
      }
      if (alert.alert_type === 'temp_above' && temperature_c != null && temperature_c > alert.threshold) {
        return { triggered: true, message: `${flock.name}: temperature is ${temperature_c}°C (above ${alert.threshold}).` };
      }
      return { triggered: false };
    }

    // ─── SGR below threshold ──────────────────────────────────────────
    case 'sgr_below': {
      const { data: samples } = await supabase
        .from('sampling_events')
        .select('abw_g, sampled_at')
        .eq('farm_id', alert.farm_id)
        .eq('flock_id', alert.flock_id)
        .order('sampled_at', { ascending: false })
        .limit(2);
      if (!samples || samples.length < 2) return { triggered: false };

      const [latest, prev] = samples as Array<{ abw_g: number; sampled_at: string }>;
      const latestDate = String(latest.sampled_at).split('T')[0];
      const prevDate = String(prev.sampled_at).split('T')[0];
      if (latestDate === prevDate) return { triggered: false };

      const days = Math.max(
        1,
        Math.round((new Date(latestDate).getTime() - new Date(prevDate).getTime()) / 86_400_000),
      );
      if (latest.abw_g <= 0 || prev.abw_g <= 0) return { triggered: false };

      const sgr = ((Math.log(latest.abw_g) - Math.log(prev.abw_g)) / days) * 100;
      if (sgr < alert.threshold) {
        return {
          triggered: true,
          message: `${flock.name}: SGR is ${sgr.toFixed(2)}%/day (below ${alert.threshold}). Check water + feed quality.`,
        };
      }
      return { triggered: false };
    }

    // ─── FCR above threshold ──────────────────────────────────────────
    case 'fcr_above': {
      // Approximate FCR over the cycle — same calc as the dashboard pill.
      const startDate = String(flock.arrival_date).split('T')[0];
      const { data: feedLogs } = await supabase
        .from('feed_usage_logs')
        .select('quantity_used')
        .eq('farm_id', alert.farm_id)
        .gte('created_at', `${startDate}T00:00:00`);

      const totalFarmFeedKg = (feedLogs || []).reduce((s, l) => s + (Number(l.quantity_used) || 0), 0);

      // Aqua share of farm
      const { data: aquaFlocks } = await supabase
        .from('flocks')
        .select('id, current_count, type')
        .eq('farm_id', alert.farm_id)
        .eq('status', 'active')
        .in('type', ['Catfish', 'Tilapia', 'Clarias', 'Other Fish']);
      const aquaTotal = (aquaFlocks || []).reduce((s, f) => s + (Number(f.current_count) || 0), 0);
      const ourShare = aquaTotal > 0 ? flock.current_count / aquaTotal : 0;
      const myFeedKg = totalFarmFeedKg * ourShare;

      // Biomass gained
      const { data: firstSample } = await supabase
        .from('sampling_events')
        .select('abw_g')
        .eq('farm_id', alert.farm_id)
        .eq('flock_id', alert.flock_id)
        .order('sampled_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const { data: lastSample } = await supabase
        .from('sampling_events')
        .select('abw_g')
        .eq('farm_id', alert.farm_id)
        .eq('flock_id', alert.flock_id)
        .order('sampled_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!firstSample || !lastSample) return { triggered: false };
      const biomassGainedKg =
        ((Number((lastSample as any).abw_g) - Number((firstSample as any).abw_g)) * flock.current_count) / 1000;
      if (biomassGainedKg <= 0 || myFeedKg <= 0) return { triggered: false };

      const fcr = myFeedKg / biomassGainedKg;
      if (fcr > alert.threshold) {
        return {
          triggered: true,
          message: `${flock.name}: FCR is ${fcr.toFixed(2)} (above ${alert.threshold}). Audit feeding plan + water quality.`,
        };
      }
      return { triggered: false };
    }

    default:
      return { triggered: false };
  }
}

async function triggerAlert(
  supabase: SupabaseClient,
  alert: PondAlert,
  message: string,
) {
  // Fan out a notification to every farm_member of this farm.
  const { data: members } = await supabase
    .from('farm_members')
    .select('user_id')
    .eq('farm_id', alert.farm_id);

  if (members && members.length > 0) {
    const rows = members.map((m: any) => ({
      farm_id: alert.farm_id,
      user_id: m.user_id,
      title: 'Pond Alert',
      body: message,
      type: 'pond_alert',
      data: { alert_id: alert.id, flock_id: alert.flock_id, alert_type: alert.alert_type },
      read: false,
    }));
    await supabase.from('notifications').insert(rows);
  }

  await supabase
    .from('pond_alerts')
    .update({ last_triggered_at: new Date().toISOString() })
    .eq('id', alert.id);
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Pull every enabled rule that hasn't fired in the cooldown window.
  const cooldownCutoff = new Date(Date.now() - RETRIGGER_COOLDOWN_HOURS * 3600_000).toISOString();
  const { data: alerts, error: alertsError } = await supabase
    .from('pond_alerts')
    .select('*')
    .eq('enabled', true)
    .or(`last_triggered_at.is.null,last_triggered_at.lt.${cooldownCutoff}`);

  if (alertsError) {
    return new Response(JSON.stringify({ error: alertsError.message }), { status: 500 });
  }
  if (!alerts || alerts.length === 0) {
    return new Response(JSON.stringify({ ok: true, evaluated: 0, triggered: 0 }));
  }

  // Pull all relevant flocks in one query.
  const flockIds = Array.from(new Set(alerts.map((a: any) => a.flock_id)));
  const { data: flocks } = await supabase
    .from('flocks')
    .select('id, name, current_count, type, arrival_date, farm_id')
    .in('id', flockIds);
  const flockById = new Map<string, Flock>();
  for (const f of (flocks || []) as any[]) flockById.set(f.id, f);

  let triggered = 0;
  for (const alert of alerts as PondAlert[]) {
    const flock = flockById.get(alert.flock_id);
    if (!flock) continue;
    try {
      const r = await evaluateRule(supabase, alert, flock);
      if (r.triggered && r.message) {
        await triggerAlert(supabase, alert, r.message);
        triggered += 1;
      }
    } catch (err) {
      console.error('Failed to evaluate alert', alert.id, err);
    }
  }

  return new Response(JSON.stringify({ ok: true, evaluated: alerts.length, triggered }), {
    headers: { 'content-type': 'application/json' },
  });
});
