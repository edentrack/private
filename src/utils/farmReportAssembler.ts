/**
 * Farm Report Assembler — Phase G.
 *
 * Pulls all the data a farmer might want in a single report (financial
 * summary, production, mortality, vaccinations, feed) and returns it as
 * a unified shape. Two consumers:
 *   - farmReportPDF.ts → formats as a print-ready PDF for bank/co-op
 *     submission
 *   - farmReportExports.ts → flattens into CSV files for analyst review
 *
 * Caller pattern:
 *   const data = await assembleFarmReport({ farmId, startDate, endDate, supabase });
 *   await downloadFarmReportPDF(data);
 *   await downloadFarmReportCSVs(data);
 *
 * PERF NOTE (May 2026): the previous version had an O(N) fanout — for each
 * flock it issued 6 separate REST calls (mortality, expenses, egg sales,
 * bird sales, revenue, feed), in addition to 8 farm-wide queries. With 5
 * flocks that meant 38 round-trips, and browsers throttle concurrent
 * connections per host (~6), so 30-day reports timed out past 5 minutes.
 *
 * The current version fires ONE query per table for the whole farm in
 * the date window, then buckets-by-flock in memory. That's a fixed 9-10
 * round-trips regardless of how many flocks the farm has.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface FarmReportInput {
  farmId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  supabase: SupabaseClient;
}

export interface FarmReportFlockSummary {
  id: string;
  name: string;
  type: string;
  initialCount: number;
  currentCount: number;
  arrivalDate: string;
  ageWeeks: number;
  mortalityCount: number;
  survivalRate: number;
  feedKgUsed: number;
  expensesTotal: number;
  revenueTotal: number;
  netProfit: number;
}

export interface FarmReportData {
  // Header
  farmName: string;
  farmType: string;
  country: string;
  currency: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  // Top-level KPIs
  totalFlocks: number;
  totalActiveAnimals: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  marginPercent: number;
  totalMortality: number;
  // Per-category breakdowns
  expensesByCategory: Array<{ category: string; amount: number; percent: number }>;
  revenueBySource: Array<{ source: string; amount: number; percent: number }>;
  // Per-flock
  flocks: FarmReportFlockSummary[];
  // Vaccinations completed in window
  vaccinations: Array<{ flockName: string; vaccineName: string; date: string; notes: string | null }>;
  // Mortality events
  mortalityEvents: Array<{ flockName: string; date: string; count: number; cause: string }>;
  // Feed totals
  totalFeedKg: number;
  feedByType: Array<{ name: string; kg: number }>;
  // Egg production (if applicable)
  totalEggsCollected: number;
  totalEggsSold: number;
  // Aquaculture-specific (if applicable)
  totalBiomassHarvestedKg: number;
}

/**
 * Internal helper: bucket rows by `flock_id` and sum a numeric column.
 * Returns a Map<flockId, total>. Rows missing flock_id (farm-level) are
 * placed under the 'null' key — callers can ignore that bucket.
 */
function sumByFlockId<T extends { flock_id?: string | null }>(
  rows: T[] | null | undefined,
  pickAmount: (row: T) => number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows || []) {
    const k = r.flock_id || '';
    if (!k) continue;
    out.set(k, (out.get(k) || 0) + (Number(pickAmount(r)) || 0));
  }
  return out;
}

