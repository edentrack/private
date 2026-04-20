export function getRecommendedSampleSize(totalBirds: number): number {
  if (totalBirds <= 100) return 10;
  if (totalBirds <= 500) return 15;
  if (totalBirds <= 1000) return 20;
  if (totalBirds <= 2000) return 30;
  if (totalBirds <= 5000) return 40;
  return 50;
}

export function calculateDailyGain(
  currentWeight: number,
  previousWeight: number,
  daysBetween: number
): number {
  if (daysBetween === 0) return 0;
  const weightGain = currentWeight - previousWeight;
  return (weightGain * 1000) / daysBetween;
}

export function rateDailyGain(dailyGain: number, flockType: string): string {
  if (flockType.toLowerCase() === 'broiler') {
    if (dailyGain >= 80) return '⭐⭐⭐⭐⭐ Excellent';
    if (dailyGain >= 70) return '⭐⭐⭐⭐ Very Good';
    if (dailyGain >= 60) return '⭐⭐⭐ Good';
    if (dailyGain >= 50) return '⭐⭐ Fair';
    return '⭐ Below Target';
  }
  return '';
}

export function calculateMarketReadiness(
  averageWeight: number,
  targetWeight: number
): { percent: number; status: string; icon: string } {
  const percent = (averageWeight / targetWeight) * 100;

  let status = '';
  let icon = '';

  if (percent >= 95) {
    status = 'Ready for market';
    icon = '✅';
  } else if (percent >= 85) {
    status = 'Almost ready (1-2 weeks)';
    icon = '🟡';
  } else {
    status = 'Not ready yet';
    icon = '🔴';
  }

  return { percent, status, icon };
}

export function calculateSaleProjections(
  currentCount: number,
  averageWeight: number,
  pricePerBird: number,
  pricePerKg: number
) {
  const totalWeight = currentCount * averageWeight;
  const revenuePerBird = currentCount * pricePerBird;
  const revenuePerKg = totalWeight * pricePerKg;

  const bestMethod = revenuePerKg > revenuePerBird ? 'per_kg' : 'per_bird';
  const extraProfit = Math.abs(revenuePerKg - revenuePerBird);

  return {
    totalWeight,
    revenuePerBird,
    revenuePerKg,
    bestMethod,
    extraProfit
  };
}

export function calculateWaitVsSellNow(
  currentCount: number,
  averageWeight: number,
  dailyGain: number,
  currentRevenue: number,
  pricePerKg: number,
  daysToWait: number = 7,
  dailyFeedPerBird: number = 0.15,
  feedCostPerKg: number = 350
) {
  const projectedWeight = averageWeight + (dailyGain * daysToWait / 1000);
  const projectedTotalWeight = projectedWeight * currentCount;
  const projectedRevenue = projectedTotalWeight * pricePerKg;

  const additionalFeedCost = currentCount * dailyFeedPerBird * daysToWait * feedCostPerKg;
  const netGainFromWaiting = projectedRevenue - currentRevenue - additionalFeedCost;

  return {
    projectedWeight,
    projectedTotalWeight,
    projectedRevenue,
    additionalFeedCost,
    netGainFromWaiting,
    recommendation: netGainFromWaiting > 0
      ? `Wait ${daysToWait} more days`
      : 'Sell now - birds are at optimal weight'
  };
}

export function daysBetweenDates(date1: string | Date, date2: string | Date): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
