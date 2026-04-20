import { useEffect, useState } from 'react';
import { Plus, Minus, TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Flock, MortalityLog } from '../../types/database';

interface MortalityTrackingProps {
  flock: Flock | null;
}

const MORTALITY_REASONS = [
  'Unknown',
  'Predation',
  'Disease',
  'Heat Stress',
  'Injury',
  'Natural Causes',
];

export function MortalityTracking({ flock }: MortalityTrackingProps) {
  const { currentRole } = useAuth();
  const toast = useToast();
  const [count, setCount] = useState(0);
  const [reason, setReason] = useState('Unknown');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [logs, setLogs] = useState<MortalityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (flock) {
      loadMortalityLogs();
    }
  }, [flock]);

  const loadMortalityLogs = async () => {
    if (!flock) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data } = await supabase
      .from('mortality_logs')
      .select('*')
      .eq('flock_id', flock.id)
      .gte('event_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('event_date', { ascending: false });

    setLogs(data || []);
  };

  const handleSave = async () => {
    if (!flock || count === 0) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('mortality_logs').insert({
        flock_id: flock.id,
        farm_id: flock.farm_id,
        event_date: date,
        count,
        cause: reason,
        notes,
      });

      if (error) throw error;

      const newCount = Math.max(0, flock.current_count - count);
      await supabase
        .from('flocks')
        .update({ current_count: newCount })
        .eq('id', flock.id);

      setCount(0);
      setDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      loadMortalityLogs();
      toast.success('Mortality logged successfully');
    } catch (error) {
      console.error('Error logging mortality:', error);
      toast.error('Failed to log mortality');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (log: MortalityLog) => {
    if (!flock) return;

    if (!confirm(`Delete mortality record of ${log.count} birds on ${new Date(log.event_date).toLocaleDateString()}?`)) {
      return;
    }

    setDeletingId(log.id);
    try {
      const { error } = await supabase
        .from('mortality_logs')
        .delete()
        .eq('id', log.id);

      if (error) throw error;

      const newCount = flock.current_count + log.count;
      await supabase
        .from('flocks')
        .update({ current_count: newCount })
        .eq('id', flock.id);

      loadMortalityLogs();
      toast.success('Mortality record deleted');
    } catch (error) {
      console.error('Error deleting mortality log:', error);
      toast.error('Failed to delete mortality record');
    } finally {
      setDeletingId(null);
    }
  };

  const getWeeklyData = () => {
    const weeklyData: { week: string; count: number }[] = [];
    const weeks = 4;

    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i * 7 + 7));
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - (i * 7));

      const weekLogs = logs.filter(log => {
        const logDate = new Date(log.event_date);
        return logDate >= weekStart && logDate < weekEnd;
      });

      const totalCount = weekLogs.reduce((sum, log) => sum + log.count, 0);

      weeklyData.push({
        week: `Week ${weeks - i}`,
        count: totalCount,
      });
    }

    return weeklyData;
  };

  const weeklyData = getWeeklyData();
  const maxCount = Math.max(...weeklyData.map(d => d.count), 1);

  if (!flock) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center">
        <p className="text-gray-600">Please select a flock to track mortality</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Mortality Tracking</h2>
        <p className="text-gray-600">{flock.name}</p>
      </div>

      <div className="bg-white rounded-3xl p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Today's Mortality</h3>

        <div className="flex items-center justify-center space-x-6 mb-6">
          {currentRole && currentRole !== 'viewer' && (
            <button
              onClick={() => setCount(Math.max(0, count - 1))}
              className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition-colors"
            >
              <Minus className="w-6 h-6 text-gray-700" />
            </button>
          )}

          <div className="text-5xl font-bold text-gray-900 w-24 text-center">
            {count}
          </div>

          {currentRole && currentRole !== 'viewer' && (
            <button
              onClick={() => setCount(count + 1)}
              className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition-colors"
            >
              <Plus className="w-6 h-6 text-gray-700" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Loss
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
            >
              {MORTALITY_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
              rows={3}
              placeholder="Additional details..."
            />
          </div>

          {currentRole && currentRole !== 'viewer' && (
            <button
              onClick={handleSave}
              disabled={loading || count === 0}
              className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-medium hover:bg-[#2F4A34] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Mortality'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Mortality Trend</h3>

        <div className="h-64 flex items-end justify-between space-x-2">
          {weeklyData.map((data, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="w-full bg-gray-100 rounded-t-lg overflow-hidden relative" style={{ height: '200px' }}>
                <div
                  className="absolute bottom-0 w-full bg-[#3D5F42] rounded-t-lg transition-all duration-300"
                  style={{ height: `${(data.count / maxCount) * 100}%` }}
                />
                {data.count > 0 && (
                  <div className="absolute top-2 left-0 right-0 text-center text-xs font-semibold text-gray-700">
                    {data.count}
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-600 mt-2 font-medium">
                {data.week}
              </div>
            </div>
          ))}
        </div>
      </div>

      {logs.length > 0 && (
        <div className="bg-white rounded-3xl p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Logs</h3>
          <div className="space-y-3">
            {logs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{log.cause}</div>
                  <div className="text-sm text-gray-500">
                    {new Date(log.event_date).toLocaleDateString()}
                    {log.notes && <span className="ml-2 text-gray-400">• {log.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-lg font-bold text-gray-900">{log.count}</div>
                  {currentRole && currentRole !== 'viewer' && (
                    <button
                      onClick={() => handleDelete(log)}
                      disabled={deletingId === log.id}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors group disabled:opacity-50"
                      title="Delete this record"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 group-hover:text-red-600" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
