export interface WeeklyTarget {
  weight: number;
  description: string;
  feedIntakeGPerBird?: number; // Average feed intake in grams per bird per day
  cumulativeFeedIntakeKg?: number; // Cumulative feed intake per bird in kg
  waterConsumptionMlPerBird?: number; // Average water consumption in ml per bird per day
}

export const BROILER_GROWTH_TARGETS: Record<number, WeeklyTarget> = {
  1: { weight: 0.15, description: 'Chick starter phase', feedIntakeGPerBird: 28, waterConsumptionMlPerBird: 50 },
  2: { weight: 0.35, description: 'Early growth', feedIntakeGPerBird: 62, waterConsumptionMlPerBird: 100 },
  3: { weight: 0.60, description: 'Rapid growth begins', feedIntakeGPerBird: 100, waterConsumptionMlPerBird: 160 },
  4: { weight: 1.00, description: 'Switch to grower feed', feedIntakeGPerBird: 132, waterConsumptionMlPerBird: 210 },
  5: { weight: 1.50, description: 'Pre-market growth', feedIntakeGPerBird: 165, waterConsumptionMlPerBird: 265 },
  6: { weight: 2.00, description: 'Near market weight', feedIntakeGPerBird: 190, waterConsumptionMlPerBird: 300 },
  7: { weight: 2.50, description: 'Market ready - optimal', feedIntakeGPerBird: 210, waterConsumptionMlPerBird: 335 },
  8: { weight: 2.80, description: 'Market ready - maximum', feedIntakeGPerBird: 225, waterConsumptionMlPerBird: 360 },
};

