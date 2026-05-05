import { describe, it, expect } from 'vitest';
import { calculatePondFinancials } from '../utils/pondFinancials';
// Pond performance rating tests live in PR #6 (phase-b-knowledge-tasks branch)
// alongside the utility itself — see src/utils/pondPerformanceRating.ts there.

describe('Pond financials', () => {
  it('returns unknown when missing biomass', () => {
    const r = calculatePondFinancials({
      totalCostToDate: 100000,
      currentBiomassKg: 0,
      projectedHarvestBiomassKg: 200,
      marketPricePerKg: 1500,
    });
    expect(r.status).toBe('unknown');
  });

  it('classifies profitable when margin >= 25%', () => {
    // 75 kg biomass at 75,000 cost = 1,000/kg
    // Project to 200 kg, 25,000 more = 100,000 / 200 = 500/kg cost
    // Sell at 1500/kg → 300,000 revenue, 200,000 profit, 67% margin
    const r = calculatePondFinancials({
      totalCostToDate: 75000,
      currentBiomassKg: 75,
      projectedHarvestBiomassKg: 200,
      marketPricePerKg: 1500,
      projectedRemainingCost: 25000,
    });
    expect(r.status).toBe('profitable');
    expect(Math.round(r.costPerKgAtHarvest)).toBe(500);
    expect(Math.round(r.projectedGrossProfit)).toBe(200000);
    expect(r.projectedMarginPercent).toBeGreaterThan(60);
  });

  it('flags loss when margin negative', () => {
    const r = calculatePondFinancials({
      totalCostToDate: 200000,
      currentBiomassKg: 50,
      projectedHarvestBiomassKg: 100,
      marketPricePerKg: 1500,
    });
    expect(r.status).toBe('loss');
    expect(r.projectedGrossProfit).toBeLessThan(0);
  });

  it('break-even price equals cost-per-kg at harvest', () => {
    const r = calculatePondFinancials({
      totalCostToDate: 100000,
      currentBiomassKg: 100,
      projectedHarvestBiomassKg: 200,
      marketPricePerKg: 1500,
      projectedRemainingCost: 50000,
    });
    expect(r.breakEvenPricePerKg).toBe(r.costPerKgAtHarvest);
    expect(Math.round(r.costPerKgAtHarvest)).toBe(750);
  });
});

