/**
 * useEdenChips — fetch personalized empty-state suggestion chips for a farm.
 *
 * Per Phase 2 design decision #3: Haiku-personalized chips, cached 24h
 * keyed on (farm_id, day-bucket) so repeat visits the same day don't re-bill.
 *
 * Cache layer: localStorage. If cache is stale (>24h) or missing, hit
 * /functions/v1/eden-chips. If the edge function fails, fall back to
 * static chips locally.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface EdenChip {
  icon: string;
  label: string;
}

interface CacheEntry {
  bucket: string; // YYYY-MM-DD
  chips: EdenChip[];
  fallback: boolean;
}

const CACHE_VERSION = 1;
const STATIC_FALLBACKS: Record<string, EdenChip[]> = {
  aquaculture: [
    { icon: '📊', label: "What's my current FCR?" },
    { icon: '💧', label: 'Should I worry about my water quality?' },
    { icon: '🎯', label: 'When should I harvest?' },
  ],
  rabbits: [
    { icon: '📊', label: "What's my mortality rate?" },
    { icon: '🐰', label: 'Help me plan my next breeding' },
    { icon: '🎯', label: 'When should I wean my litters?' },
  ],
  poultry: [
    { icon: '📊', label: "Analyze my farm's performance this week" },
    { icon: '🥚', label: "What's my profit margin?" },
    { icon: '💉', label: 'What vaccines do my birds need?' },
  ],
};

function todayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

function cacheKey(farmId: string): string {
  return `eden_chips_v${CACHE_VERSION}:${farmId}`;
}

function readCache(farmId: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(cacheKey(farmId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed.bucket !== todayBucket()) return null;
    if (!Array.isArray(parsed.chips) || parsed.chips.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(farmId: string, entry: CacheEntry): void {
  try {
    localStorage.setItem(cacheKey(farmId), JSON.stringify(entry));
  } catch {
    /* quota — non-fatal */
  }
}

export interface UseEdenChipsResult {
  chips: EdenChip[];
  loading: boolean;
  /** True when chips came from the static client-side fallback (no Haiku call). */
  fallback: boolean;
}

export function useEdenChips(
  farmId: string | null | undefined,
  farmType: string | null | undefined
): UseEdenChipsResult {
  const initialFallback = STATIC_FALLBACKS[farmType ?? 'poultry'] ?? STATIC_FALLBACKS.poultry;
  const [chips, setChips] = useState<EdenChip[]>(initialFallback);
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState(true);

  useEffect(() => {
    if (!farmId) {
      setChips(initialFallback);
      setFallback(true);
      setLoading(false);
      return;
    }

    // 1. Hit cache — instant.
    const cached = readCache(farmId);
    if (cached) {
      setChips(cached.chips);
      setFallback(cached.fallback);
      setLoading(false);
      return;
    }

    // 2. Cache miss — fetch from edge function.
    setLoading(true);
    let cancelled = false;

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setChips(initialFallback);
          setFallback(true);
          setLoading(false);
          return;
        }
        const resp = await fetch('/api/eden-chips', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ farm_id: farmId, today: todayBucket() }),
        });
        if (!resp.ok) {
          if (!cancelled) {
            setChips(initialFallback);
            setFallback(true);
            setLoading(false);
          }
          return;
        }
        const data = (await resp.json()) as { chips: EdenChip[]; fallback: boolean };
        if (cancelled) return;
        const result: CacheEntry = {
          bucket: todayBucket(),
          chips: data.chips,
          fallback: !!data.fallback,
        };
        writeCache(farmId, result);
        setChips(result.chips);
        setFallback(result.fallback);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setChips(initialFallback);
          setFallback(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [farmId, farmType]); // eslint-disable-line react-hooks/exhaustive-deps

  return { chips, loading, fallback };
}
