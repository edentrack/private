/**
 * Calculation Diagnostics Utility
 * Checks all calculations across the app for accuracy
 */

import { Flock, Expense, MortalityLog, EggCollection, WeightLog } from '../types/database';

export interface CalculationDiagnostic {
  component: string;
  calculation: string;
  status: 'pass' | 'fail' | 'warning';
  expected: number | string;
  actual: number | string;
  message: string;
}

/**
 * Diagnose mortality calculations
 */
export function diagnoseMortality(flock: Flock, mortalityLogs: MortalityLog[]): CalculationDiagnostic[] {
  const diagnostics: CalculationDiagnostic[] = [];

  const totalMortality = mortalityLogs.reduce((sum, m) => sum + (m.count || 0), 0);
  const initialCount = flock.initial_count || 0;
  const currentCount = flock.current_count || 0;
  const calculatedAlive = initialCount - totalMortality;

  // Check if current_count matches calculated
  if (Math.abs(currentCount - calculatedAlive) > 1) {
    diagnostics.push({
      component: 'Mortality Calculation',
      calculation: 'current_count vs calculated',
      status: 'warning',
      expected: calculatedAlive,
      actual: currentCount,
      message: `Current count (${currentCount}) doesn't match calculated (${initialCount} - ${totalMortality} = ${calculatedAlive})`
    });
  }

  // Check mortality rate
  const mortalityRate = initialCount > 0 ? (totalMortality / initialCount) * 100 : 0;
  const expectedRate = parseFloat(mortalityRate.toFixed(1));
  
  diagnostics.push({
    component: 'Mortality Rate',
    calculation: 'mortality_rate',
    status: 'pass',
    expected: expectedRate,
    actual: expectedRate,
    message: `Mortality rate: ${expectedRate.toFixed(1)}%`
  });

  // Check if mortality logs have valid counts
  const invalidLogs = mortalityLogs.filter(m => !m.count || m.count < 0);
  if (invalidLogs.length > 0) {
    diagnostics.push({
      component: 'Mortality Logs',
      calculation: 'log_validation',
      status: 'fail',
      expected: 'All logs have valid counts',
      actual: `${invalidLogs.length} invalid logs`,
      message: `Found ${invalidLogs.length} mortality logs with invalid or missing counts`
    });
  }

  return diagnostics;
}

/**
 * Diagnose expense calculations
 */
export function diagnoseExpenses(expenses: Expense[]): CalculationDiagnostic[] {
  const diagnostics: CalculationDiagnostic[] = [];

  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  
  // Check for negative amounts (should be flagged)
  const negativeExpenses = expenses.filter(e => e.amount && e.amount < 0);
  if (negativeExpenses.length > 0) {
    diagnostics.push({
      component: 'Expenses',
      calculation: 'negative_amounts',
      status: 'warning',
      expected: 'No negative amounts',
      actual: `${negativeExpenses.length} negative expenses`,
      message: `Found ${negativeExpenses.length} expenses with negative amounts`
    });
  }

  // Check for missing amounts
  const missingAmounts = expenses.filter(e => !e.amount || e.amount === 0);
  if (missingAmounts.length > 0) {
    diagnostics.push({
      component: 'Expenses',
      calculation: 'missing_amounts',
      status: 'warning',
      expected: 'All expenses have amounts',
      actual: `${missingAmounts.length} expenses without amounts`,
      message: `Found ${missingAmounts.length} expenses with missing or zero amounts`
    });
  }

  diagnostics.push({
    component: 'Total Expenses',
    calculation: 'total_expenses',
    status: 'pass',
    expected: totalExpenses,
    actual: totalExpenses,
    message: `Total expenses: ${totalExpenses.toLocaleString()}`
  });

  return diagnostics;
}

/**
 * Diagnose weight calculations
 */
export function diagnoseWeight(flock: Flock, weightLogs: WeightLog[]): CalculationDiagnostic[] {
  const diagnostics: CalculationDiagnostic[] = [];

  if (weightLogs.length === 0) {
    diagnostics.push({
      component: 'Weight Tracking',
      calculation: 'no_logs',
      status: 'warning',
      expected: 'At least one weight log',
      actual: 'No weight logs',
      message: 'No weight logs found for this flock'
    });
    return diagnostics;
  }

  // Check for invalid weights
  const invalidWeights = weightLogs.filter(w => !w.average_weight || w.average_weight <= 0);
  if (invalidWeights.length > 0) {
    diagnostics.push({
      component: 'Weight Logs',
      calculation: 'weight_validation',
      status: 'fail',
      expected: 'All weights > 0',
      actual: `${invalidWeights.length} invalid weights`,
      message: `Found ${invalidWeights.length} weight logs with invalid weights`
    });
  }

  // Check weight progression (should generally increase for broilers)
  if (flock.type?.toLowerCase() === 'broiler' && weightLogs.length > 1) {
    const sortedLogs = [...weightLogs].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    let decreasingWeights = 0;
    for (let i = 1; i < sortedLogs.length; i++) {
      if (sortedLogs[i].average_weight < sortedLogs[i-1].average_weight) {
        decreasingWeights++;
      }
    }

    if (decreasingWeights > sortedLogs.length * 0.2) {
      diagnostics.push({
        component: 'Weight Progression',
        calculation: 'weight_trend',
        status: 'warning',
        expected: 'Generally increasing weights',
        actual: `${decreasingWeights} decreases found`,
        message: `Found ${decreasingWeights} instances where weight decreased (may indicate data entry errors)`
      });
    }
  }

  return diagnostics;
}

/**
 * Run all diagnostics
 */
export function runAllDiagnostics(
  flock: Flock,
  expenses: Expense[],
  mortalityLogs: MortalityLog[],
  weightLogs: WeightLog[],
  eggCollections?: EggCollection[]
): CalculationDiagnostic[] {
  const allDiagnostics: CalculationDiagnostic[] = [];

  allDiagnostics.push(...diagnoseMortality(flock, mortalityLogs));
  allDiagnostics.push(...diagnoseExpenses(expenses));
  allDiagnostics.push(...diagnoseWeight(flock, weightLogs));

  return allDiagnostics;
}











