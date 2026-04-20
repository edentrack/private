import { useState, useEffect } from 'react';
import { CheckCircle, Circle, Package, Egg, AlertTriangle, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { TaskTemplate, Flock } from '../../types/database';
import { RecordFeedUsageModal } from './RecordFeedUsageModal';
import { LogCollectionModal } from '../eggs/LogCollectionModal';
import { LogMortalityModal } from '../mortality/LogMortalityModal';

interface DailyTaskTemplatesProps {
  onTaskCompleted: () => void;
}

interface TaskCompletion {
  task_template_id: string;
  completed_at: string;
}

export function DailyTaskTemplates({ onTaskCompleted }: DailyTaskTemplatesProps) {
  const { currentFarm } = useAuth();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [completions, setCompletions] = useState<Map<string, TaskCompletion>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedFlock, setSelectedFlock] = useState<string>('');
  const [flocks, setFlocks] = useState<Flock[]>([]);

  useEffect(() => {
    if (currentFarm) {
      loadData();
    }
  }, [currentFarm]);

  const loadData = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const { data: templatesData } = await supabase
        .from('task_templates')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (templatesData) {
        setTemplates(templatesData);
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

      loadTodayCompletions();
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTodayCompletions = async () => {
    if (!currentFarm?.id) return;

    const today = new Date().toISOString().split('T')[0];

    const { data } = await supabase
      .from('tasks')
      .select('id, title, completed_at')
      .eq('farm_id', currentFarm.id)
      .gte('completed_at', `${today}T00:00:00`)
      .lte('completed_at', `${today}T23:59:59`)
      .eq('status', 'completed');

    if (data) {
      const completionsMap = new Map<string, TaskCompletion>();
      data.forEach(task => {
        const matchingTemplate = templates.find(t => t.title === task.title);
        if (matchingTemplate) {
          completionsMap.set(matchingTemplate.id, {
            task_template_id: matchingTemplate.id,
            completed_at: task.completed_at || '',
          });
        }
      });
      setCompletions(completionsMap);
    }
  };

  const handleChecklistTaskComplete = async (template: TaskTemplate) => {
    if (!currentFarm?.id || !selectedFlock) return;

    try {
      const now = new Date();
      const { error } = await supabase.from('tasks').insert({
        user_id: currentFarm.id,
        farm_id: currentFarm.id,
        flock_id: selectedFlock,
        title: template.title,
        description: template.description,
        due_date: now.toISOString().split('T')[0],
        due_at: now.toISOString(),
        status: 'completed',
        completed: true,
        completed_at: now.toISOString(),
        created_by: profile.id,
      });

      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: currentFarm.id,
        action: `Completed daily task: ${template.title}`,
        entity_type: 'task',
        entity_id: template.id,
        details: { template_id: template.id, category: template.category },
      });

      await loadTodayCompletions();
      onTaskCompleted();
    } catch (error) {
      console.error('Error completing checklist task:', error);
    }
  };

  const handleDataTaskClick = (template: TaskTemplate) => {
    if (template.title === 'Record feed bags used today') {
      setActiveModal('feed_usage');
    } else if (template.title === "Log today's egg collection") {
      setActiveModal('egg_collection');
    } else if (template.title === 'Record mortality for today') {
      setActiveModal('mortality');
    }
  };

  const handleDataTaskComplete = async () => {
    setActiveModal(null);
    await loadTodayCompletions();
    onTaskCompleted();
  };

  const getIconForTemplate = (template: TaskTemplate) => {
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

  const groupedTemplates = templates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, TaskTemplate[]>);

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

      {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
        <div key={category} className="bg-white rounded-3xl p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">{category}</h3>
          <div className="space-y-2">
            {categoryTemplates.map((template) => {
              const isCompleted = completions.has(template.id);
              const isDataTask = template.task_type === 'data';

              return (
                <button
                  key={template.id}
                  onClick={() => {
                    if (isCompleted) return;
                    if (isDataTask) {
                      handleDataTaskClick(template);
                    } else {
                      handleChecklistTaskComplete(template);
                    }
                  }}
                  disabled={isCompleted}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                    isCompleted
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 hover:border-[#3D5F42] hover:shadow-md cursor-pointer'
                  }`}
                >
                  <div className={`flex-shrink-0 ${isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                    {isCompleted ? (
                      <CheckCircle className="w-6 h-6" />
                    ) : (
                      getIconForTemplate(template)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-semibold ${isCompleted ? 'text-green-900' : 'text-gray-900'}`}>
                      {template.title}
                    </h4>
                    <p className={`text-sm ${isCompleted ? 'text-green-700' : 'text-gray-600'}`}>
                      {template.description}
                    </p>
                    {isDataTask && !isCompleted && (
                      <span className="inline-block mt-1 text-xs font-medium text-[#3D5F42]">
                        Requires input
                      </span>
                    )}
                  </div>
                  {isCompleted && (
                    <span className="text-xs font-medium text-green-600">
                      Completed
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {activeModal === 'feed_usage' && selectedFlock && (
        <RecordFeedUsageModal
          flockId={selectedFlock}
          onClose={() => setActiveModal(null)}
          onSuccess={handleDataTaskComplete}
        />
      )}

      {activeModal === 'egg_collection' && selectedFlock && (
        <LogCollectionModal
          flockId={selectedFlock}
          onClose={() => setActiveModal(null)}
          onSuccess={handleDataTaskComplete}
          createTaskRecord={true}
        />
      )}

      {activeModal === 'mortality' && selectedFlock && (
        <LogMortalityModal
          flockId={selectedFlock}
          onClose={() => setActiveModal(null)}
          onSuccess={handleDataTaskComplete}
          createTaskRecord={true}
        />
      )}
    </div>
  );
}
