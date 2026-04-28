import { useState, useEffect } from 'react';
import { CheckCircle, Circle, Clock, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { getFarmTimeZone, getFarmTodayISO } from '../../utils/farmTime';

interface UpcomingTask {
  id: string;
  title: string;
  scheduled_time: string | null;
  due_date: string;
  status: string;
  flock_name?: string;
}

interface DayGroup {
  dateISO: string;
  label: string;
  tasks: UpcomingTask[];
}

export function UpcomingTasksView() {
  const { currentFarm } = useAuth();
  const farmTz = getFarmTimeZone(currentFarm);
  const [groups, setGroups] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentFarm?.id) load();
  }, [currentFarm?.id]);

  const load = async () => {
    if (!currentFarm?.id) return;
    setLoading(true);
    try {
      const today = getFarmTodayISO(farmTz);
      const in7Days = new Date(today);
      in7Days.setDate(in7Days.getDate() + 7);
      const end = in7Days.toISOString().split('T')[0];

      const { data } = await supabase
        .from('tasks')
        .select(`
          id, status, scheduled_time, due_date,
          title_override,
          task_templates(title),
          flocks(name)
        `)
        .eq('farm_id', currentFarm.id)
        .eq('is_archived', false)
        .gt('due_date', today)
        .lte('due_date', end)
        .order('due_date', { ascending: true })
        .order('scheduled_time', { ascending: true, nullsFirst: false });

      const tasks: UpcomingTask[] = (data || []).map((t: any) => ({
        id: t.id,
        title: t.title_override || t.task_templates?.title || 'Task',
        scheduled_time: t.scheduled_time,
        due_date: t.due_date,
        status: t.status,
        flock_name: t.flocks?.name,
      }));

      // Group by date
      const map = new Map<string, UpcomingTask[]>();
      tasks.forEach(t => {
        const existing = map.get(t.due_date) || [];
        existing.push(t);
        map.set(t.due_date, existing);
      });

      const dayGroups: DayGroup[] = [];
      for (let i = 1; i <= 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const iso = d.toISOString().split('T')[0];
        const label = i === 1
          ? 'Tomorrow'
          : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        dayGroups.push({ dateISO: iso, label, tasks: map.get(iso) || [] });
      }

      setGroups(dayGroups);
    } finally {
      setLoading(false);
    }
  };

  const fmtTime = (t: string | null) => {
    if (!t) return '';
    const d = new Date(`1970-01-01T${t.slice(0, 5)}:00`);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  const hasAny = groups.some(g => g.tasks.length > 0);

  return (
    <div className="space-y-3">
      {!hasAny && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nothing scheduled</p>
          <p className="text-gray-400 text-sm mt-1">No tasks in the next 7 days</p>
        </div>
      )}

      {groups.map(group => {
        if (group.tasks.length === 0) return null;
        return (
          <div key={group.dateISO} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">{group.label}</span>
              <span className="ml-2 text-xs text-gray-400">{group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {group.tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                  {task.status === 'completed'
                    ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {task.title}
                    </p>
                    {task.flock_name && (
                      <p className="text-xs text-gray-400 mt-0.5">{task.flock_name}</p>
                    )}
                  </div>
                  {task.scheduled_time && (
                    <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {fmtTime(task.scheduled_time)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
