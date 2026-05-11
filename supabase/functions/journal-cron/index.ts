/**
 * Farm Journal cron — fires from Supabase scheduled functions.
 *
 * Runs once daily (recommended: 06:00 farm local time, but UTC works
 * for a v1 — most farmers will see the entry whenever they open the
 * app next). Two jobs:
 *
 *   1. Vet withdrawal clear notices. For every vet_log whose
 *      withdrawal period ends today AND journal_clear_announced is
 *      false, post a journal entry so the farmer knows the eggs /
 *      birds are saleable again.
 *
 *   2. Weekly farm summary. Every Sunday, for each active farm, post
 *      one journal entry summarising the past 7 days: collected eggs,
 *      mortalities, sales revenue, expenses, net P&L, biggest wins.
 *      Skips farms with zero activity (avoids "you did nothing this
 *      week" entries that feel passive-aggressive).
 *
 * Called by Supabase Scheduled Function (set up via SQL or Dashboard).
 * Manual invocation also fine — function is idempotent thanks to the
 * journal_clear_announced flag and the once-per-week dedupe check.
 *
 * Security: service-role only. Refuse if the request doesn't carry
 * the service-role key — protects against accidental public hits.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || SUPABASE_SERVICE_KEY;

interface VetClear {
  id: string;
  farm_id: string;
  flock_id: string | null;
  medication: string | null;
  withdrawal_period_days: number;
  visit_date: string;
}

interface Farm {
  id: string;
  name: string;
  currency_code: string | null;
  currency: string | null;
}

async function runVetClearCheck(supabase: SupabaseClient): Promise<number> {
  // Pull all unrun vet logs with a withdrawal period set.
  const { data: candidates } = await supabase
    .from('vet_logs')
    .select('id, farm_id, flock_id, medication, withdrawal_period_days, visit_date')
    .eq('journal_clear_announced', false)
    .not('withdrawal_period_days', 'is', null)
    .gt('withdrawal_period_days', 0);

  if (!candidates?.length) return 0;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let inserted = 0;

  for (const log of (candidates as VetClear[])) {
    const visit = new Date(log.visit_date);
    const clearDate = new Date(visit);
    clearDate.setDate(clearDate.getDate() + log.withdrawal_period_days);
    clearDate.setUTCHours(0, 0, 0, 0);

    // Only announce on or after the clear date.
    if (clearDate > today) continue;

    let flockName: string | null = null;
    if (log.flock_id) {
      const { data: flock } = await supabase
        .from('flocks')
        .select('name')
        .eq('id', log.flock_id)
        .maybeSingle();
      flockName = (flock as { name: string } | null)?.name ?? null;
    }

    const med = log.medication || 'medication';
    const target = flockName || 'the flock';

    const { error: insertErr } = await supabase.from('journal_entries').insert({
      farm_id: log.farm_id,
      flock_id: log.flock_id,
      author_id: null,
      author_role: null,
      author_kind: 'eden',
      channel: 'notes',
      entry_type: 'health',
      title: 'Withdrawal period clear',
      body: `The ${log.withdrawal_period_days}-day withdrawal period for ${med} on ${target} ends today. Eggs and animals are safe to sell.`,
      metadata: { kind: 'withdrawal_clear', vet_log_id: log.id, medication: log.medication },
    });

    if (insertErr) {
      console.warn('[journal-cron] withdrawal_clear insert failed:', insertErr);
      continue;
    }

    await supabase
      .from('vet_logs')
      .update({ journal_clear_announced: true })
      .eq('id', log.id);

    inserted += 1;
  }

  return inserted;
}

interface WeeklyTotals {
  eggs_collected: number;
  mortalities: number;
  revenue: number;
  expenses: number;
  feed_bags_used: number;
}

interface SparklinePoint {
  x: string;   // "MM-DD" tick label
  y: number;
}

/**
 * Build the 7-day eggs sparkline that gets embedded in the weekly
 * summary entry's metadata.chart. Missing days render as 0 (honest
 * line, no implicit gap fill).
 */
async function computeEggsSparkline(
  supabase: SupabaseClient,
  farmId: string,
  weekStart: string,
): Promise<SparklinePoint[]> {
  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);

  const { data } = await supabase
    .from('egg_collections')
    .select('collection_date, total_eggs')
    .eq('farm_id', farmId)
    .gte('collection_date', weekStart)
    .lte('collection_date', weekEnd);

  const byDay: Record<string, number> = {};
  for (const row of (data ?? []) as { collection_date: string; total_eggs: number | null }[]) {
    const day = (row.collection_date ?? '').slice(0, 10);
    if (!day) continue;
    byDay[day] = (byDay[day] ?? 0) + Number(row.total_eggs ?? 0);
  }

  const points: SparklinePoint[] = [];
  const start = new Date(weekStart);
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    points.push({ x: key.slice(5), y: byDay[key] ?? 0 });
  }
  return points;
}

