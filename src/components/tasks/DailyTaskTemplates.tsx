import { useState, useEffect } from 'react';
import { CheckCircle, Circle, Package, Egg, AlertTriangle, Calendar, Clock, Eye, EyeOff, ListTodo } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Task, Flock, TaskTemplate } from '../../types/database';
import { RecordFeedUsageModal } from './RecordFeedUsageModal';
import { LogCollectionModal } from '../eggs/LogCollectionModal';
import { LogMortalityModal } from '../mortality/LogMortalityModal';
import { canUserCompleteTask, getTaskTimeStatus, formatTaskDueTime } from '../../utils/taskPermissions';
import { enrichTasks } from '../../utils/taskHelpers';

interface DailyTaskTemplatesProps {
  onTaskCompleted: () => void;
}

export function DailyTaskTemplates({ onTaskCompleted }: DailyTaskTemplatesProps) {
  const { currentFarm } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedFlock, setSelectedFlock] = useState<string>('');
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [showCompleted, setShowCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (currentFarm) {
      loadData();
    }
  }, [currentFarm]);

  const loadData = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: templatesData } = await supabase
        .from('task_templates')
        .select('*')
        .order('display_order');

      if (templatesData) {
        setTemplates(templatesData);
      }

      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .eq('scheduled_for', today)
        .order('scheduled_time', { ascending: true });

      if (tasksData) {
        setTasks(enrichTasks(tasksData));
      }

      const { data: flocksData } = await supabase
        .from('flocks')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .eq('status', 'active')
        .order('name');

      if (flocksData) {
        setFlocks(flocksData);
        if (flocksData.length > 0) {
          setSelectedFlock(flocksData[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChecklistTaskComplete = async (task: Task) => {
    if (!currentFarm) return;

    const check = canUserCompleteTask(currentFarm.role || 'worker', task);
    if (!check.allowed) {
      alert(check.reason || 'You cannot complete this task right now.');
      return;
    }

    if (check.isOutsideWindow) {
      const confirm = window.confirm(
        'This task is outside its scheduled window. Do you want to override and complete it anyway?'
      );
      if (!confirm) return;
    }

    try {
      const now = new Date();
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: now.toISOString(),
          completed_by: profile.id,
        })
        .eq('id', task.id);

      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: profile.id,
        farm_id: currentFarm.id,
        action: `Completed task: ${task.title}`,
        entity_type: 'task',
        entity_id: task.id,
        details: { task_id: task.id, scheduled_for: task.scheduled_for },
      });

      await loadData();
      onTaskCompleted();
    } catch (error) {
      console.error('Error completing checklist task:', error);
      alert('Failed to complete task. Please try again.');
    }
  };

  const handleDataTaskClick = (task: Task) => {
    if (!currentFarm) return;

    const check = canUserCompleteTask(currentFarm.role || 'worker', task);
    if (!check.allowed) {
      alert(check.reason || 'You cannot complete this task right now.');
      return;
    }

    setSelectedTask(task);

    if (task.title.includes('feed')) {
      setActiveModal('feed_usage');
    } else if (task.title.includes('egg')) {
      setActiveModal('egg_collection');
    } else if (task.title.includes('mortality')) {
      setActiveModal('mortality');
    }
  };

  const handleDataTaskComplete = async () => {
    if (!selectedTask || !currentFarm) return;

    try {
      const now = new Date();
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed: true,
          completed_at: now.toISOString(),
          completed_by_role: currentFarm.role || 'worker',
        })
        .eq('id', selectedTask.id);

      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: currentFarm.id,
        action: `Completed task: ${selectedTask.title}`,
        entity_type: 'task',
        entity_id: selectedTask.id,
        details: { task_id: selectedTask.id, scheduled_for: selectedTask.scheduled_for },
      });
    } catch (error) {
      console.error('Error marking task as completed:', error);
    }

    setActiveModal(null);
    setSelectedTask(null);
    await loadData();
    onTaskCompleted();
  };

  const getIconForTask = (task: Task) => {
    const template = templates.find((t) => t.id === task.template_id);
    if (!template) return <ListTodo className="w-5 h-5" />;

    switch (template.icon) {
      case 'package':
        return <Package className="w-5 h-5" />;
      case 'egg':
        return <Egg className="w-5 h-5" />;
      case 'alert-triangle':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <Circle className="w-5 h-5" />;
    }
  };

  const getTaskCategory = (task: Task): string => {
    const template = templates.find((t) => t.id === task.template_id);
    return template?.category || 'Custom Tasks';
  };

  const isDataTask = (task: Task): boolean => {
    const template = templates.find((t) => t.id === task.template_id);
    return template?.task_type === 'data';
  };

  const groupedTasks = tasks.reduce((acc, task) => {
    const category = getTaskCategory(task);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  const toggleShowCompleted = (category: string) => {
    setShowCompleted((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading daily tasks...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-[#3D5F42]" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Daily Tasks</h2>
            <p className="text-sm text-gray-600">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {flocks.length > 0 && (
          <div>
            <label htmlFor="flock-select" className="block text-sm font-medium text-gray-700 mb-1">
              Active Flock
            </label>
            <select
              id="flock-select"
              value={selectedFlock}
              onChange={(e) => setSelectedFlock(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
            >
              {flocks.map((flock) => (
                <option key={flock.id} value={flock.id}>
                  {flock.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {Object.entries(groupedTasks).map(([category, categoryTasks]) => {
        const pendingTasks = categoryTasks.filter((t) => t.status !== 'completed');
        const completedTasks = categoryTasks.filter((t) => t.status === 'completed');
        const showCompletedInCategory = showCompleted[category] || false;

        return (
          <div key={category} className="bg-white rounded-3xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{category}</h3>
            <div className="space-y-2">
              {pendingTasks.map((task) => {
                const status = getTaskTimeStatus(task);
                const check = currentFarm ? canUserCompleteTask(currentFarm.role || 'worker', task) : { allowed: false };
                const dataTask = isDataTask(task);

                return (
                  <button
                    key={task.id}
                    onClick={() => {
                      if (dataTask) {
                        handleDataTaskClick(task);
                      } else {
                        handleChecklistTaskComplete(task);
                      }
                    }}
                    disabled={!check.allowed}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                      !check.allowed
                        ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                        : status === 'overdue'
                        ? 'border-red-300 bg-red-50 hover:border-red-400 hover:shadow-md cursor-pointer'
                        : status === 'due_now'
                        ? 'border-orange-300 bg-orange-50 hover:border-orange-400 hover:shadow-md cursor-pointer'
                        : 'border-gray-200 hover:border-[#3D5F42] hover:shadow-md cursor-pointer'
                    }`}
                  >
                    <div className="flex-shrink-0 text-gray-400">{getIconForTask(task)}</div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900">{task.title}</h4>
                      {task.description && (
                        <p className="text-sm text-gray-600">{task.description}</p>
                      )}
                      {task.scheduled_time && (
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3 text-gray-500" />
                          <span className="text-xs text-gray-500">{formatTaskDueTime(task)}</span>
                        </div>
                      )}
                      {!check.allowed && check.reason && (
                        <p className="text-xs text-red-600 mt-1">{check.reason}</p>
                      )}
                      {dataTask && (
                        <span className="inline-block mt-1 text-xs font-medium text-[#3D5F42]">
                          Requires input
                        </span>
                      )}
                    </div>
                    {status === 'overdue' && (
                      <span className="text-xs font-medium text-red-600 px-2 py-1 bg-red-100 rounded-lg">
                        Overdue
                      </span>
                    )}
                    {status === 'due_now' && (
                      <span className="text-xs font-medium text-orange-600 px-2 py-1 bg-orange-100 rounded-lg">
                        Due Now
                      </span>
                    )}
                  </button>
                );
              })}

              {completedTasks.length > 0 && (
                <>
                  <button
                    onClick={() => toggleShowCompleted(category)}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {showCompletedInCategory ? (
                      <>
                        <EyeOff className="w-4 h-4" />
                        Hide {completedTasks.length} completed task{completedTasks.length > 1 ? 's' : ''}
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        Show {completedTasks.length} completed task{completedTasks.length > 1 ? 's' : ''}
                      </>
                    )}
                  </button>

                  {showCompletedInCategory && (
                    <div className="space-y-2 opacity-60">
                      {completedTasks.map((task) => (
                        <div
                          key={task.id}
                          className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-green-200 bg-green-50"
                        >
                          <div className="flex-shrink-0 text-green-600">
                            <CheckCircle className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-green-900">{task.title}</h4>
                            {task.description && (
                              <p className="text-sm text-green-700">{task.description}</p>
                            )}
                            {task.completed_at && (
                              <p className="text-xs text-green-600 mt-1">
                                Completed at{' '}
                                {new Date(task.completed_at).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true,
                                })}
                              </p>
                            )}
                          </div>
                          <span className="text-xs font-medium text-green-600">Completed</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {activeModal === 'feed_usage' && selectedFlock && (
        <RecordFeedUsageModal
          flockId={selectedFlock}
          onClose={() => {
            setActiveModal(null);
            setSelectedTask(null);
          }}
          onSuccess={handleDataTaskComplete}
        />
      )}

      {activeModal === 'egg_collection' && selectedFlock && (
        <LogCollectionModal
          flockId={selectedFlock}
          onClose={() => {
            setActiveModal(null);
            setSelectedTask(null);
          }}
          onSuccess={handleDataTaskComplete}
          createTaskRecord={false}
        />
      )}

      {activeModal === 'mortality' && selectedFlock && (
        <LogMortalityModal
          flock={flocks.find((f) => f.id === selectedFlock) || null}
          onClose={() => {
            setActiveModal(null);
            setSelectedTask(null);
          }}
          onLogged={handleDataTaskComplete}
        />
      )}
    </div>
  );
}
