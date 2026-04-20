import { useState, useEffect } from 'react';
import { CheckCircle, Clock, AlertCircle, ListChecks, Calendar, Egg } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Task, Flock } from '../../types/database';
import { CompleteTaskModal } from '../tasks/CompleteTaskModal';
import { canUserCompleteTask, getTaskTimeStatus, formatTaskDueTime } from '../../utils/taskPermissions';
import { enrichTasks } from '../../utils/taskHelpers';

interface WorkerDashboardProps {
  onNavigate?: (page: string) => void;
}

interface WorkerShift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: string;
}

export function WorkerDashboard({ onNavigate }: WorkerDashboardProps) {
  const { user, currentFarm, currentRole } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [shifts, setShifts] = useState<WorkerShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  useEffect(() => {
    if (user && currentFarm?.id) {
      loadTodaysTasks();
      loadFlocks();
      loadUpcomingShifts();
    }
  }, [user, currentFarm?.id]);

  const loadTodaysTasks = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .gte('scheduled_for', todayStart)
        .lt('scheduled_for', todayEnd)
        .order('scheduled_time', { ascending: true });

      if (error) throw error;
      setTasks(enrichTasks(data || []));
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFlocks = async () => {
    if (!currentFarm?.id) return;

    const { data } = await supabase
      .from('flocks')
      .select('*')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'active');

    if (data) {
      setFlocks(data);
    }
  };

  const loadUpcomingShifts = async () => {
    if (!currentFarm?.id || !user?.id) return;

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const { data } = await supabase
      .from('worker_shifts')
      .select('*')
      .eq('farm_id', currentFarm.id)
      .eq('worker_id', user.id)
      .in('shift_date', [today, tomorrow])
      .order('shift_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (data) {
      setShifts(data);
    }
  };

  const getFlockName = (flockId: string | null): string => {
    if (!flockId) return 'General';
    const flock = flocks.find((f) => f.id === flockId);
    return flock?.name || 'Unknown Flock';
  };


  const isTaskCompleted = (task: Task) => task.status === 'completed';

  const getStatusBadge = (task: Task) => {
    if (isTaskCompleted(task)) {
      return (
        <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
          <CheckCircle className="w-3 h-3" />
          Completed
        </span>
      );
    }

    const status = getTaskTimeStatus(task);

    switch (status) {
      case 'overdue':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
            <AlertCircle className="w-3 h-3" />
            Overdue
          </span>
        );
      case 'due_now':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            Due Now
          </span>
        );
      case 'upcoming':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            Later
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            Any time
          </span>
        );
    }
  };

  const handleQuickComplete = async (task: Task) => {
    if (!currentRole) return;

    const check = canUserCompleteTask(currentRole, task);
    if (!check.allowed) {
      alert(check.reason || 'You cannot complete this task right now.');
      return;
    }

    const taskTitle = task.title_override || 'Task';
    const taskNotes = task.notes || '';
    if (taskTitle.includes('Record') || taskNotes.includes('usage') || taskNotes.includes('collection')) {
      setSelectedTask(task);
      return;
    }

    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: user!.id,
        })
        .eq('id', task.id);

      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        action: `Completed task: ${taskTitle}`,
        entity_type: 'task',
        entity_id: task.id,
        farm_id: currentFarm?.id,
        details: { title: taskTitle },
      });

      loadTodaysTasks();
    } catch (error) {
      console.error('Error completing task:', error);
    }
  };

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'pending') return task.status !== 'completed';
    if (filter === 'completed') return task.status === 'completed';
    return true;
  });

  const pendingCount = tasks.filter((t) => t.status !== 'completed').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading today's tasks...</div>
      </div>
    );
  }

  const todayShifts = shifts.filter(s => s.shift_date === new Date().toISOString().split('T')[0]);
  const tomorrowShifts = shifts.filter(s => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    return s.shift_date === tomorrow;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gradient-to-r from-[#3D5F42] to-[#2d4632] rounded-3xl p-6 text-white">
        <h1 className="text-3xl font-bold mb-2">My Workspace</h1>
        <p className="text-white/80">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-white/20 rounded-2xl px-4 py-3">
            <div className="text-2xl font-bold">{pendingCount}</div>
            <div className="text-xs text-white/80">Pending Tasks</div>
          </div>
          <div className="bg-white/20 rounded-2xl px-4 py-3">
            <div className="text-2xl font-bold">{completedCount}</div>
            <div className="text-xs text-white/80">Completed</div>
          </div>
          <div className="bg-white/20 rounded-2xl px-4 py-3">
            <div className="text-2xl font-bold">{todayShifts.length}</div>
            <div className="text-xs text-white/80">Today Shifts</div>
          </div>
          <div className="bg-white/20 rounded-2xl px-4 py-3">
            <div className="text-2xl font-bold">{flocks.length}</div>
            <div className="text-xs text-white/80">Active Flocks</div>
          </div>
        </div>
      </div>

      {shifts.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-[#3D5F42]" />
            <h2 className="text-xl font-bold text-gray-900">Upcoming Shifts</h2>
          </div>
          <div className="space-y-3">
            {todayShifts.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Today</h3>
                {todayShifts.map((shift) => (
                  <div key={shift.id} className="bg-green-50 border border-green-200 rounded-xl p-3 mb-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900">
                        {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        shift.status === 'completed' ? 'bg-green-100 text-green-700' :
                        shift.status === 'missed' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {shift.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tomorrowShifts.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Tomorrow</h3>
                {tomorrowShifts.map((shift) => (
                  <div key={shift.id} className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900">
                        {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
                      </span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                        scheduled
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl font-medium transition-colors whitespace-nowrap ${
            filter === 'all' ? 'bg-[#3D5F42] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Tasks ({tasks.length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded-xl font-medium transition-colors whitespace-nowrap ${
            filter === 'pending' ? 'bg-[#3D5F42] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Pending ({pendingCount})
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`px-4 py-2 rounded-xl font-medium transition-colors whitespace-nowrap ${
            filter === 'completed' ? 'bg-[#3D5F42] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Completed ({completedCount})
        </button>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center">
          <ListChecks className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {filter === 'completed' ? 'No completed tasks yet' : 'No tasks for today'}
          </h3>
          <p className="text-gray-500">
            {filter === 'completed' ? 'Complete tasks to see them here' : 'Enjoy your day!'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task) => {
            const check = currentRole ? canUserCompleteTask(currentRole, task) : { allowed: false };
            const timeStatus = getTaskTimeStatus(task);
            const taskTitle = task.title_override || 'Task';
            const taskNotes = task.notes || '';
            const completed = task.status === 'completed';

            return (
              <div
                key={task.id}
                className={`bg-white rounded-2xl p-6 shadow-sm border-2 transition-all ${
                  completed
                    ? 'border-green-200'
                    : timeStatus === 'overdue'
                    ? 'border-red-200'
                    : timeStatus === 'due_now'
                    ? 'border-orange-200'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusBadge(task)}
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded-lg text-gray-600">
                        {getFlockName(task.flock_id)}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">{taskTitle}</h3>
                    {taskNotes && (
                      <p className="text-sm text-gray-600 mb-2">{taskNotes}</p>
                    )}
                    {task.scheduled_time && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span>{formatTaskDueTime(task)}</span>
                      </div>
                    )}
                    {!check.allowed && check.reason && (
                      <p className="text-sm text-red-600 mt-2">{check.reason}</p>
                    )}
                  </div>
                </div>

                {!completed && (
                  <button
                    onClick={() => {
                      if (taskTitle.includes('Record') || taskNotes.includes('usage')) {
                        setSelectedTask(task);
                      } else {
                        handleQuickComplete(task);
                      }
                    }}
                    disabled={!check.allowed}
                    className={`w-full py-3 rounded-xl font-medium transition-colors ${
                      check.allowed
                        ? 'bg-[#3D5F42] text-white hover:bg-[#2d4632]'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {taskTitle.includes('Record') || taskNotes.includes('usage')
                      ? 'Enter Data'
                      : 'Mark Complete'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedTask && (
        <CompleteTaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSuccess={() => {
            setSelectedTask(null);
            loadTodaysTasks();
          }}
        />
      )}
    </div>
  );
}
