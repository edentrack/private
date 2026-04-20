import { supabase } from '../lib/supabaseClient';

interface TimeSeriesData {
  date: string;
  value: number;
}

interface Prediction {
  date: string;
  predicted: number;
  confidence: number;
  lower_bound: number;
  upper_bound: number;
}

interface AnomalyDetection {
  isAnomaly: boolean;
  severity: 'low' | 'medium' | 'high';
  message: string;
  expectedRange: { min: number; max: number };
  actualValue: number;
}

export class PredictiveAnalytics {
  private static simpleMovingAverage(data: number[], period: number): number {
    if (data.length < period) return data[data.length - 1] || 0;
    const slice = data.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  }

  private static exponentialMovingAverage(data: number[], period: number): number {
    if (data.length === 0) return 0;
    if (data.length < period) return data[data.length - 1];

    const multiplier = 2 / (period + 1);
    let ema = data[0];

    for (let i = 1; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  private static standardDeviation(data: number[]): number {
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const squaredDiffs = data.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / data.length;
    return Math.sqrt(variance);
  }

  static async predictEggProduction(farmId: string, flockId: string, daysAhead: number = 7): Promise<Prediction[]> {
    const { data: collections, error } = await supabase
      .from('egg_collections')
      .select('collection_date, total_collected')
      .eq('farm_id', farmId)
      .eq('flock_id', flockId)
      .order('collection_date', { ascending: true })
      .limit(90);

    if (error || !collections || collections.length < 7) {
      return [];
    }

    const historicalData = collections.map(c => c.total_collected);
    const trend = this.calculateTrend(historicalData);
    const seasonality = this.calculateSeasonality(historicalData, 7);
    const std = this.standardDeviation(historicalData);

    const predictions: Prediction[] = [];
    let lastValue = historicalData[historicalData.length - 1];
    const lastDate = new Date(collections[collections.length - 1].collection_date);

    for (let i = 1; i <= daysAhead; i++) {
      const seasonalFactor = seasonality[i % 7];
      const predicted = lastValue + trend + seasonalFactor;
      const confidence = Math.max(0.5, 1 - (i * 0.05));

      const nextDate = new Date(lastDate);
      nextDate.setDate(lastDate.getDate() + i);

      predictions.push({
        date: nextDate.toISOString().split('T')[0],
        predicted: Math.max(0, Math.round(predicted)),
        confidence: confidence,
        lower_bound: Math.max(0, Math.round(predicted - std * 1.96)),
        upper_bound: Math.round(predicted + std * 1.96)
      });

      lastValue = predicted;
    }

    return predictions;
  }

  private static calculateTrend(data: number[]): number {
    if (data.length < 2) return 0;

    const n = data.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  private static calculateSeasonality(data: number[], period: number): number[] {
    const seasonality: number[] = new Array(period).fill(0);
    const counts: number[] = new Array(period).fill(0);

    const overallMean = data.reduce((sum, val) => sum + val, 0) / data.length;

    for (let i = 0; i < data.length; i++) {
      const seasonIndex = i % period;
      seasonality[seasonIndex] += data[i] - overallMean;
      counts[seasonIndex]++;
    }

    return seasonality.map((sum, i) => counts[i] > 0 ? sum / counts[i] : 0);
  }

  static async predictFeedConsumption(farmId: string, flockId: string, daysAhead: number = 7): Promise<Prediction[]> {
    const { data: flock } = await supabase
      .from('flocks')
      .select('current_count, arrival_date')
      .eq('id', flockId)
      .single();

    if (!flock) return [];

    const arrivalDate = new Date(flock.arrival_date);
    const today = new Date();
    const ageInDays = Math.floor((today.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));

    const { data: feedUsage, error } = await supabase
      .from('feed_stock')
      .select('date, amount_used')
      .eq('farm_id', farmId)
      .order('date', { ascending: true })
      .limit(30);

    if (error || !feedUsage || feedUsage.length < 3) {
      const avgPerBird = 0.12 + (ageInDays * 0.001);
      const dailyConsumption = flock.current_count * avgPerBird;

      return Array.from({ length: daysAhead }, (_, i) => {
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + i + 1);
        return {
          date: nextDate.toISOString().split('T')[0],
          predicted: Math.round(dailyConsumption * 100) / 100,
          confidence: 0.7,
          lower_bound: Math.round(dailyConsumption * 0.85 * 100) / 100,
          upper_bound: Math.round(dailyConsumption * 1.15 * 100) / 100
        };
      });
    }

    const historicalData = feedUsage.map(f => f.amount_used);
    const trend = this.calculateTrend(historicalData);
    const ema = this.exponentialMovingAverage(historicalData, 7);
    const std = this.standardDeviation(historicalData);

    const predictions: Prediction[] = [];
    let lastValue = ema;

    for (let i = 1; i <= daysAhead; i++) {
      const predicted = lastValue + trend;
      const confidence = Math.max(0.6, 1 - (i * 0.05));

      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() + i);

      predictions.push({
        date: nextDate.toISOString().split('T')[0],
        predicted: Math.max(0, Math.round(predicted * 100) / 100),
        confidence: confidence,
        lower_bound: Math.max(0, Math.round((predicted - std * 1.5) * 100) / 100),
        upper_bound: Math.round((predicted + std * 1.5) * 100) / 100
      });

      lastValue = predicted;
    }

    return predictions;
  }

  static async detectMortalityAnomaly(farmId: string, flockId: string, todayCount: number): Promise<AnomalyDetection> {
    const { data: flock } = await supabase
      .from('flocks')
      .select('current_count, initial_count, arrival_date')
      .eq('id', flockId)
      .single();

    if (!flock) {
      return {
        isAnomaly: false,
        severity: 'low',
        message: 'Unable to assess mortality',
        expectedRange: { min: 0, max: 5 },
        actualValue: todayCount
      };
    }

    const today = new Date();
    const arrivalDate = new Date(flock.arrival_date);
    const ageInDays = Math.floor((today.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));

    let expectedDailyMortality = 0.001 * flock.current_count;

    if (ageInDays < 7) {
      expectedDailyMortality = 0.02 * flock.current_count;
    } else if (ageInDays < 14) {
      expectedDailyMortality = 0.01 * flock.current_count;
    }

    const mortalityRate = todayCount / flock.current_count;
    const threshold_high = 0.05;
    const threshold_medium = 0.02;

    let isAnomaly = false;
    let severity: 'low' | 'medium' | 'high' = 'low';
    let message = 'Mortality within normal range';

    if (mortalityRate > threshold_high) {
      isAnomaly = true;
      severity = 'high';
      message = `CRITICAL: High mortality rate detected (${(mortalityRate * 100).toFixed(2)}%). Immediate investigation required.`;
    } else if (mortalityRate > threshold_medium) {
      isAnomaly = true;
      severity = 'medium';
      message = `WARNING: Elevated mortality detected (${(mortalityRate * 100).toFixed(2)}%). Monitor closely.`;
    } else if (todayCount > expectedDailyMortality * 3) {
      isAnomaly = true;
      severity = 'medium';
      message = `Above average mortality: ${todayCount} birds (expected: ${Math.round(expectedDailyMortality)})`;
    }

    return {
      isAnomaly,
      severity,
      message,
      expectedRange: {
        min: 0,
        max: Math.ceil(expectedDailyMortality * 2)
      },
      actualValue: todayCount
    };
  }

  static async detectProductionAnomaly(farmId: string, flockId: string, todayProduction: number): Promise<AnomalyDetection> {
    const { data: collections } = await supabase
      .from('egg_collections')
      .select('total_collected')
      .eq('farm_id', farmId)
      .eq('flock_id', flockId)
      .order('collection_date', { ascending: false })
      .limit(30);

    if (!collections || collections.length < 7) {
      return {
        isAnomaly: false,
        severity: 'low',
        message: 'Insufficient data for anomaly detection',
        expectedRange: { min: 0, max: todayProduction * 2 },
        actualValue: todayProduction
      };
    }

    const historicalData = collections.map(c => c.total_collected);
    const mean = historicalData.reduce((sum, val) => sum + val, 0) / historicalData.length;
    const std = this.standardDeviation(historicalData);

    const zScore = Math.abs((todayProduction - mean) / std);
    const lowerBound = mean - std * 2;
    const upperBound = mean + std * 2;

    let isAnomaly = false;
    let severity: 'low' | 'medium' | 'high' = 'low';
    let message = 'Production within normal range';

    if (zScore > 3) {
      isAnomaly = true;
      severity = 'high';
      if (todayProduction < mean) {
        message = `ALERT: Egg production dropped significantly to ${todayProduction} (avg: ${Math.round(mean)})`;
      } else {
        message = `Notable increase in production: ${todayProduction} eggs (avg: ${Math.round(mean)})`;
        severity = 'low';
      }
    } else if (zScore > 2) {
      isAnomaly = true;
      severity = 'medium';
      if (todayProduction < mean) {
        message = `Production below normal: ${todayProduction} eggs (expected: ${Math.round(mean)})`;
      }
    }

    return {
      isAnomaly,
      severity,
      message,
      expectedRange: {
        min: Math.max(0, Math.round(lowerBound)),
        max: Math.round(upperBound)
      },
      actualValue: todayProduction
    };
  }

  static async predictOptimalReplacementDate(farmId: string, flockId: string): Promise<{ date: string; reason: string; confidence: number }> {
    const { data: flock } = await supabase
      .from('flocks')
      .select('arrival_date, purpose, current_count')
      .eq('id', flockId)
      .single();

    if (!flock) {
      return {
        date: new Date().toISOString().split('T')[0],
        reason: 'Unable to calculate',
        confidence: 0
      };
    }

    const arrivalDate = new Date(flock.arrival_date);
    const today = new Date();
    const ageInDays = Math.floor((today.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));

    if (flock.purpose === 'broiler') {
      const optimalAge = 42;
      const replacementDate = new Date(arrivalDate);
      replacementDate.setDate(arrivalDate.getDate() + optimalAge);

      return {
        date: replacementDate.toISOString().split('T')[0],
        reason: `Optimal market weight at ${optimalAge} days`,
        confidence: 0.9
      };
    } else if (flock.purpose === 'layer') {
      const peakProductionEnd = 365;
      const economicCutoff = 500;

      const { data: recentProduction } = await supabase
        .from('egg_collections')
        .select('total_collected')
        .eq('flock_id', flockId)
        .order('collection_date', { ascending: false })
        .limit(30);

      if (recentProduction && recentProduction.length >= 30) {
        const avgProduction = recentProduction.reduce((sum, c) => sum + c.total_collected, 0) / 30;
        const productionRate = avgProduction / flock.current_count;

        if (productionRate < 0.5 && ageInDays > peakProductionEnd) {
          const replacementDate = new Date(today);
          replacementDate.setDate(today.getDate() + 14);

          return {
            date: replacementDate.toISOString().split('T')[0],
            reason: `Production dropped below 50% (currently ${(productionRate * 100).toFixed(0)}%)`,
            confidence: 0.85
          };
        }
      }

      if (ageInDays > economicCutoff) {
        const replacementDate = new Date(today);
        replacementDate.setDate(today.getDate() + 30);

        return {
          date: replacementDate.toISOString().split('T')[0],
          reason: 'Flock reached end of economic life',
          confidence: 0.8
        };
      }

      const replacementDate = new Date(arrivalDate);
      replacementDate.setDate(arrivalDate.getDate() + economicCutoff);

      return {
        date: replacementDate.toISOString().split('T')[0],
        reason: 'Projected end of economic production cycle',
        confidence: 0.7
      };
    }

    return {
      date: new Date().toISOString().split('T')[0],
      reason: 'Unable to determine optimal replacement',
      confidence: 0
    };
  }
}
