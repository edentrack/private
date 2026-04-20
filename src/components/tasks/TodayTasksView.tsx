import { useState, useEffect } from 'react';
import { CheckCircle, Circle, Clock, AlertTriangle, Database, Calendar, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    if (currentFarm?.id) {
      loadTasks();
    }
  }, [currentFarm?.id, farmTz]);

  const loadTasks = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const today = getFarmTodayISO(farmTz);
      const flockTypes = await getFlockTypesForFarm(supabase, currentFarm.id);
      await ensureTasksGeneratedForDate(supabase, currentFarm.id, today, flockTypes, farmTz);
      await normalizeAndDedupTasksForDate(supabase, currentFarm.id, today);
      const tasksData = await getTasksForDate(supabase, currentFarm.id, today, true, flockTypes, farmTz);

      const sortedTasks = tasksData.sort((a, b) => {
        if (a.status === 'pending' && b.status === 'completed') return -1;
        if (a.status === 'completed' && b.status === 'pending') return 1;
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
      });

      setTasks(sortedTasks);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskClick = (task: TaskWithMetadata) => {
    if (task.status === 'completed') return;

    if (currentRole === 'viewer') {
      return;
    }

    if (task.requires_input || task.isRecording) {
      setSelectedTask(task);
      setShowCompleteModal(true);
    } else {
      handleQuickComplete(task);
    }
  };

  const handleQuickComplete = async (task: TaskWithMetadata) => {
    if (!user || !currentFarm?.id) return;

    const result = await completeTask(supabase, task.id, user.id, currentFarm.id);

    if (result.success) {
      await loadTasks();
      onTaskCompleted?.();
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getTypeIcon = (task: TaskWithMetadata) => {
    if (task.isRecording) return <Database className="w-3.5 h-3.5" />;
    if (task.taskType === 'one_time') return <Calendar className="w-3.5 h-3.5" />;
    return <ClipboardList className="w-3.5 h-3.5" />;
  };

  const getTypeLabel = (task: TaskWithMetadata) => {
    if (task.isRecording) return 'Recording';
    if (task.taskType === 'one_time') return 'Custom';
    return 'Daily';
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

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const overdueTasks = pendingTasks.filter(t => t.isOverdue);
  const dueTodayTasks = pendingTasks.filter(t => !t.isOverdue);
  const completedTasks = tasks.filter(t => t.status === 'completed');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-[#3D5F42] rounded-full animate-spin" />
      </div>
    );
  }

  const TaskRow = ({ task }: { task: TaskWithMetadata }) => (
    <button
      onClick={() => handleTaskClick(task)}
      disabled={currentRole === 'viewer' || task.status === 'completed'}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all rounded-lg ${
        task.status === 'completed'
          ? 'bg-gray-50 opacity-60'
          : task.isOverdue
          ? 'bg-red-50 hover:bg-red-100'
          : 'bg-white hover:bg-gray-50'
      } ${currentRole === 'viewer' || task.status === 'completed' ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <div className="flex-shrink-0">
        {task.status === 'completed' ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <Circle className={`w-5 h-5 ${task.isOverdue ? 'text-red-400' : 'text-gray-300'}`} />
        )}
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className={`font-medium truncate ${
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
        {task.flockName && (
          <span className="flex-shrink-0 text-xs text-gray-500">{task.flockName}</span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 text-xs text-gray-500">
        <Clock className="w-3.5 h-3.5" />
        {formatTime(task.scheduled_for)}
      </div>
    </button>
  );

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Today's Tasks</h2>
            <p className="text-sm text-gray-600">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>
          <div className="text-sm text-gray-500">
            {pendingTasks.length} pending
          </div>
        </div>
      )}

      {pendingTasks.length === 0 && completedTasks.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl">
          <CheckCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">All caught up!</p>
          <p className="text-sm text-gray-400">No tasks for today</p>
        </div>
      ) : (
        <div className="space-y-3">
          {overdueTasks.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-semibold text-red-800">Overdue ({overdueTasks.length})</span>
              </div>
              <div className="space-y-1">
                {overdueTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {dueTodayTasks.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-[#3D5F42]" />
                <span className="text-sm font-semibold text-gray-700">Due Today ({dueTodayTasks.length})</span>
              </div>
              <div className="space-y-1">
                {dueTodayTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {completedTasks.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-semibold text-gray-700">Completed ({completedTasks.length})</span>
                </div>
                {showCompleted ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>
              {showCompleted && (
                <div className="space-y-1 mt-2">
                  {completedTasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showCompleteModal && selectedTask && (
        <CompleteTaskModal
          task={selectedTask}
          onClose={() => {
            setShowCompleteModal(false);
            setSelectedTask(null);
          }}
          onSuccess={() => {
            setShowCompleteModal(false);
            setSelectedTask(null);
            loadTasks();
            onTaskCompleted?.();
          }}
        />
      )}
    </div>
  );
}
