import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Creditworthiness scoring for African smallholder farmers.
 *
 * Banks rarely lend to smallholders because they have no formal credit history.
 * EdenTrack data IS that history: regular logging proves operational discipline,
 * stable production proves capability, financial logging proves cash-flow visibility.
 *
 * Score is 0-100 split across 5 components. Tier mapping:
 *   80-100  Excellent (likely loan approval at standard rates)
 *   65-79   Good (loan approval likely, may need small collateral)
 *   50-64   Fair (loan possible, conditions or higher rate)
 *   35-49   Building (more data needed; suggest 3 more months tracking)
 *   0-34    Insufficient (too little data to assess)
 */

export interface CreditScoreComponent {
  key: string;
  label: string;
  score: number; // 0..maxScore
  maxScore: number;
  detail: string;
}

export interface CreditScoreResult {
  total: number; // 0..100
  tier: 'excellent' | 'good' | 'fair' | 'building' | 'insufficient';
  tierLabel: string;
  components: CreditScoreComponent[];
  metrics: {
    daysOnPlatform: number;
    activeDaysLast90: number;
    totalRevenueLast12mo: number;
    totalExpensesLast12mo: number;
    netLast12mo: number;
    salesEntryCount: number;
    expenseEntryCount: number;
    mortalityCount: number;
    mortalityRatePct: number; // estimated %
    waterQualityEmergencies: number;
    vaccinationsOnSchedulePct: number | null;
    activeFlockCount: number;
    totalAnimals: number;
  };
  generatedAt: string;
}

interface BuildArgs {
  farmId: string;
  supabase: SupabaseClient;
}

