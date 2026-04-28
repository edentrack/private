import { useState, useEffect } from 'react';
import { CheckCircle, Circle, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import {
  ensureTasksGeneratedForDate,
  getTasksForDate,
  completeTask,
  getFlockTypesForFarm,
  normalizeAndDedupTasksForDate,
  TaskWithMetadata,
} from '../../utils/unifiedTaskSystem';
import { getFarmTimeZone, getFarmTodayISO } from '../../utils/farmTime';
import { CompleteTaskModal } from './CompleteTaskModal';

interface TodayTasksViewProps {
  onTaskCompleted?: () => void;
  compact?: boolean;
}

export function TodayTasksView({ onTaskCompleted, compact = false }: TodayTasksViewProps) {
  const { currentFarm, user, currentRole } = useAuth();
  const farmTz = getFarmTimeZone(currentFarm);
  const [tasks, setTasks] = useState<TaskWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<TaskWithMetadata | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    if (currentFarm?.id) loadTasks();
  }, [currentFarm?.id, farmTz]);

  const loadTasks = async () => {
    if (!currentFarm?.id) return;
    setLoading(true);
    try {
      const today = getFarmTodayISO(farmTz);
      const flockTypes = await getFlockTypesForFarm(supabase, currentFarm.id);
      await ensureTasksGeneratedForDate(supabase, currentFarm.id, today, flockTypes, farmTz);
      await normalizeAndDedupTasksForDate(supabase, currentFarm.id, today);
      const data = await getTasksForDate(supabase, currentFarm.id, today, true, flockTypes, farmTz);
      setTasks(data.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
      }));
    } catch (e) {
      console.error('Error loading tasks:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (task: TaskWithMetadata) => {
    if (task.status === 'completed' || currentRole === 'viewer') return;
    if (task.requires_input || task.isRecording) {
      setSelectedTask(task);
    } else {
      quickComplete(task);
    }
  };

  const quickComplete = async (task: TaskWithMetadata) => {
    if (!user || !currentFarm?.id) return;
    const result = await completeTask(supabase, task.id, user.id, currentFarm.id);
    if (result.success) { await loadTasks(); onTaskCompleted?.(); }
  };

  const fmtTime = (s: string) =>
    new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const pending = tasks.filter(t => t.status === 'pending');
  const overdue = pending.filter(t => t.isOverdue);
  const dueToday = pending.filter(t => !t.isOverdue);
  const completed = tasks.filter(t => t.status === 'completed');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  const TaskRow = ({ task }: { task: TaskWithMetadata }) => (
    <button
      onClick={() => handleClick(task)}
      disabled={currentRole === 'viewer' || task.status === 'completed'}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-xl transition-all ${
        task.status === 'completed' ? 'opacity-50 cursor-default' :
        task.isOverdue ? 'bg-red-50 hover:bg-red-100' : 'bg-white hover:bg-gray-50'
      } ${currentRole === 'viewer' ? 'cursor-default' : ''}`}
    >
      <div className="flex-shrink-0">
        {task.status === 'completed'
          ? <CheckCircle className="w-5 h-5 text-green-500" />
          : <Circle className={`w-5 h-5 ${task.isOverdue ? 'text-red-400' : 'text-gray-300'}`} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {task.templateTitle}
        </p>
        {task.flockName && (
          <p className="text-xs text-gray-400 mt-0.5">{task.flockName}</p>
        )}
      </div>
      <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
        <Clock className="w-3 h-3" />
        {fmtTime(task.scheduled_for)}
      </div>
    </button>
  );

  if (pending.length === 0 && completed.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
        <CheckCircle className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">All done!</p>
        <p className="text-gray-400 text-sm mt-1">No tasks for today</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <span className="text-sm text-gray-400">{pending.length} pending</span>
        </div>
      )}

      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold text-red-700">Overdue ({overdue.length})</span>
          </div>
          <div className="space-y-1">
            {overdue.map(t => <TaskRow key={t.id} task={t} />)}
          </div>
        </div>
      )}

      {dueToday.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Due Today ({dueToday.length})</span>
          </div>
          <div className="space-y-1">
            {dueToday.map(t => <TaskRow key={t.id} task={t} />)}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-3">
          <button
            onClick={() => setShowCompleted(v => !v)}
            className="w-full flex items-center justify-between px-1"
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm font-semibold text-gray-700">Completed ({completed.length})</span>
            </div>
            {showCompleted ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showCompleted && (
            <div className="space-y-1 mt-2">
              {completed.map(t => <TaskRow key={t.id} task={t} />)}
            </div>
          )}
        </div>
      )}

      {selectedTask && (
        <CompleteTaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSuccess={() => { setSelectedTask(null); loadTasks(); onTaskCompleted?.(); }}
        />
      )}
    </div>
  );
}