async function computeWeeklyTotals(
  supabase: SupabaseClient,
  farmId: string,
  weekStart: string,
  weekEnd: string,
): Promise<WeeklyTotals> {
  const [eggs, morts, sales, exps, feed] = await Promise.all([
    supabase
      .from('egg_collections')
      .select('total_eggs')
      .eq('farm_id', farmId)
      .gte('collection_date', weekStart)
      .lte('collection_date', weekEnd),
    supabase
      .from('mortality_logs')
      .select('count')
      .eq('farm_id', farmId)
      .gte('event_date', weekStart)
      .lte('event_date', weekEnd),
    supabase
      .from('bird_sales')
      .select('total_amount')
      .eq('farm_id', farmId)
      .gte('sale_date', weekStart)
      .lte('sale_date', weekEnd),
    supabase
      .from('expenses')
      .select('amount')
      .eq('farm_id', farmId)
      .gte('incurred_on', weekStart)
      .lte('incurred_on', weekEnd),
    supabase
      .from('tasks')
      .select('data_payload')
      .eq('farm_id', farmId)
      .eq('status', 'completed')
      .gte('completed_at', weekStart)
      .lte('completed_at', weekEnd + 'T23:59:59'),
  ]);

  const sum = <T extends Record<string, unknown>>(rows: T[] | null | undefined, key: keyof T): number =>
    (rows ?? []).reduce((acc: number, r) => acc + Number(r[key] ?? 0), 0);

  return {
    eggs_collected: sum(eggs.data, 'total_eggs'),
    mortalities: sum(morts.data, 'count'),
    revenue: sum(sales.data, 'total_amount'),
    expenses: sum(exps.data, 'amount'),
    feed_bags_used: (feed.data ?? []).reduce((acc: number, t) => {
      const payload = t.data_payload as { bags_used?: number } | null;
      return acc + (Number(payload?.bags_used) || 0);
    }, 0),
  };
}

async function runWeeklySummaries(supabase: SupabaseClient): Promise<number> {
  const today = new Date();
  // Only fire on Sundays (UTC day = 0). v2 can switch to per-farm
  // local time once we wire farm.timezone.
  if (today.getUTCDay() !== 0) return 0;

  const weekEnd = today.toISOString().slice(0, 10);
  const weekStartDate = new Date(today);
  weekStartDate.setDate(weekStartDate.getDate() - 6);
  const weekStart = weekStartDate.toISOString().slice(0, 10);

  const { data: farms } = await supabase
    .from('farms')
    .select('id, name, currency_code, currency');

  if (!farms?.length) return 0;

  let inserted = 0;
  for (const farm of farms as Farm[]) {
    // De-dupe: only one weekly summary per farm per week.
    const { data: existing } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('farm_id', farm.id)
      .eq('author_kind', 'eden')
      .eq('entry_type', 'auto_summary')
      .gte('created_at', weekStart)
      .lte('created_at', weekEnd + 'T23:59:59')
      .filter('metadata->>kind', 'eq', 'weekly_summary')
      .limit(1);
    if (existing && existing.length > 0) continue;

    const totals = await computeWeeklyTotals(supabase, farm.id, weekStart, weekEnd);
    const totalActivity = totals.eggs_collected + totals.mortalities + totals.revenue + totals.expenses + totals.feed_bags_used;
    if (totalActivity === 0) continue;  // Skip silent farms

    const pnl = totals.revenue - totals.expenses;
    const currency = farm.currency_code ?? farm.currency ?? 'XAF';

    const parts: string[] = [];
    if (totals.eggs_collected > 0) parts.push(`${totals.eggs_collected.toLocaleString()} eggs collected`);
    if (totals.feed_bags_used > 0) parts.push(`${totals.feed_bags_used} bags of feed used`);
    if (totals.mortalities > 0) parts.push(`${totals.mortalities} losses`);
    if (totals.revenue > 0) parts.push(`${totals.revenue.toLocaleString()} ${currency} in sales`);
    if (totals.expenses > 0) parts.push(`${totals.expenses.toLocaleString()} ${currency} in expenses`);

    const headline = parts.join(' · ');
    const pnlLine = totals.revenue > 0 || totals.expenses > 0
      ? ` Net P&L: ${pnl >= 0 ? '+' : ''}${pnl.toLocaleString()} ${currency}.`
      : '';

    // Chart payload — ChartBlock.tsx reads metadata.chart and renders.
    // Sparkline for eggs (visual trend), bar chart for the financial
    // story (revenue / expenses / net), one or the other based on
    // which side of the week had more activity.
    const eggSpark = totals.eggs_collected > 0
      ? await computeEggsSparkline(supabase, farm.id, weekStart)
      : null;
    const showFinancialBar = totals.revenue > 0 || totals.expenses > 0;
    const chart = showFinancialBar
      ? {
          type: 'bar',
          label: 'Revenue vs Expenses vs Net',
          currency,
          points: [
            { x: 'Revenue',  y: totals.revenue,  color: '#3D5F42' },
            { x: 'Expenses', y: -totals.expenses, color: '#dc2626' },
            { x: 'Net',      y: pnl,             color: pnl >= 0 ? '#3D5F42' : '#dc2626' },
          ],
        }
      : eggSpark
      ? { type: 'sparkline', label: 'Eggs / day', points: eggSpark }
      : null;

    const { error: insErr } = await supabase.from('journal_entries').insert({
      farm_id: farm.id,
      flock_id: null,
      author_id: null,
      author_role: null,
      author_kind: 'eden',
      channel: 'notes',
      entry_type: 'auto_summary',
      title: `Week of ${weekStart}`,
      body: `${headline}.${pnlLine}`,
      metadata: {
        kind: 'weekly_summary',
        week_start: weekStart,
        week_end: weekEnd,
        totals,
        currency,
        pnl,
        chart,
      },
    });

    if (insErr) {
      console.warn('[journal-cron] weekly_summary insert failed for farm', farm.id, insErr);
      continue;
    }
    inserted += 1;
  }

  return inserted;
}

Deno.serve(async (req: Request) => {
  // Only allow service-role / explicit CRON_SECRET callers.
  const authHeader = req.headers.get('authorization') ?? '';
  const provided = authHeader.replace(/^Bearer\s+/i, '');
  if (provided !== SUPABASE_SERVICE_KEY && provided !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const [vetClears, weekly] = await Promise.all([
      runVetClearCheck(supabase),
      runWeeklySummaries(supabase),
    ]);
    return new Response(
      JSON.stringify({ ok: true, vet_clears: vetClears, weekly_summaries: weekly }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[journal-cron] failed:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
