/**
 * Pond financials — Phase B Step 26.
 *
 * Computes the running cost-per-kg and projected break-even / profit for a
 * fish pond. Pure function — caller fetches the data and passes totals in.
 *
 * Caller pattern (in component):
 *   const expenses = await supabase.from('expenses')...
 *   const stocking = await supabase.from('stocking_events')...
 *   const result = calculatePondFinancials({ totalCost, biomassKg, marketPricePerKg });
 */

export interface PondFinancialsInput {
  /** Total expenses spent on this pond to date, in farm currency. */
  totalCostToDate: number;
  /** Current estimated biomass in kg (current_count × ABW / 1000). */
  currentBiomassKg: number;
  /** Estimated biomass at harvest in kg (current_count × target_abw_g / 1000). */
  projectedHarvestBiomassKg: number;
  /** Average projected market price in farm currency per kg. */
  marketPricePerKg: number;
  /** Estimated additional spend until harvest (feed, treatments, etc.) — optional. */
  projectedRemainingCost?: number;
}

export interface PondFinancialsResult {
  /** Cost per kg of current biomass at this moment. */
  costPerKgCurrent: number;
  /** Projected cost per kg at harvest. */
  costPerKgAtHarvest: number;
  /** Total invested so far. */
  totalInvested: number;
  /** Projected total cost at harvest. */
  projectedTotalCost: number;
  /** Projected gross revenue at harvest. */
  projectedGrossRevenue: number;
  /** Projected gross profit (revenue − cost). */
  projectedGrossProfit: number;
  /** Projected margin %. */
  projectedMarginPercent: number;
  /** Break-even market price needed at harvest to cover total cost. */
  breakEvenPricePerKg: number;
  /** Status: profitable / break-even / loss. */
  status: 'profitable' | 'break-even' | 'loss' | 'unknown';
  /** Color tag for the UI. */
  color: 'green' | 'amber' | 'red' | 'gray';
}

export function calculatePondFinancials(input: PondFinancialsInput): PondFinancialsResult {
  const {
    totalCostToDate,
    currentBiomassKg,
    projectedHarvestBiomassKg,
    marketPricePerKg,
    projectedRemainingCost = 0,
  } = input;

  if (currentBiomassKg <= 0 || projectedHarvestBiomassKg <= 0 || marketPricePerKg <= 0) {
    return {
      costPerKgCurrent: 0,
      costPerKgAtHarvest: 0,
      totalInvested: totalCostToDate,
      projectedTotalCost: totalCostToDate + projectedRemainingCost,
      projectedGrossRevenue: 0,
      projectedGrossProfit: 0,
      projectedMarginPercent: 0,
      breakEvenPricePerKg: 0,
      status: 'unknown',
      color: 'gray',
    };
  }

  const projectedTotalCost = totalCostToDate + projectedRemainingCost;
  const costPerKgCurrent = totalCostToDate / currentBiomassKg;
  const costPerKgAtHarvest = projectedTotalCost / projectedHarvestBiomassKg;
  const projectedGrossRevenue = projectedHarvestBiomassKg * marketPricePerKg;
  const projectedGrossProfit = projectedGrossRevenue - projectedTotalCost;
  const projectedMarginPercent =
    projectedGrossRevenue > 0
      ? (projectedGrossProfit / projectedGrossRevenue) * 100
      : 0;
  const breakEvenPricePerKg = costPerKgAtHarvest;

  let status: PondFinancialsResult['status'];
  let color: PondFinancialsResult['color'];
  if (projectedMarginPercent >= 25) {
    status = 'profitable';
    color = 'green';
  } else if (projectedMarginPercent >= 0) {
    status = 'break-even';
    color = 'amber';
  } else {
    status = 'loss';
    color = 'red';
  }

  return {
    costPerKgCurrent,
    costPerKgAtHarvest,
    totalInvested: totalCostToDate,
    projectedTotalCost,
    projectedGrossRevenue,
    projectedGrossProfit,
    projectedMarginPercent,
    breakEvenPricePerKg,
    status,
    color,
  };
}
