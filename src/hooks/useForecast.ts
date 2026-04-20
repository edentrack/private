import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { FlockForecastRollup, FarmForecastRollup } from '../types/database';

export function useEnsureFlockForecastWeeks() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (params: {
    flockId: string;
    startWeek: number;
    endWeek: number;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('ensure_flock_forecast_weeks', {
        p_flock_id: params.flockId,
        p_start_week: params.startWeek,
        p_end_week: params.endWeek
      });

      if (rpcError) throw rpcError;
      return data as number;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create forecast weeks');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { execute, loading, error };
}

export function useDeleteFlockForecastWeeks() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (params: {
    flockId: string;
    startWeek: number;
    endWeek: number;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('delete_flock_forecast_weeks', {
        p_flock_id: params.flockId,
        p_start_week: params.startWeek,
        p_end_week: params.endWeek
      });

      if (rpcError) throw rpcError;
      return data as number;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete forecast weeks');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { execute, loading, error };
}

export function useFlockForecastRollup(
  flockId: string | null,
  startWeek: number,
  endWeek: number
) {
  const [data, setData] = useState<FlockForecastRollup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refetch = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!flockId) {
      setData([]);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: rollupData, error: rpcError } = await supabase.rpc('get_flock_forecast_rollup', {
          p_flock_id: flockId,
          p_start_week: startWeek,
          p_end_week: endWeek
        });

        if (rpcError) throw rpcError;
        setData((rollupData || []) as FlockForecastRollup[]);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to fetch flock forecast');
        setError(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [flockId, startWeek, endWeek, refreshTrigger]);

  return { data, loading, error, refetch };
}

export function useFarmForecastRollup(
  farmId: string | null,
  startWeek: number,
  endWeek: number
) {
  const [data, setData] = useState<FarmForecastRollup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refetch = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!farmId) {
      setData([]);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: rollupData, error: rpcError } = await supabase.rpc('get_farm_forecast_rollup', {
          p_farm_id: farmId,
          p_start_week: startWeek,
          p_end_week: endWeek
        });

        if (rpcError) throw rpcError;
        setData((rollupData || []) as FarmForecastRollup[]);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to fetch farm forecast');
        setError(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [farmId, startWeek, endWeek, refreshTrigger]);

  return { data, loading, error, refetch };
}
