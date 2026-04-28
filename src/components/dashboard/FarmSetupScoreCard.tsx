import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Zap, ChevronRight, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface HealthItem {
  key: string;
  label: string;
  done: boolean;
  category: 'setup' | 'health';
  detail?: string;
  prompt: string;
}

interface FarmSetupScoreCardProps {
  onAskEden: (prompt: string) => void;
}

export function FarmSetupScoreCard({ onAskEden }: FarmSetupScoreCardProps) {
  const { currentFarm, currentRole } = useAuth();
  const [items, setItems] = useState<HealthItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const key = `health_score_dismissed_${currentFarm?.id}`;
    if (sessionStorage.getItem(key)) setDismissed(true);
  }, [currentFarm?.id]);

  useEffect(() => {
    if (!currentFarm?.id) return;
    load();
  }, [currentFarm?.id]);

  const load = async () => {
    if (!currentFarm?.id) return;
    try {
      // Step 1: get active flock first (need start_date + initial_count)
      const { data: flockData } = await supabase
        .from('flocks')
        .select('id, start_date, initial_count, current_count')
        .eq('farm_id', currentFarm.id)
        .eq('status', 'active')
        .order('start_date', { ascending: false })
        .limit(1);

      const flock = flockData?.[0] || null;
      const flockStart = flock?.start_date || '2000-01-01';
      const today = new Date().toISOString().split('T')[0];

      // Step 2: all other queries in parallel — look back to flock creation
      const [
        workersRes, workersWithPayRes, configRes,
        expensesRes, eggCollRes, mortalityRes,
        tasksRes, feedRes, salesRes,
      ] = await Promise.all([
        // 2. Workers added
        supabase.from('farm_workers').select('id').eq('farm_id', currentFarm.id).eq('is_active', true).limit(1),
        // 3. Pay rates set
        supabase.from('farm_workers').select('id').eq('farm_id', currentFarm.id).eq('is_active', true).not('monthly_salary', 'is', null).limit(1),
        // 4. Egg prices
        supabase.from('farm_setup_config').select('egg_prices').eq('farm_id', currentFarm.id).maybeSingle(),
        // 5. Expenses logged since flock start
        supabase.from('expenses').select('id').eq('farm_id', currentFarm.id).gte('incurred_on', flockStart).limit(1),
        // 6. Egg collections since flock start
        supabase.from('egg_collections').select('id').eq('farm_id', currentFarm.id).gte('collection_date', flockStart).limit(1),
        // 8. Mortality (all records since flock start — sum counts)
        supabase.from('mortality_logs').select('count').eq('farm_id', currentFarm.id).gte('event_date', flockStart),
        // 9. Overdue tasks
        supabase.from('tasks').select('id').eq('farm_id', currentFarm.id).eq('status', 'pending').lt('scheduled_for', `${today}T00:00:00`).eq('is_archived', false),
        // 10. Feed stock tracked
        supabase.from('feed_stock').select('id, current_stock_bags, bags_in_stock').eq('farm_id', currentFarm.id).limit(5),
        // Sales since flock start
        supabase.from('egg_sales').select('id').eq('farm_id', currentFarm.id).gte('sale_date', flockStart).limit(1),
      ]);

      // Compute mortality rate
      const totalMortality = (mortalityRes.data || []).reduce((s, m: any) => s + (m.count || 0), 0);
      const mortalityPct = flock?.initial_count ? (totalMortality / flock.initial_count) * 100 : 0;
      const mortalityOk = !flock || mortalityPct < 5;

      // Overdue tasks (< 3 is passing)
      const overdueCount = tasksRes.data?.length || 0;
      const tasksOk = overdueCount < 3;

      // Feed stock — any item with stock > 0
      const feedItems = feedRes.data || [];
      const hasFeed = feedItems.some((f: any) => (f.current_stock_bags || f.bags_in_stock || 0) > 0);

      setItems([
        // ── Setup items (1–6) ──
        {
          key: 'flocks',
          category: 'setup',
          label: 'Active flock running',
          done: !!flock,
          prompt: 'Help me create my first flock',
        },
        {
          key: 'workers',
          category: 'setup',
          label: 'Workers added to farm',
          done: (workersRes.data?.length || 0) > 0,
          prompt: 'Help me add my workers to the farm',
        },
        {
          key: 'pay_rates',
          category: 'setup',
          label: 'Pay rates configured',
          done: (workersWithPayRes.data?.length || 0) > 0,
          prompt: 'Help me set up pay rates for my workers',
        },
        {
          key: 'egg_prices',
          category: 'setup',
          label: 'Egg selling prices set',
          done: Object.keys(configRes.data?.egg_prices || {}).length > 0,
          prompt: 'Help me configure my egg selling prices',
        },
        {
          key: 'expenses',
          category: 'setup',
          label: 'Expenses being logged',
          done: (expensesRes.data?.length || 0) > 0,
          prompt: 'Show me how to log farm expenses',
        },
        {
          key: 'egg_collections',
          category: 'setup',
          label: 'Egg collections recorded',
          done: (eggCollRes.data?.length || 0) > 0,
          prompt: 'How do I record my daily egg collections?',
        },
        // ── Health items (8–10, #7 vaccination skipped) ──
        {
          key: 'mortality',
          category: 'health',
          label: 'Mortality rate healthy',
          done: mortalityOk,
          detail: flock ? `${mortalityPct.toFixed(1)}% of flock — ${mortalityOk ? 'within normal range' : 'above 5% threshold'}` : undefined,
          prompt: `My mortality rate is ${mortalityPct.toFixed(1)}% — is that normal and what should I do?`,
        },
        {
          key: 'tasks',
          category: 'health',
          label: 'Tasks up to date',
          done: tasksOk,
          detail: overdueCount > 0 ? `${overdueCount} overdue task${overdueCount !== 1 ? 's' : ''}` : undefined,
          prompt: 'I have overdue tasks — help me catch up',
        },
        {
          key: 'feed_stock',
          category: 'health',
          label: 'Feed stock tracked',
          done: hasFeed,
          prompt: 'Help me set up feed stock tracking',
        },
      ]);
    } catch {
      // fail silently — non-critical UI
    } finally {
      setLoading(false);
    }
  };

  const setupItems = items.filter(i => i.category === 'setup');
  const healthItems = items.filter(i => i.category === 'health');
  const doneCount = items.filter(i => i.done).length;
  const score = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;
  const scoreColor = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const missing = items.filter(i => !i.done);

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(`health_score_dismissed_${currentFarm?.id}`, '1'); } catch {}
  };

  if (loading || dismissed || score === 100 || items.length === 0) return null;
  if (currentRole !== 'owner' && currentRole !== 'manager') return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ background: `${scoreColor}18` }}>
            <Zap className="w-4 h-4" style={{ color: scoreColor }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Farm Health Score</p>
            <p className="text-xs text-gray-500">Checked from the start of your flock</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold" style={{ color: scoreColor }}>{score}%</span>
          <button onClick={dismiss} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${score}%`, background: scoreColor }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">{doneCount} of {items.length} checks passed</p>
      </div>

      {/* Setup section */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Setup</p>
        <div className="space-y-1.5">
          {setupItems.map(item => (
            <HealthRow key={item.key} item={item} onAskEden={onAskEden} />
          ))}
        </div>
      </div>

      {/* Health section */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Health Checks</p>
        <div className="space-y-1.5">
          {healthItems.map(item => (
            <HealthRow key={item.key} item={item} onAskEden={onAskEden} />
          ))}
        </div>
      </div>

      {missing.length > 0 && (
        <button
          onClick={() => onAskEden("Run a full farm health check and help me fix everything that's missing")}
          className="mt-1 w-full py-2 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
          style={{ background: `${scoreColor}15`, color: scoreColor }}
        >
          <Zap className="w-3.5 h-3.5" />
          Fix everything with Eden
        </button>
      )}
    </div>
  );
}

function HealthRow({ item, onAskEden }: { item: HealthItem; onAskEden: (p: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        {item.done ? (
          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <span className={`text-xs block truncate ${item.done ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}`}>
            {item.label}
          </span>
          {item.detail && !item.done && (
            <span className="text-xs text-red-500">{item.detail}</span>
          )}
        </div>
      </div>
      {!item.done && (
        <button
          onClick={() => onAskEden(item.prompt)}
          className="flex items-center gap-0.5 text-xs text-[#3D5F42] font-medium hover:underline flex-shrink-0"
        >
          Ask Eden <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
