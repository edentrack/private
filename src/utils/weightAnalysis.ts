import { Flock } from '../types/database';
import { calculateCurrentWeek, getTargetWeight, WeeklyTarget } from './growthTargets';
import { SupabaseClient } from '@supabase/supabase-js';

export interface WeightAnalysisResult {
  average: number;
  min: number;
  max: number;
  stdDev: number;
  cv: number;
  uniformity: string;
  count: number;
  totalFlockWeight: number;
  dailyGain: number | null;
  daysSinceLastCheck: number | null;
  previousWeight: number | null;
  growthRating: string;
  currentWeek: number;
  targetWeight: number;
  targetDescription: string;
  percentOfTarget: number;
  growthStatus: string;
  statusColor: string;
  marketStatus: string | null;
  marketReady: boolean;
  weeksRemaining: number;
  canSell: boolean;
  recommendation: string | null;
  saleAnalysis: {
    sellNowPerBird: number;
    sellNowPerKg: number;
    waitOption: {
      days: number;
      projectedWeight: number;
      projectedTotalWeight: number;
      revenue: number;
      feedCost: number;
      netGain: number;
    } | null;
  } | null;
  transparency: {
    individualWeights: number[];
    recommendedSampleSize: number;
    confidence: number;
    weightsSum: number;
    minAge: number;
    minWeight: number;
    optimalWeight: number;
    pricePerBird: number;
    pricePerKg: number;
    meetsAgeRequirement: boolean;
    meetsMinWeightRequirement: boolean;
    meetsOptimalWeightRequirement: boolean;
    reasoning: string[];
    targetsSource: string;
  };
}

export function calculateConfidence(sampleSize: number, flockSize: number): number {
  const samplePercent = (sampleSize / flockSize) * 100;

  if (samplePercent >= 5) return 95;
  if (samplePercent >= 3) return 85;
  if (samplePercent >= 2) return 75;
  return 60;
}

export function getRecommendedSampleSize(flockSize: number): number {
  if (flockSize <= 100) return Math.ceil(flockSize * 0.1);
  if (flockSize <= 500) return Math.ceil(flockSize * 0.05);
  if (flockSize <= 1000) return Math.ceil(flockSize * 0.03);
  return Math.ceil(flockSize * 0.02);
}

