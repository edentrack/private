import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { farmLocalToUtcIso, getFarmTimeZone } from '../../utils/farmTime';

interface Flock { id: string; name: string; }
interface Member { user_id: string; full_name: string; role: string; }

interface AddTaskModalProps {
  flockId?: string;
  initialDueDate?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AddTaskModal({ flockId, initialDueDate, onClose, onSuccess }: AddTaskModalProps) {
  const { user, currentFarm } = useAuth();
  const farmTz = getFarmTimeZone(currentFarm);

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(initialDueDate || new Date().toISOString().split('T')[0]);
  const [dueTime, setDueTime] = useState('08:00');
  const [selectedFlockId, setSelectedFlockId] = useState(flockId || '');
  const [assignedTo, setAssignedTo] = useState('');
  const [repeat, setRepeat] = useState<'once' | 'weekly'>('once');
  const [selectedDays, setSelectedDays] = useState<number[]>([1]); // Monday default

  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentFarm?.id) return;
    supabase.from('flocks').select('id, name').eq('farm_id', currentFarm.id).eq('status', 'active').order('name')
      .then(({ data }) => setFlocks(data || []));
    supabase.from('farm_members').select('user_id, role, profiles(full_name)').eq('farm_id', currentFarm.id).eq('is_active', true)
      .then(({ data }) => setMembers((data || []).map((m: any) => ({
        user_id: m.user_id,
        full_name: m.profiles?.full_name || 'Unknown',
        role: m.role,
      }))));
  }, [currentFarm?.id]);

  const toggleDay = (idx: number) => {
    setSelectedDays(prev =>
      prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentFarm?.id || !title.trim()) { setError('Title is required'); return; }
    if (repeat === 'weekly' && selectedDays.length === 0) { setError('Select at least one day'); return; }

    setSaving(true);
    setError('');
    try {
      if (repeat === 'once') {
        const scheduledTs = farmLocalToUtcIso({ dateISO: dueDate, timeHHMM: dueTime, farmTz });
        await supabase.from('tasks').insert({
          farm_id: currentFarm.id,
          flock_id: selectedFlockId || null,
          title_override: title.trim(),
          scheduled_for: dueDate,
          window_start: scheduledTs,
          scheduled_time: dueTime,
          due_date: dueDate,
          assigned_to: assignedTo || null,
          status: 'pending',
          requires_input: false,
        });
      } else {
        // Weekly recurring — save as a task_template with days_of_week
        const { data: tpl, error: tplErr } = await supabase.from('task_templates').insert({
          farm_id: currentFarm.id,
          flock_id: selectedFlockId || null,
          title: title.trim(),
          category: 'Other',
          icon: '📋',
          scope: 'general',
          type_category: 'one_time',
          default_frequency: 'weekly',
          frequency_mode: 'multiple_times_per_day',
          days_of_week: selectedDays,
          scheduled_time: dueTime,
          completion_window_minutes: 120,
          display_order: 999,
          requires_input: false,
          is_active: true,
          is_enabled: true,
          assigned_to: assignedTo || null,
        }).select('id').single();

        if (tplErr) throw tplErr;

        // Also generate today's task if today is one of the selected days
        const todayDow = new Date().getDay();
        if (selectedDays.includes(todayDow)) {
          const today = new Date().toISOString().split('T')[0];
          const scheduledTs = farmLocalToUtcIso({ dateISO: today, timeHHMM: dueTime, farmTz });
          await supabase.from('tasks').insert({
            farm_id: currentFarm.id,
            flock_id: selectedFlockId || null,
            template_id: tpl.id,
            title_override: title.trim(),
            scheduled_for: today,
            window_start: scheduledTs,
            scheduled_time: dueTime,
            due_date: today,
            assigned_to: assignedTo || null,
            status: 'pending',
            requires_input: false,
          });
        }
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Add Task</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Task name</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Clean drinkers, Weigh birds…"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoFocus
              required
            />
          </div>

          {/* Repeat */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Repeat</label>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              {(['once', 'weekly'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setRepeat(opt)}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                    repeat === opt ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {opt === 'once' ? 'Once' : 'Weekly (recurring)'}
                </button>
              ))}
            </div>
          </div>

          {/* Date — only for once */}
          {repeat === 'once' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Time</label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={e => setDueTime(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>
          )}

          {/* Days + Time — for weekly */}
          {repeat === 'weekly' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Runs on</label>
                <div className="flex gap-1.5">
                  {DAYS.map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        selectedDays.includes(idx)
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Time</label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={e => setDueTime(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <p className="text-xs text-gray-400">This task will appear automatically every selected day.</p>
            </div>
          )}

          {/* Flock */}
          {flocks.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Flock (optional)</label>
              <select
                value={selectedFlockId}
                onChange={e => setSelectedFlockId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Farm-wide</option>
                {flocks.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}

          {/* Assign */}
          {members.length > 1 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Assign to (optional)</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Unassigned</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.full_name} ({m.role})</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !title.trim()}
              className="flex-1 py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors">
              {saving ? 'Saving…' : repeat === 'weekly' ? 'Save Recurring Task' : 'Save Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