export const LAYER_GROWTH_TARGETS: Record<number, WeeklyTarget> = {
  1: { 
    weight: 0.065, 
    description: 'Chick starter phase',
    feedIntakeGPerBird: 14.5,
    cumulativeFeedIntakeKg: 0.1015,
    waterConsumptionMlPerBird: 25.5
  },
  2: { 
    weight: 0.15, 
    description: 'Early growth',
    feedIntakeGPerBird: 19,
    cumulativeFeedIntakeKg: 0.24,
    waterConsumptionMlPerBird: 35
  },
  3: { 
    weight: 0.25, 
    description: 'Rapid growth',
    feedIntakeGPerBird: 24,
    cumulativeFeedIntakeKg: 0.44,
    waterConsumptionMlPerBird: 48
  },
  4: { 
    weight: 0.36, 
    description: 'Grower phase begins',
    feedIntakeGPerBird: 28,
    cumulativeFeedIntakeKg: 0.69,
    waterConsumptionMlPerBird: 65.5
  },
  5: { 
    weight: 0.50, 
    description: 'Mid grower',
    feedIntakeGPerBird: 35,
    cumulativeFeedIntakeKg: 0.98,
    waterConsumptionMlPerBird: 75
  },
  6: { 
    weight: 0.65, 
    description: 'SD ends',
    feedIntakeGPerBird: 39,
    cumulativeFeedIntakeKg: 1.32,
    waterConsumptionMlPerBird: 85
  },
  7: { 
    weight: 0.75, 
    description: 'GD starts',
    feedIntakeGPerBird: 42,
    cumulativeFeedIntakeKg: 1.67,
    waterConsumptionMlPerBird: 90
  },
  8: { 
    weight: 0.89, 
    description: 'Mid grower phase',
    feedIntakeGPerBird: 47,
    cumulativeFeedIntakeKg: 2.05,
    waterConsumptionMlPerBird: 101
  },
  9: { 
    weight: 1.0, 
    description: 'Late grower',
    feedIntakeGPerBird: 56,
    cumulativeFeedIntakeKg: 2.47,
    waterConsumptionMlPerBird: 110
  },
  10: { 
    weight: 1.1, 
    description: 'Pre-layer',
    feedIntakeGPerBird: 54,
    cumulativeFeedIntakeKg: 2.92,
    waterConsumptionMlPerBird: 120
  },
  11: { 
    weight: 1.2, 
    description: 'Pre-layer',
    feedIntakeGPerBird: 60,
    cumulativeFeedIntakeKg: 3.40,
    waterConsumptionMlPerBird: 125
  },
  12: { 
    weight: 1.25, 
    description: 'Late grower phase',
    feedIntakeGPerBird: 64,
    cumulativeFeedIntakeKg: 3.89,
    waterConsumptionMlPerBird: 128
  },
  13: { 
    weight: 1.28, 
    description: 'Pre-layer',
    feedIntakeGPerBird: 69,
    cumulativeFeedIntakeKg: 4.39,
    waterConsumptionMlPerBird: 130
  },
  14: { 
    weight: 1.3, 
    description: 'Pre-layer',
    feedIntakeGPerBird: 72,
    cumulativeFeedIntakeKg: 4.90,
    waterConsumptionMlPerBird: 132
  },
  15: { 
    weight: 1.3, 
    description: 'Pre-layer phase',
    feedIntakeGPerBird: 74,
    cumulativeFeedIntakeKg: 5.40,
    waterConsumptionMlPerBird: 133
  },
  16: { 
    weight: 1.4, 
    description: 'Pre-layer phase',
    feedIntakeGPerBird: 77,
    cumulativeFeedIntakeKg: 5.96,
    waterConsumptionMlPerBird: 140
  },
  17: { 
    weight: 1.5, 
    description: 'POL - Point of Lay',
    feedIntakeGPerBird: 80,
    cumulativeFeedIntakeKg: 6.55,
    waterConsumptionMlPerBird: 150
  },
  18: { 
    weight: 1.55, 
    description: 'Point of lay - start laying',
    feedIntakeGPerBird: 85,
    cumulativeFeedIntakeKg: 7.18,
    waterConsumptionMlPerBird: 160
  },
  19: { 
    weight: 1.6, 
    description: 'Laying',
    feedIntakeGPerBird: 88,
    cumulativeFeedIntakeKg: 7.85,
    waterConsumptionMlPerBird: 165
  },
  20: { 
    weight: 1.68, 
    description: 'Peak production weight',
    feedIntakeGPerBird: 94,
    cumulativeFeedIntakeKg: 8.51,
    waterConsumptionMlPerBird: 169.5
  },
  21: { 
    weight: 1.75, 
    description: 'Peak production',
    feedIntakeGPerBird: 98,
    cumulativeFeedIntakeKg: 9.21,
    waterConsumptionMlPerBird: 175
  },
  22: { 
    weight: 1.8, 
    description: 'Peak production',
    feedIntakeGPerBird: 102,
    cumulativeFeedIntakeKg: 9.95,
    waterConsumptionMlPerBird: 180
  },
  23: { 
    weight: 1.83, 
    description: 'Peak production',
    feedIntakeGPerBird: 106,
    cumulativeFeedIntakeKg: 10.70,
    waterConsumptionMlPerBird: 185
  },
  24: { 
    weight: 1.85, 
    description: 'Peak production',
    feedIntakeGPerBird: 108,
    cumulativeFeedIntakeKg: 11.46,
    waterConsumptionMlPerBird: 192.5
  },
  25: { 
    weight: 1.87, 
    description: 'Peak production',
    feedIntakeGPerBird: 109,
    cumulativeFeedIntakeKg: 12.23,
    waterConsumptionMlPerBird: 193
  },
  26: { 
    weight: 1.88, 
    description: 'Peak production',
    feedIntakeGPerBird: 110,
    cumulativeFeedIntakeKg: 13.00,
    waterConsumptionMlPerBird: 193.5
  },
  27: { 
    weight: 1.89, 
    description: 'Peak production',
    feedIntakeGPerBird: 110,
    cumulativeFeedIntakeKg: 13.78,
    waterConsumptionMlPerBird: 193.5
  },
  28: { 
    weight: 1.89, 
    description: 'Peak production weight',
    feedIntakeGPerBird: 110,
    cumulativeFeedIntakeKg: 13.82,
    waterConsumptionMlPerBird: 193.5
  },
  // Maintenance phase (29+): weight plateaus for maintenance, based on Hy-Line/Lohmann standards
  29: { weight: 1.90, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  30: { weight: 1.90, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  32: { weight: 1.92, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  36: { weight: 1.93, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  40: { weight: 1.94, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  44: { weight: 1.95, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  48: { weight: 1.96, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  52: { weight: 1.97, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  56: { weight: 1.98, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  60: { weight: 1.99, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  64: { weight: 2.00, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  68: { weight: 2.01, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
  72: { weight: 2.02, description: 'Maintenance', feedIntakeGPerBird: 110, waterConsumptionMlPerBird: 193.5 },
};

// Rabbit Growth Targets (Meat Rabbits)
export const RABBIT_GROWTH_TARGETS: Record<number, WeeklyTarget> = {
  4: { weight: 0.5, description: 'Weaning complete' },
  6: { weight: 0.8, description: 'Early grower phase' },
  8: { weight: 1.2, description: 'Mid grower phase' },
  10: { weight: 1.6, description: 'Late grower phase' },
  12: { weight: 2.0, description: 'Market ready - minimum' },
  14: { weight: 2.3, description: 'Market ready - optimal' },
  16: { weight: 2.5, description: 'Market ready - maximum' },
};

// Fish Growth Targets (Tilapia)
export const TILAPIA_GROWTH_TARGETS: Record<number, WeeklyTarget> = {
  4: { weight: 0.02, description: 'Fingerling stage complete' },
  8: { weight: 0.05, description: 'Early grow-out' },
  12: { weight: 0.15, description: 'Mid grow-out' },
  16: { weight: 0.30, description: 'Late grow-out' },
  20: { weight: 0.45, description: 'Pre-market' },
  24: { weight: 0.60, description: 'Market ready' },
};

// Fish Growth Targets (Catfish)
export const CATFISH_GROWTH_TARGETS: Record<number, WeeklyTarget> = {
  4: { weight: 0.025, description: 'Fingerling stage complete' },
  8: { weight: 0.08, description: 'Early grow-out' },
  12: { weight: 0.20, description: 'Mid grow-out' },
  16: { weight: 0.35, description: 'Late grow-out' },
  20: { weight: 0.50, description: 'Pre-market' },
  28: { weight: 0.75, description: 'Market ready' },
};

export function calculateCurrentWeek(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  const diffTime = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(diffDays / 7) + 1;
  return Math.max(1, weeks);
}

/**
 * Get growth targets for a specific animal type
 */
export function getGrowthTargets(type: string): Record<number, WeeklyTarget> {
  const typeLower = type.toLowerCase();
  if (typeLower === 'broiler') return BROILER_GROWTH_TARGETS;
  if (typeLower === 'layer') return LAYER_GROWTH_TARGETS;
  if (typeLower === 'meat rabbits' || typeLower.includes('rabbit')) return RABBIT_GROWTH_TARGETS;
  if (typeLower === 'tilapia') return TILAPIA_GROWTH_TARGETS;
  if (typeLower === 'catfish') return CATFISH_GROWTH_TARGETS;
  return BROILER_GROWTH_TARGETS; // Default fallback
}

export function getTargetWeight(
  flockType: string,
  currentWeek: number,
  customTargets?: Record<number, WeeklyTarget>
): WeeklyTarget {
  const targets = customTargets || getGrowthTargets(flockType);

  if (targets[currentWeek]) {
    return targets[currentWeek];
  }

  const weeks = Object.keys(targets)
    .map(Number)
    .sort((a, b) => a - b);
  const lowerWeek = weeks.filter((w) => w <= currentWeek).pop();
  const upperWeek = weeks.find((w) => w > currentWeek);

  if (!lowerWeek) return targets[weeks[0]];
  if (!upperWeek) return targets[weeks[weeks.length - 1]];

  const lowerTarget = targets[lowerWeek];
  const upperTarget = targets[upperWeek];
  const ratio = (currentWeek - lowerWeek) / (upperWeek - lowerWeek);
  
  const interpolatedWeight = lowerTarget.weight + (upperTarget.weight - lowerTarget.weight) * ratio;
  const interpolatedFeedIntake = lowerTarget.feedIntakeGPerBird && upperTarget.feedIntakeGPerBird
    ? lowerTarget.feedIntakeGPerBird + (upperTarget.feedIntakeGPerBird - lowerTarget.feedIntakeGPerBird) * ratio
    : undefined;
  const interpolatedCumulativeFeed = lowerTarget.cumulativeFeedIntakeKg && upperTarget.cumulativeFeedIntakeKg
    ? lowerTarget.cumulativeFeedIntakeKg + (upperTarget.cumulativeFeedIntakeKg - lowerTarget.cumulativeFeedIntakeKg) * ratio
    : undefined;
  const interpolatedWater = lowerTarget.waterConsumptionMlPerBird && upperTarget.waterConsumptionMlPerBird
    ? lowerTarget.waterConsumptionMlPerBird + (upperTarget.waterConsumptionMlPerBird - lowerTarget.waterConsumptionMlPerBird) * ratio
    : undefined;

  return {
    weight: Number(interpolatedWeight.toFixed(2)),
    description: `Week ${currentWeek} growth phase`,
    feedIntakeGPerBird: interpolatedFeedIntake ? Number(interpolatedFeedIntake.toFixed(2)) : undefined,
    cumulativeFeedIntakeKg: interpolatedCumulativeFeed ? Number(interpolatedCumulativeFeed.toFixed(3)) : undefined,
    waterConsumptionMlPerBird: interpolatedWater ? Number(interpolatedWater.toFixed(2)) : undefined,
  };
}
