/**
 * Utility functions for converting feed quantities between different units
 * Uses farm settings for feed unit and quantity per bag
 */

import { supabase } from '../lib/supabaseClient';

export interface FeedConversionSettings {
  feedUnit: string; // 'bags', 'kg', 'grams', 'tonnes', etc.
  quantityPerBag: number; // e.g., 50 for 50kg bags
}

const DEFAULT_SETTINGS: FeedConversionSettings = {
  feedUnit: 'bags',
  quantityPerBag: 50, // Default to 50kg bags
};

/**
 * Get feed conversion settings from farm
 */
export async function getFeedConversionSettings(farmId: string): Promise<FeedConversionSettings> {
  try {
    const { data, error } = await supabase
      .from('farms')
      .select('feed_unit, feed_quantity_per_bag')
      .eq('id', farmId)
      .single();

    if (error || !data) {
      return DEFAULT_SETTINGS;
    }

    return {
      feedUnit: data.feed_unit || DEFAULT_SETTINGS.feedUnit,
      quantityPerBag: data.feed_quantity_per_bag || DEFAULT_SETTINGS.quantityPerBag,
    };
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Feed conversion settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Convert feed quantity to kilograms
 * @param quantity - The quantity to convert
 * @param unit - The unit of the quantity (from feed_types table or inventory_usage)
 * @param settings - Feed conversion settings from farm
 */
export function convertFeedToKg(
  quantity: number,
  unit: string | null | undefined,
  settings: FeedConversionSettings
): number {
  if (!quantity || quantity === 0) return 0;

  const normalizedUnit = (unit || settings.feedUnit || 'bags').toLowerCase().trim();

  // If already in kg, return as is
  if (normalizedUnit === 'kg' || normalizedUnit === 'kilograms' || normalizedUnit === 'kilogram') {
    return quantity;
  }

  // If in grams, convert to kg
  if (normalizedUnit === 'g' || normalizedUnit === 'grams' || normalizedUnit === 'gram') {
    return quantity / 1000;
  }

  // If in tonnes, convert to kg
  if (normalizedUnit === 'tonnes' || normalizedUnit === 'tonne' || normalizedUnit === 'tons' || normalizedUnit === 'ton') {
    return quantity * 1000;
  }

  // If in bags, convert using quantity per bag
  if (normalizedUnit === 'bags' || normalizedUnit === 'bag') {
    return quantity * settings.quantityPerBag;
  }

  // Default: assume it's already in kg
  return quantity;
}

/**
 * Convert feed quantity from kilograms to the farm's preferred unit
 */
export function convertKgToFeedUnit(
  kg: number,
  settings: FeedConversionSettings
): { quantity: number; unit: string } {
  if (!kg || kg === 0) return { quantity: 0, unit: settings.feedUnit };

  const normalizedUnit = (settings.feedUnit || 'bags').toLowerCase().trim();

  if (normalizedUnit === 'kg' || normalizedUnit === 'kilograms' || normalizedUnit === 'kilogram') {
    return { quantity: kg, unit: 'kg' };
  }

  if (normalizedUnit === 'g' || normalizedUnit === 'grams' || normalizedUnit === 'gram') {
    return { quantity: kg * 1000, unit: 'g' };
  }

  if (normalizedUnit === 'tonnes' || normalizedUnit === 'tonne' || normalizedUnit === 'tons' || normalizedUnit === 'ton') {
    return { quantity: kg / 1000, unit: 'tonnes' };
  }

  // Default: convert to bags
  if (settings.quantityPerBag > 0) {
    return { quantity: kg / settings.quantityPerBag, unit: 'bags' };
  }

  return { quantity: kg, unit: 'kg' };
}
