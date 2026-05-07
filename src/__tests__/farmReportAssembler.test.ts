import { describe, it, expect } from 'vitest';
import { assembleFarmReport } from '../utils/farmReportAssembler';

/**
 * Coverage target: the May 2026 perf rewrite of `assembleFarmReport`.
 *
 * The old version did O(N) round-trips (6 per flock) plus 8 farm-wide
 * queries — at 5 flocks that's 38 calls, and the browser's per-host cap
 * (~6 concurrent connections) made 30-day reports time out past 5 minutes.
 *
 * The new version fires a fixed set of farm-wide queries and buckets by
 * `flock_id` in memory. This test pins the round-trip count and verifies
 * the buckets aggregate correctly — if someone re-introduces a per-flock
 * fanout the call counter assertion will fail loudly.
 */

type Q = { table: string; filters: Record<string, any> };

/**
 * A minimal Supabase client mock that records each chained query and
 * returns canned data based on the table name. We don't simulate Postgres;
 * we only need to confirm the assembler issues the right shape of calls.
 */
function makeMockSupabase(opts: {
  flocks: Array<any>;
  expenses?: Array<any>;
  revenues?: Array<any>;
  egg_sales?: Array<any>;
  bird_sales?: Array<any>;
  mortality_logs?: Array<any>;
  vaccinations?: Array<any>;
  feed_givings?: Array<any>;
  egg_collections?: Array<any>;
  harvest_records?: Array<any>;
  farms?: any;
}) {
  const calls: Q[] = [];

  const tableData: Record<string, any> = {
    farms: opts.farms ?? { name: 'Test Farm', farm_type: 'poultry', country: 'NG', currency_code: 'NGN' },
    flocks: opts.flocks,
    expenses: opts.expenses ?? [],
    revenues: opts.revenues ?? [],
    egg_sales: opts.egg_sales ?? [],
    bird_sales: opts.bird_sales ?? [],
    mortality_logs: opts.mortality_logs ?? [],
    vaccinations: opts.vaccinations ?? [],
    feed_givings: opts.feed_givings ?? [],
    egg_collections: opts.egg_collections ?? [],
    harvest_records: opts.harvest_records ?? [],
  };

  function makeQuery(table: string): any {
    const filters: Record<string, any> = {};
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { filters[k] = v; return q; },
      gte: (k: string, v: any) => { filters[`${k}_gte`] = v; return q; },
      lte: (k: string, v: any) => { filters[`${k}_lte`] = v; return q; },
      order: () => q,
      single: async () => { calls.push({ table, filters }); return { data: tableData[table], error: null }; },
      then: (resolve: (val: any) => void, reject?: (e: any) => void) => {
        calls.push({ table, filters });
        const data = tableData[table];
        if (table === 'farms') return Promise.resolve({ data, error: null }).then(resolve, reject);
        return Promise.resolve({ data: Array.isArray(data) ? data : [], error: null }).then(resolve, reject);
      },
    };
    return q;
  }

  return {
    from: (table: string) => makeQuery(table),
    _calls: calls,
  } as any;
}