export async function assembleFarmReport(input: FarmReportInput): Promise<FarmReportData> {
  const { farmId, startDate, endDate, supabase } = input;

  // PHASE 1: header + flock list. Both are cheap; do them in parallel.
  const [farmResp, flocksResp] = await Promise.all([
    supabase
      .from('farms')
      .select('name, farm_type, country, currency_code')
      .eq('id', farmId)
      .single(),
    supabase
      .from('flocks')
      .select('id, name, type, initial_count, current_count, arrival_date, status')
      .eq('farm_id', farmId),
  ]);
  const farmData = farmResp.data;
  const allFlocks = (flocksResp.data || []) as any[];

  // PHASE 2: every event-table query, fired once for the whole farm.
  // Each query carries `flock_id` so we can bucket per-flock in memory
  // without a second round-trip. `harvest_records` is wrapped because
  // poultry/rabbits farms don't have the table populated; we don't want
  // a single missing aquaculture table to fail the whole report.
  const harvestPromise = supabase
    .from('harvest_records')
    .select('biomass_kg')
    .eq('farm_id', farmId)
    .gte('harvest_date', startDate)
    .lte('harvest_date', endDate)
    .then(r => r, () => ({ data: null }));

  const [
    expensesRes,
    revenuesRes,
    eggSalesRes,
    birdSalesRes,
    mortalityRes,
    vaccinationsRes,
    feedRes,
    eggCollRes,
    harvestRes,
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select('amount, category, flock_id')
      .eq('farm_id', farmId)
      .gte('incurred_on', startDate)
      .lte('incurred_on', endDate),
    supabase
      .from('revenues')
      .select('amount, source_type, flock_id')
      .eq('farm_id', farmId)
      .gte('revenue_date', startDate)
      .lte('revenue_date', endDate),
    supabase
      .from('egg_sales')
      .select('total_amount, total_eggs, flock_id')
      .eq('farm_id', farmId)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate),
    supabase
      .from('bird_sales')
      .select('total_amount, flock_id')
      .eq('farm_id', farmId)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate),
    supabase
      .from('mortality_logs')
      .select('count, cause, event_date, flock_id')
      .eq('farm_id', farmId)
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .order('event_date', { ascending: false }),
    supabase
      .from('vaccinations')
      .select('vaccine_name, scheduled_date, administered_date, completed, notes, flock_id')
      .eq('farm_id', farmId)
      .eq('completed', true)
      .gte('administered_date', startDate)
      .lte('administered_date', endDate),
    supabase
      .from('feed_givings')
      .select('quantity_given, feed_type_id, flock_id')
      .eq('farm_id', farmId)
      .gte('given_at', `${startDate}T00:00:00`)
      .lte('given_at', `${endDate}T23:59:59`),
    supabase
      .from('egg_collections')
      .select('total_eggs')
      .eq('farm_id', farmId)
      .gte('collected_on', startDate)
      .lte('collected_on', endDate),
    harvestPromise,
  ]);

  // PHASE 3: bucket-by-flock so the per-flock summary doesn't need its own
  // round-trips.
  //
  // CRITICAL: every egg sale and bird sale gets written to TWO tables —
  // the canonical detail row in `egg_sales`/`bird_sales`, and a shadow
  // row in `revenues` with `source_type` set to 'egg_sale'/'bird_sale'.
  // If we sum both naively, every sale is double-counted. The legacy
  // `reportGenerator.ts:462` filter already excludes the shadow rows.
  // We do the same here. Without this filter, a 800k egg sale shows up
  // as 1.6M revenue in the report — Greg's "800k income vs 1.2m profit"
  // bug.
  const otherRevenuesOnly = (revenuesRes.data || []).filter((r: any) =>
    r.source_type !== 'egg_sale' && r.source_type !== 'bird_sale',
  );

  const expensesByFlock = sumByFlockId<any>(expensesRes.data, r => r.amount);
  const revenuesByFlock = sumByFlockId<any>(otherRevenuesOnly, r => r.amount);
  const eggSalesByFlock = sumByFlockId<any>(eggSalesRes.data, r => r.total_amount);
  const birdSalesByFlock = sumByFlockId<any>(birdSalesRes.data, r => r.total_amount);
  const feedByFlock = sumByFlockId<any>(feedRes.data, r => r.quantity_given);
  const mortalityByFlock = sumByFlockId<any>(mortalityRes.data, r => r.count);

  const flockSummaries: FarmReportFlockSummary[] = allFlocks.map(f => {
    const mortalityCount = mortalityByFlock.get(f.id) || 0;
    const expensesTotal = expensesByFlock.get(f.id) || 0;
    const revenueTotal =
      (eggSalesByFlock.get(f.id) || 0) +
      (birdSalesByFlock.get(f.id) || 0) +
      (revenuesByFlock.get(f.id) || 0);
    const feedKgUsed = feedByFlock.get(f.id) || 0;

    const ageMs = Date.now() - new Date(f.arrival_date).getTime();
    const ageWeeks = Math.max(0, Math.floor(ageMs / (7 * 86_400_000)));
    const initialCount = Number(f.initial_count) || 0;
    const survivalRate = initialCount > 0
      ? Math.max(0, Math.min(100, ((initialCount - mortalityCount) / initialCount) * 100))
      : 0;

    return {
      id: f.id,
      name: f.name,
      type: f.type,
      initialCount,
      currentCount: Number(f.current_count) || 0,
      arrivalDate: f.arrival_date,
      ageWeeks,
      mortalityCount,
      survivalRate,
      feedKgUsed,
      expensesTotal,
      revenueTotal,
      netProfit: revenueTotal - expensesTotal,
    };
  });

  // PHASE 4: top-level totals + category aggregations.
  // `otherRevenuesOnly` excludes egg_sale/bird_sale shadow rows — see the
  // comment in PHASE 3 for why.
  const totalExpenses = (expensesRes.data || []).reduce((s, r: any) => s + Number(r.amount || 0), 0);
  const totalEggSales = (eggSalesRes.data || []).reduce((s, r: any) => s + Number(r.total_amount || 0), 0);
  const totalBirdSales = (birdSalesRes.data || []).reduce((s, r: any) => s + Number(r.total_amount || 0), 0);
  const totalOtherRevenue = otherRevenuesOnly.reduce((s, r: any) => s + Number(r.amount || 0), 0);
  const totalRevenue = totalEggSales + totalBirdSales + totalOtherRevenue;
  const netProfit = totalRevenue - totalExpenses;

  const expensesByCategoryMap = new Map<string, number>();
  for (const e of expensesRes.data || []) {
    const cat = (e as any).category || 'other';
    expensesByCategoryMap.set(cat, (expensesByCategoryMap.get(cat) || 0) + Number((e as any).amount || 0));
  }
  const expensesByCategory = Array.from(expensesByCategoryMap.entries())
    .map(([category, amount]) => ({ category, amount, percent: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const revenueBySource: Array<{ source: string; amount: number; percent: number }> = [
    { source: 'Egg sales', amount: totalEggSales, percent: 0 },
    { source: 'Bird/animal sales', amount: totalBirdSales, percent: 0 },
    { source: 'Other revenue', amount: totalOtherRevenue, percent: 0 },
  ]
    .map(r => ({ ...r, percent: totalRevenue > 0 ? (r.amount / totalRevenue) * 100 : 0 }))
    .filter(r => r.amount > 0);

  // Mortality + vaccination events, with flock-name lookup.
  const flockNameById = new Map(allFlocks.map(f => [f.id, f.name]));
  const mortalityEvents = (mortalityRes.data || []).map((m: any) => ({
    flockName: flockNameById.get(m.flock_id) || 'Unknown',
    date: m.event_date,
    count: Number(m.count) || 0,
    cause: m.cause || '-',
  }));

  const vaccinations = (vaccinationsRes.data || []).map((v: any) => ({
    flockName: flockNameById.get(v.flock_id) || 'Unknown',
    vaccineName: v.vaccine_name,
    date: v.administered_date || v.scheduled_date,
    notes: v.notes,
  }));

  const totalFeedKg = (feedRes.data || []).reduce((s, r: any) => s + Number(r.quantity_given || 0), 0);
  const totalEggsCollected = (eggCollRes.data || []).reduce((s, r: any) => s + Number(r.total_eggs || 0), 0);
  const totalEggsSold = (eggSalesRes.data || []).reduce((s, r: any) => s + Number(r.total_eggs || 0), 0);
  const totalActiveAnimals = allFlocks
    .filter(f => f.status === 'active')
    .reduce((s, f) => s + (Number(f.current_count) || 0), 0);

  const totalBiomassHarvestedKg = ((harvestRes as any)?.data || []).reduce(
    (s: number, r: any) => s + Number(r.biomass_kg || 0),
    0,
  );

  return {
    farmName: (farmData as any)?.name || 'Farm',
    farmType: (farmData as any)?.farm_type || 'poultry',
    country: (farmData as any)?.country || '-',
    currency: (farmData as any)?.currency_code || 'XAF',
    startDate,
    endDate,
    generatedAt: new Date().toISOString(),
    totalFlocks: allFlocks.filter(f => f.status === 'active').length,
    totalActiveAnimals,
    totalRevenue,
    totalExpenses,
    netProfit,
    marginPercent: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
    totalMortality: mortalityEvents.reduce((s, m) => s + m.count, 0),
    expensesByCategory,
    revenueBySource,
    flocks: flockSummaries,
    vaccinations,
    mortalityEvents,
    totalFeedKg,
    feedByType: [], // future: would need a join to feed_types names
    totalEggsCollected,
    totalEggsSold,
    totalBiomassHarvestedKg,
  };
}