function tierFor(total: number): { tier: CreditScoreResult['tier']; tierLabel: string } {
  if (total >= 80) return { tier: 'excellent', tierLabel: 'Excellent' };
  if (total >= 65) return { tier: 'good', tierLabel: 'Good' };
  if (total >= 50) return { tier: 'fair', tierLabel: 'Fair' };
  if (total >= 35) return { tier: 'building', tierLabel: 'Building' };
  return { tier: 'insufficient', tierLabel: 'Insufficient data' };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export async function buildCreditScore({ farmId, supabase }: BuildArgs): Promise<CreditScoreResult> {
  const since90 = isoDaysAgo(90);
  const since365 = isoDaysAgo(365);

  const [farmRes, flocksRes, salesRes, expensesRes, mortRes, waterRes, vaxRes] = await Promise.all([
    supabase.from('farms').select('id, name, created_at').eq('id', farmId).single(),
    supabase
      .from('flocks')
      .select('id, current_count, initial_count, status, start_date, archived_at')
      .eq('farm_id', farmId),
    supabase
      .from('sales_invoices')
      .select('total, invoice_date, status')
      .eq('farm_id', farmId)
      .gte('invoice_date', since365)
      .neq('status', 'cancelled'),
    supabase
      .from('expenses')
      .select('amount, incurred_on')
      .eq('farm_id', farmId)
      .gte('incurred_on', since365),
    supabase
      .from('mortality_logs')
      .select('count, event_date')
      .eq('farm_id', farmId)
      .gte('event_date', since365),
    supabase
      .from('water_quality_logs')
      .select('dissolved_oxygen, ammonia_mgl, ph, log_date')
      .eq('farm_id', farmId)
      .gte('log_date', since90),
    supabase
      .from('vaccinations')
      .select('id, status, scheduled_date')
      .eq('farm_id', farmId)
      .gte('scheduled_date', since365),
  ]);

  const farm = farmRes.data as { id: string; name: string; created_at: string } | null;
  const daysOnPlatform = farm?.created_at
    ? Math.max(1, Math.floor((Date.now() - new Date(farm.created_at).getTime()) / 86400_000))
    : 0;

  const flocks = (flocksRes.data || []) as Array<{
    current_count: number;
    initial_count: number;
    status: string;
  }>;
  const activeFlocks = flocks.filter((f) => f.status !== 'archived');
  const totalAnimals = activeFlocks.reduce((s, f) => s + (f.current_count ?? 0), 0);
  const totalInitial = flocks.reduce((s, f) => s + (f.initial_count ?? 0), 0);

  const sales = (salesRes.data || []) as Array<{ total: number; invoice_date: string; status: string }>;
  const expenses = (expensesRes.data || []) as Array<{ amount: number; incurred_on: string }>;
  const mortality = (mortRes.data || []) as Array<{ count: number; event_date: string }>;
  const water = (waterRes.data || []) as Array<{
    dissolved_oxygen: number | null;
    ammonia_mgl: number | null;
    ph: number | null;
  }>;
  const vax = (vaxRes.data || []) as Array<{ status: string; scheduled_date: string }>;

  const totalRevenueLast12mo = sales.reduce((s, x) => s + (x.total ?? 0), 0);
  const totalExpensesLast12mo = expenses.reduce((s, x) => s + (x.amount ?? 0), 0);
  const netLast12mo = totalRevenueLast12mo - totalExpensesLast12mo;
  const mortalityCount = mortality.reduce((s, x) => s + (x.count ?? 0), 0);
  const mortalityRatePct = totalInitial > 0 ? (mortalityCount / totalInitial) * 100 : 0;

  const today = new Date();
  const cutoff90 = new Date(today.getTime() - 90 * 86400_000);
  const dayKey = (d: string) => d.slice(0, 10);
  const activeDays = new Set<string>();
  sales.forEach((s) => {
    if (new Date(s.invoice_date) >= cutoff90) activeDays.add(dayKey(s.invoice_date));
  });
  expenses.forEach((e) => {
    if (new Date(e.incurred_on) >= cutoff90) activeDays.add(dayKey(e.incurred_on));
  });
  mortality.forEach((m) => {
    if (new Date(m.event_date) >= cutoff90) activeDays.add(dayKey(m.event_date));
  });
  const activeDaysLast90 = activeDays.size;

  const waterQualityEmergencies = water.filter(
    (w) =>
      (w.dissolved_oxygen != null && w.dissolved_oxygen < 3) ||
      (w.ammonia_mgl != null && w.ammonia_mgl > 0.5) ||
      (w.ph != null && (w.ph < 6 || w.ph > 9.5))
  ).length;

  const dueVax = vax.filter((v) => new Date(v.scheduled_date) <= today);
  const completedVax = dueVax.filter((v) => v.status === 'completed').length;
  const vaccinationsOnSchedulePct = dueVax.length > 0 ? (completedVax / dueVax.length) * 100 : null;

  const components: CreditScoreComponent[] = [];

  // 1) Data completeness (25 max) — proxies operational discipline.
  const completenessRatio = Math.min(1, activeDaysLast90 / 60); // 60+ active days = full
  const completenessScore = Math.round(completenessRatio * 25);
  components.push({
    key: 'data_completeness',
    label: 'Data completeness',
    score: completenessScore,
    maxScore: 25,
    detail: `${activeDaysLast90} active days in last 90 (target: 60+)`,
  });

  // 2) Financial discipline (25 max) — both directions logged + net positive.
  let financeScore = 0;
  if (sales.length >= 6) financeScore += 10;
  else if (sales.length >= 1) financeScore += 5;
  if (expenses.length >= 12) financeScore += 8;
  else if (expenses.length >= 1) financeScore += 4;
  if (netLast12mo > 0) financeScore += 7;
  else if (netLast12mo === 0) financeScore += 2;
  components.push({
    key: 'financial_discipline',
    label: 'Financial discipline',
    score: Math.min(25, financeScore),
    maxScore: 25,
    detail: `${sales.length} sales, ${expenses.length} expenses, net ${netLast12mo >= 0 ? '+' : ''}${Math.round(netLast12mo).toLocaleString()}`,
  });

  // 3) Production track record (25 max) — low mortality + active flocks.
  let productionScore = 0;
  if (totalAnimals > 0) productionScore += 10;
  if (activeFlocks.length >= 2) productionScore += 5;
  else if (activeFlocks.length === 1) productionScore += 3;
  if (mortalityRatePct < 5) productionScore += 10;
  else if (mortalityRatePct < 10) productionScore += 7;
  else if (mortalityRatePct < 15) productionScore += 4;
  else productionScore += 1;
  components.push({
    key: 'production',
    label: 'Production track record',
    score: Math.min(25, productionScore),
    maxScore: 25,
    detail: `${totalAnimals.toLocaleString()} animals, ${activeFlocks.length} active units, ${mortalityRatePct.toFixed(1)}% mortality`,
  });

  // 4) Tenure on platform (15 max) — longer history = more credible.
  let tenureScore = 0;
  if (daysOnPlatform >= 365) tenureScore = 15;
  else if (daysOnPlatform >= 180) tenureScore = 12;
  else if (daysOnPlatform >= 90) tenureScore = 8;
  else if (daysOnPlatform >= 30) tenureScore = 4;
  else tenureScore = 1;
  components.push({
    key: 'tenure',
    label: 'Tenure on platform',
    score: tenureScore,
    maxScore: 15,
    detail: `${daysOnPlatform} day${daysOnPlatform !== 1 ? 's' : ''} since farm created`,
  });

  // 5) Operational health (10 max) — vaccinations on schedule, no water emergencies.
  let opsScore = 0;
  if (vaccinationsOnSchedulePct == null) {
    opsScore += 4; // no schedule yet — neutral
  } else if (vaccinationsOnSchedulePct >= 90) opsScore += 7;
  else if (vaccinationsOnSchedulePct >= 70) opsScore += 5;
  else if (vaccinationsOnSchedulePct >= 50) opsScore += 3;
  if (waterQualityEmergencies === 0) opsScore += 3;
  else if (waterQualityEmergencies <= 2) opsScore += 1;
  components.push({
    key: 'operational_health',
    label: 'Operational health',
    score: Math.min(10, opsScore),
    maxScore: 10,
    detail:
      vaccinationsOnSchedulePct == null
        ? `No vaccinations scheduled · ${waterQualityEmergencies} water emergencies (90d)`
        : `${vaccinationsOnSchedulePct.toFixed(0)}% vax on schedule · ${waterQualityEmergencies} water emergencies (90d)`,
  });

  const total = components.reduce((s, c) => s + c.score, 0);
  const { tier, tierLabel } = tierFor(total);

  return {
    total,
    tier,
    tierLabel,
    components,
    metrics: {
      daysOnPlatform,
      activeDaysLast90,
      totalRevenueLast12mo,
      totalExpensesLast12mo,
      netLast12mo,
      salesEntryCount: sales.length,
      expenseEntryCount: expenses.length,
      mortalityCount,
      mortalityRatePct,
      waterQualityEmergencies,
      vaccinationsOnSchedulePct,
      activeFlockCount: activeFlocks.length,
      totalAnimals,
    },
    generatedAt: new Date().toISOString(),
  };
}