describe('assembleFarmReport — perf rewrite', () => {
  it('issues a fixed number of round-trips regardless of flock count', async () => {
    // Two farms, identical except for flock count — call counts must match.
    const baseInput = {
      farmId: 'f1',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    };

    const oneFlock = [{ id: 'a', name: 'Pen A', type: 'Layer', initial_count: 100, current_count: 95, arrival_date: '2025-10-01', status: 'active' }];
    const tenFlocks = Array.from({ length: 10 }, (_, i) => ({
      id: `f${i}`,
      name: `Pen ${i}`,
      type: 'Layer',
      initial_count: 100,
      current_count: 95,
      arrival_date: '2025-10-01',
      status: 'active',
    }));

    const sb1 = makeMockSupabase({ flocks: oneFlock });
    const sb10 = makeMockSupabase({ flocks: tenFlocks });

    await assembleFarmReport({ ...baseInput, supabase: sb1 });
    await assembleFarmReport({ ...baseInput, supabase: sb10 });

    // The pre-rewrite version issued 8 + 6*N calls. The rewrite is O(1)
    // in flocks. If this assertion ever fails because the count went
    // up by N, an N+1 fanout has been re-introduced.
    expect(sb1._calls.length).toBe(sb10._calls.length);
    // Sanity-check the absolute count is small — header (1) + flocks (1)
    // + 9 event tables = 11.
    expect(sb1._calls.length).toBeLessThanOrEqual(12);
  });

  it('aggregates per-flock totals correctly without extra queries', async () => {
    const flocks = [
      { id: 'a', name: 'Pen A', type: 'Layer', initial_count: 100, current_count: 92, arrival_date: '2025-10-01', status: 'active' },
      { id: 'b', name: 'Pen B', type: 'Layer', initial_count: 200, current_count: 195, arrival_date: '2025-10-01', status: 'active' },
    ];
    const expenses = [
      { amount: 500, category: 'feed', flock_id: 'a' },
      { amount: 300, category: 'feed', flock_id: 'a' },
      { amount: 1000, category: 'medication', flock_id: 'b' },
    ];
    const egg_sales = [
      { total_amount: 2000, total_eggs: 100, flock_id: 'a' },
      { total_amount: 4000, total_eggs: 200, flock_id: 'b' },
    ];
    const mortality_logs = [
      { count: 8, cause: 'natural', event_date: '2026-04-12', flock_id: 'a' },
      { count: 5, cause: 'predator', event_date: '2026-04-15', flock_id: 'b' },
    ];

    const sb = makeMockSupabase({ flocks, expenses, egg_sales, mortality_logs });

    const data = await assembleFarmReport({
      farmId: 'f1',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      supabase: sb,
    });

    const penA = data.flocks.find(f => f.name === 'Pen A')!;
    const penB = data.flocks.find(f => f.name === 'Pen B')!;

    expect(penA.expensesTotal).toBe(800);
    expect(penA.revenueTotal).toBe(2000);
    expect(penA.mortalityCount).toBe(8);
    expect(penA.netProfit).toBe(1200);

    expect(penB.expensesTotal).toBe(1000);
    expect(penB.revenueTotal).toBe(4000);
    expect(penB.mortalityCount).toBe(5);
    expect(penB.netProfit).toBe(3000);

    // Top-level totals
    expect(data.totalExpenses).toBe(1800);
    expect(data.totalRevenue).toBe(6000);
    expect(data.netProfit).toBe(4200);
    expect(data.totalMortality).toBe(13);
  });

  it('handles flocks with zero events without errors', async () => {
    const flocks = [
      { id: 'a', name: 'Empty Pen', type: 'Layer', initial_count: 100, current_count: 100, arrival_date: '2025-10-01', status: 'active' },
    ];
    const sb = makeMockSupabase({ flocks });

    const data = await assembleFarmReport({
      farmId: 'f1',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      supabase: sb,
    });

    expect(data.flocks).toHaveLength(1);
    expect(data.flocks[0].expensesTotal).toBe(0);
    expect(data.flocks[0].revenueTotal).toBe(0);
    expect(data.flocks[0].survivalRate).toBe(100);
    expect(data.totalRevenue).toBe(0);
    expect(data.totalExpenses).toBe(0);
  });

  it('survives missing harvest_records table (poultry farm)', async () => {
    // The mock returns an empty array for harvest_records by default;
    // the production code wraps the harvest fetch in a `.then(r=>r,()=>{})`
    // so a 404 from a non-existent table doesn't break the report.
    const flocks = [
      { id: 'a', name: 'Pen A', type: 'Layer', initial_count: 100, current_count: 95, arrival_date: '2025-10-01', status: 'active' },
    ];
    const sb = makeMockSupabase({ flocks });
    const data = await assembleFarmReport({
      farmId: 'f1',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      supabase: sb,
    });
    expect(data.totalBiomassHarvestedKg).toBe(0);
  });
});
