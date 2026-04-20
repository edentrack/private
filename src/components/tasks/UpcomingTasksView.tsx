import { useState, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, Circle, CheckCircle, Database, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { getFlockTypesForFarm, TaskWithMetadata } from '../../utils/unifiedTaskSystem';

interface UpcomingTasksViewProps {
  onTaskClick?: (task: TaskWithMetadata) => void;
}

interface DayTaskCount {
  date: string;
  count: number;
}

export function UpcomingTasksView({ onTaskClick }: UpcomingTasksViewProps) {
  const { currentFarm } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [tasks, setTasks] = useState<TaskWithMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [taskCounts, setTaskCounts] = useState<Map<string, number>>(new Map());
  const [rangeMode, setRangeMode] = useState<'week' | 'month'>('week');

  useEffect(() => {
    if (currentFarm?.id) {
      loadTaskCountsForMonth();
    }
  }, [currentFarm?.id, currentMonth]);

  useEffect(() => {
    if (currentFarm?.id && selectedDate) {
      loadTasksForDate();
    }
  }, [currentFarm?.id, selectedDate]);

  function getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  const loadTaskCountsForMonth = async () => {
    if (!currentFarm?.id) return;

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('tasks')
      .select('due_date, scheduled_for')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'pending')
      .eq('is_archived', false)
      .gte('scheduled_for', `${firstDay}T00:00:00`)
      .lte('scheduled_for', `${lastDay}T23:59:59`);

    const counts = new Map<string, number>();
    data?.forEach((task: any) => {
      const date = task.scheduled_for?.split('T')[0] || task.due_date;
      if (date) {
        counts.set(date, (counts.get(date) || 0) + 1);
      }
    });
    setTaskCounts(counts);
  };

  const loadTasksForDate = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const flockTypes = await getFlockTypesForFarm(supabase, currentFarm.id);

      const startOfDay = `${selectedDate}T00:00:00`;
      const endOfDay = `${selectedDate}T23:59:59`;

      const { data: tasksData } = await supabase
        .from('tasks')
        .select(`
          *,
          task_templates(title, category, icon, scope, type_category, requires_input),
          flocks(name, type)
        `)
        .eq('farm_id', currentFarm.id)
        .eq('is_archived', false)
        .gte('scheduled_for', startOfDay)
        .lte('scheduled_for', endOfDay)
        .order('scheduled_for', { ascending: true });

      if (!tasksData) {
        setTasks([]);
        return;
      }

      const seenTemplates = new Set<string>();
      const uniqueTasks = tasksData.filter((task: any) => {
        const key = `${task.template_id || task.id}-${task.due_date || selectedDate}`;
        if (seenTemplates.has(key)) return false;
        seenTemplates.add(key);
        return true;
      });

      const mappedTasks: TaskWithMetadata[] = uniqueTasks
        .filter((task: any) => {
          if (!flockTypes || flockTypes.length === 0) return true;
          const template = task.task_templates;
          if (!template) return true;
          const taskScope = template.scope || 'general';
          if (taskScope === 'general') return true;
          if (taskScope === 'broiler' && !flockTypes.includes('Broiler')) return false;
          if (taskScope === 'layer' && !flockTypes.includes('Layer')) return false;
          return true;
        })
        .map((task: any) => {
          const template = task.task_templates;
          const flock = task.flocks;
          const todayStr = getTodayDate();
          const taskDate = task.scheduled_for?.split('T')[0] || task.due_date;
          const isOverdue = task.status === 'pending' && taskDate < todayStr;

          return {
            id: task.id,
            farm_id: task.farm_id,
            flock_id: task.flock_id,
            template_id: task.template_id,
            title_override: task.title_override,
            scheduled_for: task.scheduled_for,
            window_start: task.window_start,
            window_end: task.window_end,
            status: task.status,
            requires_input: task.requires_input || template?.requires_input || false,
            data_payload: task.data_payload,
            completed_at: task.completed_at,
            completed_by: task.completed_by,
            due_date: task.due_date,
            scheduled_time: task.scheduled_time,
            assigned_to: task.assigned_to,
            notes: task.notes,
            is_archived: task.is_archived || false,
            archived_at: task.archived_at,
            archived_by: task.archived_by,
            created_at: task.created_at,
            updated_at: task.updated_at,
            taskType: template?.type_category || 'daily',
            scope: template?.scope || 'general',
            isOverdue,
            templateTitle: task.title_override || template?.title || 'Task',
            templateCategory: template?.category || 'General',
            templateIcon: template?.icon || null,
            isRecording: template?.type_category === 'recording',
            flockName: flock?.name,
          };
        });

      setTasks(mappedTasks);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startDay = firstDayOfMonth.getDay();

    const days: (Date | null)[] = [];

    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  }, [currentMonth]);

  const isToday = (date: Date | null) => {
    if (!date) return false;
    return date.toISOString().split('T')[0] === getTodayDate();
  };

  const isSelected = (date: Date | null) => {
    if (!date) return false;
    return date.toISOString().split('T')[0] === selectedDate;
  };

  const isPast = (date: Date | null) => {
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const getTaskCount = (date: Date | null) => {
    if (!date) return 0;
    return taskCounts.get(date.toISOString().split('T')[0]) || 0;
  };

  const getTypeBadgeStyle = (task: TaskWithMetadata) => {
    if (task.isRecording) return 'bg-blue-50 text-blue-700';
    if (task.taskType === 'one_time') return 'bg-teal-50 text-teal-700';
    return 'bg-green-50 text-green-700';
  };

  const getScopeBadgeStyle = (scope: string) => {
    if (scope === 'broiler') return 'bg-amber-50 text-amber-700';
    if (scope === 'layer') return 'bg-sky-50 text-sky-700';
    return '';
  };

  const getTypeLabel = (task: TaskWithMetadata) => {
    if (task.isRecording) return 'Recording';
    if (task.taskType === 'one_time') return 'Custom';
    return 'Daily';
  };

  const getTypeIcon = (task: TaskWithMetadata) => {
    if (task.isRecording) return <Database className="w-3 h-3" />;
    return <ClipboardList className="w-3 h-3" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Upcoming Tasks</h2>
          <p className="text-sm text-gray-600">Select a date to view tasks</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button
            onClick={handlePreviousMonth}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h3 className="font-semibold text-gray-900">
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <button
            onClick={handleNextMonth}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-2">
          <div className="grid grid-cols-7 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={index} className="aspect-square" />;
              }

              const taskCount = getTaskCount(day);
              const selected = isSelected(day);
              const today = isToday(day);
              const past = isPast(day);

              return (
                <button
                  key={index}
                  onClick={() => handleDateClick(day)}
                  className={`aspect-square p-1 rounded-lg text-center transition-all relative ${
                    selected
                      ? 'bg-[#3D5F42] text-white'
                      : past
                      ? 'text-gray-400 hover:bg-gray-50'
                      : today
                      ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      : 'text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-sm font-medium">{day.getDate()}</span>
                  {taskCount > 0 && (
                    <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${
                      selected ? 'bg-white/30 text-white' : 'bg-[#3D5F42] text-white'
                    }`}>
                      {taskCount > 9 ? '9+' : taskCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#3D5F42]" />
            <h3 className="font-semibold text-gray-900">
              {new Date(selectedDate).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              })}
            </h3>
          </div>
          <span className="text-sm text-gray-500">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-[#3D5F42] rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-6">
            <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No tasks scheduled</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => onTaskClick?.(task)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                  task.status === 'completed'
                    ? 'bg-gray-50 opacity-60'
                    : 'bg-gray-50 hover:bg-gray-100 cursor-pointer'
                }`}
              >
                <div className="flex-shrink-0">
                  {task.status === 'completed' ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <Circle className="w-4 h-4 text-gray-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className={`text-sm font-medium truncate ${
                    task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'
                  }`}>
                    {task.templateTitle}
                  </span>
                  <span className={`flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${getTypeBadgeStyle(task)}`}>
                    {getTypeIcon(task)}
                    {getTypeLabel(task)}
                  </span>
                  {task.scope !== 'general' && (
                    <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded ${getScopeBadgeStyle(task.scope)}`}>
                      {task.scope === 'broiler' ? 'Broiler' : 'Layer'}
                    </span>
                  )}
                </div>

                <span className="text-xs text-gray-500 flex-shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(task.scheduled_for)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