export function calculateWeightStatistics(weights: number[]): {
  average: number;
  min: number;
  max: number;
  stdDev: number;
  cv: number;
} {
  const count = weights.length;
  const sum = weights.reduce((a, b) => a + b, 0);
  const average = sum / count;
  const min = Math.min(...weights);
  const max = Math.max(...weights);

  const variance = weights.reduce((a, b) => a + Math.pow(b - average, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  const cv = (stdDev / average) * 100;

  return { average, min, max, stdDev, cv };
}

export function getUniformityRating(cv: number): string {
  if (cv < 5) return 'Excellent';
  if (cv < 10) return 'Good';
  if (cv < 15) return 'Fair';
  return 'Poor (Need to investigate)';
}

export function calculateGrowthPerformance(
  currentWeight: number,
  targetWeight: number,
  previousWeight: number | null,
  daysSinceLastCheck: number | null,
  flockType: string,
  currentWeek: number
): string {
  if (!previousWeight || !daysSinceLastCheck) {
    return 'First weight check recorded';
  }

  const weightGain = currentWeight - previousWeight;
  const dailyGain = (weightGain * 1000) / daysSinceLastCheck;

  if (flockType === 'Broiler') {
    if (dailyGain >= 80) return '⭐⭐⭐⭐⭐ Excellent! Above target';
    if (dailyGain >= 70) return '⭐⭐⭐⭐ Very Good';
    if (dailyGain >= 60) return '⭐⭐⭐ Good (Target: 60-80 g/day)';
    if (dailyGain >= 50) return '⭐⭐ Below target';
    return '⭐ Poor - Check feed and health';
  } else if (flockType === 'Layer') {
    if (currentWeek >= 18) {
      const optimalWeight = 1.55;
      if (currentWeight >= optimalWeight * 0.95 && currentWeight <= optimalWeight * 1.1) {
        return '⭐⭐⭐⭐⭐ Perfect weight for laying';
      } else if (currentWeight < optimalWeight * 0.95) {
        return '⚠️ Underweight - Increase feed';
      } else {
        return '⚠️ Overweight - Risk of health issues';
      }
    }
    return 'Pullets growing normally';
  }

  return 'No rating available';
}

export function calculateMarketReadiness(
  currentWeight: number,
  flockType: string,
  currentWeek: number,
  dailyGain: number | null,
  customCriteria?: {
    minAge: number;
    minWeight: number;
    optimalWeight: number;
  }
): {
  status: string;
  ready: boolean;
  canSell: boolean;
  weeksRemaining: number;
  recommendation: string;
} {
  if (flockType === 'Broiler') {
    const minAge = customCriteria?.minAge || 6;
    const minWeight = customCriteria?.minWeight || 2.0;
    const optimalWeight = customCriteria?.optimalWeight || 2.5;

    if (currentWeek < minAge) {
      return {
        status: `🐣 Too young (Week ${currentWeek})`,
        ready: false,
        canSell: false,
        weeksRemaining: minAge - currentWeek,
        recommendation: `Continue growing for ${minAge - currentWeek} more week(s). Birds need at least ${minAge} weeks to reach market size.`,
      };
    }

    if (currentWeight >= minWeight && currentWeight < optimalWeight) {
      return {
        status: '🟡 Market ready - can sell now or wait',
        ready: true,
        canSell: true,
        weeksRemaining: 1,
        recommendation:
          `Birds are at acceptable market weight (${minWeight}kg). You can sell now, or wait 1 more week for optimal weight (${optimalWeight}kg) and higher profit.`,
      };
    }

    if (currentWeight >= optimalWeight) {
      return {
        status: '✅ READY FOR MARKET - Optimal weight!',
        ready: true,
        canSell: true,
        weeksRemaining: 0,
        recommendation: 'Birds are at optimal market weight. Sell now for best profit!',
      };
    }

    return {
      status: '🟠 Old enough but underweight',
      ready: false,
      canSell: false,
      weeksRemaining: 1,
      recommendation: `Week ${currentWeek} birds should weigh at least ${minWeight}kg. Current average: ${currentWeight.toFixed(2)}kg. Check feed quality and quantity. May need 1-2 more weeks.`,
    };
  } else if (flockType === 'Layer') {
    if (currentWeek < 18) {
      return {
        status: `🐣 Growing (Week ${currentWeek})`,
        ready: false,
        canSell: false,
        weeksRemaining: 18 - currentWeek,
        recommendation: `Layers start laying around Week 18-20. Continue focusing on steady growth. ${18 - currentWeek} week(s) remaining.`,
      };
    }

    if (currentWeight >= 1.5 && currentWeight <= 1.7) {
      return {
        status: '✅ Ready to start laying',
        ready: true,
        canSell: false,
        weeksRemaining: 0,
        recommendation:
          'Birds are at optimal laying weight (1.5-1.6kg). Expect eggs to start soon! Maintain this weight with balanced feeding.',
      };
    }

    if (currentWeight < 1.5) {
      return {
        status: '⚠️ Underweight for laying',
        ready: false,
        canSell: false,
        weeksRemaining: 2,
        recommendation:
          'Birds need to reach 1.5-1.6kg before laying. Increase feed quality and quantity.',
      };
    }

    return {
      status: '⚠️ Overweight - health risk',
      ready: false,
      canSell: false,
      weeksRemaining: 0,
      recommendation:
        'Birds are too heavy (>1.7kg) for optimal egg production. Reduce feed slightly. Overweight layers have lower egg production and health issues.',
    };
  }

  return {
    status: 'Unknown flock type',
    ready: false,
    canSell: false,
    weeksRemaining: 0,
    recommendation: 'Cannot determine readiness for unknown flock type.',
  };
}

export function calculateSaleAnalysis(
  currentWeight: number,
  flockCount: number,
  totalFlockWeight: number,
  dailyGain: number | null,
  flockType: string
): {
  sellNowPerBird: number;
  sellNowPerKg: number;
  waitOption: {
    days: number;
    projectedWeight: number;
    projectedTotalWeight: number;
    revenue: number;
    feedCost: number;
    netGain: number;
  } | null;
} | null {
  if (flockType !== 'Broiler') return null;

  const pricePerBird = 2500;
  const pricePerKg = 3000;
  const feedCostPerBirdPerDay = 50;

  const sellNowPerBird = flockCount * pricePerBird;
  const sellNowPerKg = Math.round(totalFlockWeight * pricePerKg);

  let waitOption = null;

  if (dailyGain && dailyGain > 50 && currentWeight < 2.8) {
    const waitDays = 7;
    const projectedWeight = currentWeight + (dailyGain * waitDays) / 1000;
    const projectedTotalWeight = Math.round(projectedWeight * flockCount);
    const revenue = Math.round(projectedTotalWeight * pricePerKg);
    const feedCost = flockCount * feedCostPerBirdPerDay * waitDays;
    const netGain = revenue - sellNowPerKg - feedCost;

    if (netGain > 0) {
      waitOption = {
        days: waitDays,
        projectedWeight,
        projectedTotalWeight,
        revenue,
        feedCost,
        netGain,
      };
    }
  }

  return { sellNowPerBird, sellNowPerKg, waitOption };
}

export async function analyzeWeightCheck(
  weights: number[],
  flock: Flock,
  previousCheckData: {
    weight: number;
    date: string;
  } | null,
  supabaseClient?: SupabaseClient
): Promise<WeightAnalysisResult> {
  const stats = calculateWeightStatistics(weights);
  const uniformity = getUniformityRating(stats.cv);
  const totalFlockWeight = Math.round(stats.average * (flock.current_count || 0));

  const currentWeek = calculateCurrentWeek(flock.arrival_date);

  let customTargets: Record<number, WeeklyTarget> | undefined;
  let customCriteria: { minAge: number; minWeight: number; optimalWeight: number } | undefined;

  if (supabaseClient && flock.farm_id) {
    try {
      const { data: farmData } = await supabaseClient
        .from('farms')
        .select('broiler_growth_targets, layer_growth_targets, market_ready_min_age, market_ready_min_weight, market_ready_optimal_weight')
        .eq('id', flock.farm_id)
        .single();

      if (farmData) {
        const targetsData = flock.type === 'Broiler'
          ? farmData.broiler_growth_targets
          : farmData.layer_growth_targets;

        if (targetsData) {
          customTargets = Object.keys(targetsData).reduce((acc, week) => {
            acc[parseInt(week)] = targetsData[week];
            return acc;
          }, {} as Record<number, WeeklyTarget>);
        }

        if (flock.type === 'Broiler') {
          customCriteria = {
            minAge: farmData.market_ready_min_age || 6,
            minWeight: farmData.market_ready_min_weight || 2.0,
            optimalWeight: farmData.market_ready_optimal_weight || 2.5
          };
        }
      }
    } catch (error) {
      console.error('Error loading custom growth targets:', error);
    }
  }

  const target = getTargetWeight(flock.type, currentWeek, customTargets);
  const percentOfTarget = (stats.average / target.weight) * 100;

  let dailyGain: number | null = null;
  let daysSinceLastCheck: number | null = null;
  let previousWeight: number | null = null;

  if (previousCheckData) {
    previousWeight = previousCheckData.weight;
    const previousDate = new Date(previousCheckData.date);
    const today = new Date();
    daysSinceLastCheck = Math.max(
      1,
      Math.floor((today.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    const weightGain = stats.average - previousWeight;
    dailyGain = (weightGain * 1000) / daysSinceLastCheck;
  }

  let growthStatus = '';
  let statusColor = '';

  if (percentOfTarget >= 95) {
    growthStatus = '✅ On track - excellent growth!';
    statusColor = 'green';
  } else if (percentOfTarget >= 85) {
    growthStatus = '🟡 Slightly below target - monitor closely';
    statusColor = 'yellow';
  } else if (percentOfTarget >= 75) {
    growthStatus = '🟠 Below target - check feed and health';
    statusColor = 'orange';
  } else {
    growthStatus = '🔴 Significantly underweight - urgent attention needed!';
    statusColor = 'red';
  }

  const growthRating = calculateGrowthPerformance(
    stats.average,
    target.weight,
    previousWeight,
    daysSinceLastCheck,
    flock.type,
    currentWeek
  );

  const marketReadiness = calculateMarketReadiness(
    stats.average,
    flock.type,
    currentWeek,
    dailyGain,
    customCriteria
  );

  let saleAnalysis = null;
  if (marketReadiness.canSell) {
    saleAnalysis = calculateSaleAnalysis(
      stats.average,
      flock.current_count || 0,
      totalFlockWeight,
      dailyGain,
      flock.type
    );
  }

  let finalRecommendation = marketReadiness.recommendation;

  if (
    marketReadiness.canSell &&
    saleAnalysis?.waitOption &&
    saleAnalysis.waitOption.netGain > 1000000
  ) {
    finalRecommendation = `Wait 1 more week for maximum profit! Your birds are growing excellently (${dailyGain?.toFixed(0)} g/day). One more week = +${(saleAnalysis.waitOption.netGain / 1000000).toFixed(1)} million XAF profit!`;
  }

  const minAge = customCriteria?.minAge || 6;
  const minWeight = customCriteria?.minWeight || 2.0;
  const optimalWeight = customCriteria?.optimalWeight || 2.5;
  const pricePerBird = 2500;
  const pricePerKg = 3000;

  const meetsAgeRequirement = flock.type === 'Broiler' ? currentWeek >= minAge : currentWeek >= 18;
  const meetsMinWeightRequirement = stats.average >= minWeight;
  const meetsOptimalWeightRequirement = stats.average >= optimalWeight;

  const reasoning: string[] = [];

  if (flock.type === 'Broiler') {
    if (currentWeek < minAge) {
      reasoning.push(`Birds are only ${currentWeek} weeks old - too young for market`);
      reasoning.push(`Minimum market age is ${minAge} weeks for optimal development`);
      reasoning.push(`Young birds need time to reach proper weight and size`);
    }

    if (stats.average < target.weight) {
      reasoning.push(`Current weight (${stats.average.toFixed(2)}kg) is below target (${target.weight.toFixed(2)}kg) for Week ${currentWeek}`);
      reasoning.push(`Below-target birds may not command best market prices`);
    }

    if (stats.average >= optimalWeight && currentWeek >= minAge) {
      reasoning.push(`Birds have reached optimal market weight (${optimalWeight}kg)`);
      reasoning.push(`Waiting longer may increase feed costs more than revenue gains`);
      reasoning.push(`Current age (${currentWeek} weeks) is ideal for slaughter`);
    } else if (stats.average >= minWeight && currentWeek >= minAge) {
      reasoning.push(`Birds meet minimum market requirements (${minWeight}kg, ${minAge} weeks)`);
      reasoning.push(`Can sell now or wait 1 week to reach optimal weight (${optimalWeight}kg)`);
      reasoning.push(`Waiting may increase profit but also increases feed costs`);
    }

    if (percentOfTarget < 85) {
      reasoning.push(`Growth performance is below expectations (${percentOfTarget.toFixed(0)}% of target)`);
      reasoning.push(`Check feed quality, quantity, and bird health`);
      reasoning.push(`Consider consulting a veterinarian if growth remains slow`);
    }
  } else {
    if (currentWeek < 18) {
      reasoning.push(`Layers typically start laying around Week 18-20`);
      reasoning.push(`Focus on steady growth during pullet phase`);
      reasoning.push(`Maintain proper nutrition for good egg production later`);
    }

    if (currentWeek >= 18 && stats.average >= 1.5 && stats.average <= 1.7) {
      reasoning.push(`Birds are at optimal weight for egg production (1.5-1.6kg)`);
      reasoning.push(`Expect eggs to start soon if not already laying`);
      reasoning.push(`Maintain this weight with balanced feeding for best production`);
    }
  }

  const confidence = calculateConfidence(weights.length, flock.current_count || 0);
  const recommendedSampleSize = getRecommendedSampleSize(flock.current_count || 0);
  const weightsSum = weights.reduce((a, b) => a + b, 0);
  const targetsSource = customTargets ? 'Custom farm targets (from Settings)' : 'Default breed standards';

  return {
    average: stats.average,
    min: stats.min,
    max: stats.max,
    stdDev: stats.stdDev,
    cv: stats.cv,
    uniformity,
    count: weights.length,
    totalFlockWeight,
    dailyGain,
    daysSinceLastCheck,
    previousWeight,
    growthRating,
    currentWeek,
    targetWeight: target.weight,
    targetDescription: target.description,
    percentOfTarget,
    growthStatus,
    statusColor,
    marketStatus: marketReadiness.status,
    marketReady: marketReadiness.ready,
    weeksRemaining: marketReadiness.weeksRemaining,
    canSell: marketReadiness.canSell,
    recommendation: finalRecommendation,
    saleAnalysis,
    transparency: {
      individualWeights: weights,
      recommendedSampleSize,
      confidence,
      weightsSum,
      minAge,
      minWeight,
      optimalWeight,
      pricePerBird,
      pricePerKg,
      meetsAgeRequirement,
      meetsMinWeightRequirement,
      meetsOptimalWeightRequirement,
      reasoning,
      targetsSource,
    },
  };
}
