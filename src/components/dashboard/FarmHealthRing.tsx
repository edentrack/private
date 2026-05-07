import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface FarmHealthRingProps {
  size?: number;
  children: React.ReactNode;
  onClick?: () => void;
  showLabel?: boolean;
}

/**
 * BUG-083: brand-new farms with zero logged events showed "22% INACTIVE"
 * — confusing as a first impression. We now return a `setup` mode flag
 * so the UI can render "Setup mode" instead of a misleading percentage
 * + scary red label.
 */
type HealthScoreResult = { mode: 'score'; score: number } | { mode: 'setup' };

async function computeHealthScore(farmId: string): Promise<HealthScoreResult> {
  const today = new Date().toISOString().split('T')[0];

  const { data: flockData } = await supabase
    .from('flocks')
    .select('id, start_date, initial_count, current_count')
    .eq('farm_id', farmId)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1);

  const flock = flockData?.[0] || null;
  // BUG-083: bail out early for completely empty farms. The user
  // doesn't need a score yet — they need a hint that they're in setup
  // mode and adding their first flock will unlock the rest.
  if (!flock) {
    return { mode: 'setup' };
  }
  const flockStart = flock?.start_date || '2000-01-01';

  const [
    workersRes, workersWithPayRes, configRes,
    expensesRes, eggCollRes, mortalityRes,
    tasksRes, feedRes, _salesRes,
    recentActivityRes,
  ] = await Promise.allSettled([
    supabase.from('farm_workers').select('id').eq('farm_id', farmId).eq('is_active', true).limit(1),
    supabase.from('farm_workers').select('id').eq('farm_id', farmId).eq('is_active', true).not('monthly_salary', 'is', null).limit(1),
    supabase.from('farm_setup_config').select('egg_prices').eq('farm_id', farmId).maybeSingle(),
    supabase.from('expenses').select('id').eq('farm_id', farmId).gte('incurred_on', flockStart).limit(1),
    supabase.from('egg_collections').select('id').eq('farm_id', farmId).gte('collection_date', flockStart).limit(1),
    supabase.from('mortality_logs').select('count').eq('farm_id', farmId).gte('event_date', flockStart),
    supabase.from('tasks').select('id').eq('farm_id', farmId).eq('status', 'pending').lt('scheduled_for', `${today}T00:00:00`).eq('is_archived', false),
    supabase.from('feed_stock').select('id, current_stock_bags, bags_in_stock').eq('farm_id', farmId).limit(5),
    supabase.from('egg_sales').select('id').eq('farm_id', farmId).gte('sale_date', flockStart).limit(1),
    // Recent activity — anything in last 14 days
    supabase.from('egg_collections').select('id').eq('farm_id', farmId).gte('collection_date', new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]).limit(1),
  ]);

  const get = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? r.value : { data: null };

  const totalMortality = (get(mortalityRes).data || []).reduce((s: number, m: any) => s + (m.count || 0), 0);
  const mortalityPct = flock?.initial_count ? (totalMortality / flock.initial_count) * 100 : 0;
  const mortalityOk = !flock || mortalityPct < 5;
  const overdueCount = get(tasksRes).data?.length || 0;
  const tasksOk = overdueCount < 3;
  const feedItems = get(feedRes).data || [];
  const hasFeed = feedItems.some((f: any) => (f.current_stock_bags || f.bags_in_stock || 0) > 0);

  const checks = [
    !!flock,
    (get(workersRes).data?.length || 0) > 0,
    (get(workersWithPayRes).data?.length || 0) > 0,
    Object.keys(get(configRes).data?.egg_prices || {}).length > 0,
    (get(expensesRes).data?.length || 0) > 0,
    (get(eggCollRes).data?.length || 0) > 0,
    mortalityOk,
    tasksOk,
    hasFeed,
  ];

  const baseScore = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  // "Abandoned" penalty: if no recent activity (14 days), reduce score by up to 30%
  const hasRecentActivity = (get(recentActivityRes).data?.length || 0) > 0;
  if (!hasRecentActivity && flock) {
    return { mode: 'score', score: Math.max(10, Math.round(baseScore * 0.7)) };
  }
  return { mode: 'score', score: baseScore };
}

export function FarmHealthRing({ size = 42, children, onClick: _onClick, showLabel = false }: FarmHealthRingProps) {
  const { currentFarm, currentRole } = useAuth();
  const [result, setResult] = useState<HealthScoreResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!currentFarm?.id) return;
    if (currentRole !== 'owner' && currentRole !== 'manager') return;

    const cacheKey = `fh_score_${currentFarm.id}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object' && 'mode' in parsed) {
          setResult(parsed as HealthScoreResult);
        } else if (typeof parsed === 'number') {
          // Backwards-compat: old cache stored just the number.
          setResult({ mode: 'score', score: parsed });
        }
      } catch {
        // Corrupt cache — fall through to recompute.
      }
    }

    // Recompute every 5 minutes max
    const lastFetch = Number(sessionStorage.getItem(`${cacheKey}_ts`) || 0);
    if (Date.now() - lastFetch < 5 * 60 * 1000 && cached) return;

    computeHealthScore(currentFarm.id).then(r => {
      setResult(r);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(r));
        sessionStorage.setItem(`${cacheKey}_ts`, String(Date.now()));
      } catch {}
    });

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [currentFarm?.id, currentRole]);

  // No ring for workers/viewers, or while loading
  if (result === null || (currentRole !== 'owner' && currentRole !== 'manager')) {
    return <>{children}</>;
  }

  const strokeW = 2.5;
  const radius = (size - strokeW) / 2;
  const circumference = 2 * Math.PI * radius;

  // BUG-083: empty farms render "Setup mode" with a neutral grey ring at
  // 0% rather than a panicky "22% INACTIVE" red label.
  const isSetup = result.mode === 'setup';
  const score = isSetup ? 0 : result.score;
  const dash = (score / 100) * circumference;
  const gap = circumference - dash;

  const color = isSetup
    ? '#94a3b8' // neutral grey
    : score >= 80 ? '#22c55e'
    : score >= 50 ? '#f59e0b'
    : score >= 25 ? '#ef4444'
    : '#94a3b8'; // grey = abandoned

  const label = isSetup
    ? 'Setup mode'
    : score >= 80 ? 'Healthy'
    : score >= 50 ? 'Fair'
    : score >= 25 ? 'At risk'
    : 'Inactive';

  const helpText = isSetup
    ? 'Farm Health is in Setup mode while you add your first flock/pond/rabbitry. Once you log your first event, the ring will start scoring you on operational health.'
    : `Farm Health: ${score}% — ${label}.\n` +
      `Combines farm setup completeness (workers added, prices set, feed tracked) ` +
      `with operational health (mortality rate, overdue tasks, recent activity). ` +
      `Add data daily to raise the score.`;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="relative"
        style={{ width: size, height: size }}
        title={helpText}
        aria-label={helpText}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeW}
            opacity={0.15}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            style={{ transition: 'stroke-dasharray 0.7s ease, stroke 0.5s ease' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            top: strokeW + 2,
            left: strokeW + 2,
            right: strokeW + 2,
            bottom: strokeW + 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </div>
      </div>
      {showLabel && (
        <div style={{ textAlign: 'center', lineHeight: 1.1, cursor: 'help' }} title={helpText}>
          {!isSetup && (
            <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.01em' }}>
              {score}%
            </div>
          )}
          <div style={{ fontSize: 9, color, opacity: 0.75, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            {label}
          </div>
        </div>
      )}
    </div>
  );
}
