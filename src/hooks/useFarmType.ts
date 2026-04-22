import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export type FarmType = 'broiler' | 'layer' | 'mixed' | 'unknown';

export interface FarmTypeInfo {
  farmType: FarmType;
  /** Show egg-related UI (collection, egg sales, laying rate KPI) */
  showEggs: boolean;
  /** Show FCR metric */
  showFCR: boolean;
  /** Show weight tracking as primary metric */
  showWeight: boolean;
  /** Loading — don't render flock-specific UI yet */
  loading: boolean;
  /** Raw counts */
  broilerCount: number;
  layerCount: number;
}

const DEFAULT: FarmTypeInfo = {
  farmType: 'unknown',
  showEggs: true,
  showFCR: true,
  showWeight: true,
  loading: true,
  broilerCount: 0,
  layerCount: 0,
};

let _cache: { farmId: string; info: FarmTypeInfo } | null = null;

export function useFarmType(): FarmTypeInfo {
  const { currentFarm } = useAuth();
  const [info, setInfo] = useState<FarmTypeInfo>(() => {
    if (_cache && currentFarm && _cache.farmId === currentFarm.id) return _cache.info;
    return DEFAULT;
  });

  useEffect(() => {
    if (!currentFarm?.id) {
      setInfo({ ...DEFAULT, loading: false, farmType: 'unknown' });
      return;
    }

    // Return cache immediately if same farm
    if (_cache?.farmId === currentFarm.id) {
      setInfo(_cache.info);
      return;
    }

    supabase
      .from('flocks')
      .select('type')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'active')
      .then(({ data }) => {
        const flocks = data || [];
        const broilers = flocks.filter(f => f.type === 'Broiler').length;
        const layers = flocks.filter(f => f.type !== 'Broiler').length;

        let farmType: FarmType = 'unknown';
        if (flocks.length === 0) farmType = 'unknown';
        else if (broilers > 0 && layers === 0) farmType = 'broiler';
        else if (layers > 0 && broilers === 0) farmType = 'layer';
        else farmType = 'mixed';

        const result: FarmTypeInfo = {
          farmType,
          showEggs: layers > 0 || farmType === 'unknown',
          showFCR: broilers > 0 || farmType === 'unknown',
          showWeight: true, // both types benefit from weight tracking
          loading: false,
          broilerCount: broilers,
          layerCount: layers,
        };

        _cache = { farmId: currentFarm.id, info: result };
        setInfo(result);
      });
  }, [currentFarm?.id]);

  return info;
}

/** Call this when a flock is created/archived to bust the cache */
export function invalidateFarmTypeCache() {
  _cache = null;
}
