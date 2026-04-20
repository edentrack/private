export interface DataReadinessInput {
  expensesCount: number;
  inventoryMovementsCount: number;
  productionLogsCount: number;
}

export interface DataReadinessResult {
  ready: boolean;
  missing: string[];
}

export function getFlockDataReadiness(input: DataReadinessInput): DataReadinessResult {
  const missing: string[] = [];

  if (input.expensesCount === 0) {
    missing.push('At least 1 expense recorded');
  }

  if (input.inventoryMovementsCount === 0) {
    missing.push('At least 1 inventory movement or feed usage recorded');
  }

  if (input.productionLogsCount === 0) {
    missing.push('At least 1 production log (eggs, mortality, weights, etc.)');
  }

  const presentCount = 3 - missing.length;
  const ready = presentCount >= 2;

  return { ready, missing };
}
