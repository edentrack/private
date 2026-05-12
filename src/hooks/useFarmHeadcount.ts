import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  headcountStatus,
  type HeadcountStatus,
} from '../utils/planGating';

/**
 * Live count of active animals on a farm, plus its plan-tier status
 * (ok / approaching / over / hard_stop / unlimited).
 *
 * Reads from the `farm_active_headcount` view, which unions:
 *   - active flocks  → poultry, fish, "main" rabbit flock
 *   - active rabbit grow-out groups (cohorts from litters or buy-ins)
 *
 * Refetches when the farmId or tier changes, and exposes a `refetch()`
 * for components that want to re-poll after a known-state change
 * (e.g. after creating a flock or logging a sale).
 *
 * Failure handling: a missing view, an offline read, or an RLS
 * rejection all collapse to count=0 + state='ok'. We never want a
 * banner to crash render. A console warning is logged for debug.
 */
export function useFarmHeadcount(
  farmId: string | null | undefined,
  tier: string | null | undefined,
): {
  count: number;
  status: HeadcountStatus;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!farmId) { setCount(0); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('farm_active_headcount')
        .select('current_count')
        .eq('farm_id', farmId)
        .maybeSingle();
      if (error) throw error;
      setCount((data as { current_count: number | null } | null)?.current_count ?? 0);
    } catch (err) {
      console.warn('[useFarmHeadcount] read failed (treating as 0):', err);
      setCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // farmId is the only dependency that affects the query; tier just
    // changes how we interpret the result via headcountStatus below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  return {
    count,
    status: headcountStatus(tier, count),
    loading,
    refetch: load,
  };
}
