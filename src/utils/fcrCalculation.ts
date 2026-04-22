/**
 * Feed Conversion Ratio (FCR) Calculation Utility
 *
 * FCR = Total feed consumed (kg) / Total weight gained (kg)
 *
 * Example:
 * - 5000 broilers consume 50,000 kg of feed over 42 days
 * - Starting avg weight: 50g per bird = 250 kg total
 * - Ending avg weight: 2,100g per bird = 10,500 kg total
 * - Weight gained: 10,500 - 250 = 10,250 kg
 * - FCR = 50,000 / 10,250 = 4.88
 *
 * Good broiler target: 1.5-2.0
 * Industry average: 2.0-2.5
 *
 * Note: FCR is primarily meaningful for broilers. Layers focus on daily egg production,
 * so we show "N/A" for layer flocks with an explanatory tooltip.
 */

import { supabase } from '../lib/supabaseClient';
import { convertFeedToKg, getFeedConversionSettings } from './feedConversions';

interface FCRCalculationResult {
  fcr: number | null; // null if no data or layer flock
  isLayerFlock: boolean;
  isMixedFarm: boolean;
  feedConsumedKg: number;
  weightGainedKg: number;
  reasonIfNull?: string;
}

/**
 * Calculate FCR for active broiler flocks on a farm over a date range.
 * Returns null if:
 * - No broiler flocks exist
 * - No feed usage data in range
 * - No weight records in range
 * - Flocks are layers (not broilers)
 */
export async function calculateFCRForFarm(
  farmId: string,
  startDate: string,
  endDate: string
): Promise<FCRCalculationResult> {
  try {
    // Get active broiler flocks
    const { data: flocks, error: flocksError } = await supabase
      .from('flocks')
      .select('id, type, current_count')
      .eq('farm_id', farmId)
      .eq('status', 'active');

    if (flocksError || !flocks || flocks.length === 0) {
      return {
        fcr: null,
        isLayerFlock: false,
        isMixedFarm: false,
        feedConsumedKg: 0,
        weightGainedKg: 0,
        reasonIfNull: 'No active flocks',
      };
    }

    const broilerFlocks = flocks.filter((f) => f.type === 'Broiler');
    const layerFlocks = flocks.filter((f) => f.type !== 'Broiler');

    // If all flocks are layers, return N/A indicator
    if (broilerFlocks.length === 0) {
      return {
        fcr: null,
        isLayerFlock: true,
        isMixedFarm: false,
        feedConsumedKg: 0,
        weightGainedKg: 0,
        reasonIfNull: 'Layer-focused farm (FCR not applicable)',
      };
    }

    // Mixed farm: can't accurately split feed between broilers and layers
    if (layerFlocks.length > 0) {
      return {
        fcr: null,
        isLayerFlock: false,
        isMixedFarm: true,
        feedConsumedKg: 0,
        weightGainedKg: 0,
        reasonIfNull: 'Mixed farm — FCR unavailable (broilers and layers share feed logs)',
      };
    }

    const broilerFlockIds = broilerFlocks.map((f) => f.id);

    // Get feed conversion settings
    const feedSettings = await getFeedConversionSettings(farmId);

    // NOTE: feed_usage_logs is farm-level only (no flock_id column).
    // We fetch all farm feed for the window, then allocate to broilers
    // by their share of total birds on the farm. This is an approximation —
    // if you need exact per-flock FCR, add flock_id to inventory_usage
    // and write it at log time, then switch this query to filter by flock.
    const { data: feedLogs } = await supabase
      .from('feed_usage_logs')
      .select('quantity_used')
      .eq('farm_id', farmId)
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`);

    // Sum all farm feed usage (quantity_used is already in the feed_type's unit).
    // Without per-log unit info, assume kg as the default — existing consumers
    // of feed_usage_logs treat it the same way.
    const totalFarmFeedKg = (feedLogs || []).reduce((sum, log) => {
      return sum + Number(log.quantity_used || 0);
    }, 0);

    // Allocate feed to broilers by bird-count share
    const broilerBirds = broilerFlocks.reduce((sum, f) => sum + (f.current_count || 0), 0);
    const totalBirds = flocks.reduce((sum: number, f: any) => sum + (f.current_count || 0), 0);
    const broilerShare = totalBirds > 0 ? broilerBirds / totalBirds : 0;
    const feedConsumedKg = totalFarmFeedKg * broilerShare;
    // `feedSettings` kept for future per-type conversion; unused in farm-level path
    void feedSettings;
    void convertFeedToKg;

    // Get weight logs for broiler flocks — also select bird_count for accurate weight estimates
    const { data: weightLogs } = await supabase
      .from('weight_logs')
      .select('date, average_weight, total_estimated_weight, bird_count')
      .in('flock_id', broilerFlockIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (!weightLogs || weightLogs.length < 2) {
      return {
        fcr: null,
        isLayerFlock: false,
        isMixedFarm: false,
        feedConsumedKg,
        weightGainedKg: 0,
        reasonIfNull: 'Insufficient weight records for FCR calculation',
      };
    }

    // Calculate weight gain (last weight - first weight).
    // average_weight and total_estimated_weight are both stored in kg.
    // Use total_estimated_weight when present (accurate snapshot at weigh time).
    // Fall back to average_weight × bird_count (if recorded) or current_count (last resort).
    const firstWeightRecord = weightLogs[0];
    const lastWeightRecord = weightLogs[weightLogs.length - 1];

    const recordToKg = (record: { average_weight?: number; total_estimated_weight?: number; bird_count?: number }): number => {
      if (record.total_estimated_weight) return record.total_estimated_weight;
      if (record.average_weight) {
        const count = record.bird_count ?? broilerFlocks.reduce((sum, f) => sum + f.current_count, 0);
        return record.average_weight * count;
      }
      return 0;
    };

    const startingWeightKg = recordToKg(firstWeightRecord);
    const endingWeightKg = recordToKg(lastWeightRecord);

    const weightGainedKg = endingWeightKg - startingWeightKg;

    // Calculate FCR
    if (feedConsumedKg === 0 || weightGainedKg <= 0) {
      return {
        fcr: null,
        isLayerFlock: false,
        isMixedFarm: false,
        feedConsumedKg,
        weightGainedKg,
        reasonIfNull: 'Invalid feed or weight data',
      };
    }

    const fcr = feedConsumedKg / weightGainedKg;

    return {
      fcr,
      isLayerFlock: false,
      isMixedFarm: false,
      feedConsumedKg,
      weightGainedKg,
    };
  } catch (error) {
    console.error('Error calculating FCR:', error);
    return {
      fcr: null,
      isLayerFlock: false,
      isMixedFarm: false,
      feedConsumedKg: 0,
      weightGainedKg: 0,
      reasonIfNull: 'Error calculating FCR',
    };
  }
}

/**
 * Get FCR status color and label
 * Broiler targets: 1.5-2.0 (excellent), 2.0-2.5 (good), >2.5 (needs improvement)
 */
export function getFCRStatus(fcr: number): {
  color: string;
  label: string;
  bgGradient: string;
} {
  if (fcr <= 1.8) {
    return {
      color: 'text-green-600',
      label: 'Excellent',
      bgGradient: 'from-green-50 to-green-100',
    };
  } else if (fcr <= 2.3) {
    return {
      color: 'text-amber-600',
      label: 'Good',
      bgGradient: 'from-amber-50 to-amber-100',
    };
  } else {
    return {
      color: 'text-red-600',
      label: 'Needs Improvement',
      bgGradient: 'from-red-50 to-red-100',
    };
  }
}
