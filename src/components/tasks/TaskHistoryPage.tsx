import { useState, useEffect, useCallback } from 'react';
import { Search, CheckCircle2, Clock, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Task } from '../../types/database';

interface TaskWithDetails extends Task {
  task_templates?: {
    title: string;
    category: string;
  };
  flocks?: {
    name: string;
  };
  profiles?: {
    full_name: string;
  };
}

type FilterPeriod = 'last_week' | 'last_month' | 'last_3_months' | 'last_6_months' | 'last_year' | 'all_time';

export function TaskHistoryPage() {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('last_month');

  const loadTasks = useCallback(async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          task_templates(title, category),
          flocks(name),
          profiles:completed_by(full_name)
        `)
        .eq('farm_id', currentFarm.id)
        .eq('status', 'completed')
        .eq('is_archived', false);

      // Apply date filter
      const now = new Date();
      let startDate: Date;
      
      switch (filterPeriod) {
        case 'last_week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'last_month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'last_3_months':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'last_6_months':
          startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
          break;
        case 'last_year':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'all_time':
        default:
          startDate = new Date(0); // Start of epoch
          break;
      }

      if (filterPeriod !== 'all_time') {
        query = query.gte('completed_at', startDate.toISOString());
      }

      const { data, error } = await query.order('completed_at', { ascending: false });

      if (error) throw error;

      // Apply search filter
      let filteredData = (data || []) as TaskWithDetails[];
      if (searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase();
        filteredData = filteredData.filter(task => {
          const taskTitle = task.title_override || task.task_templates?.title || '';
          const taskNotes = task.notes || '';
          const taskCategory = task.task_templates?.category || '';
          const flockName = task.flocks?.name || '';
          
          return (
            taskTitle.toLowerCase().includes(searchLower) ||
            taskNotes.toLowerCase().includes(searchLower) ||
            taskCategory.toLowerCase().includes(searchLower) ||
            flockName.toLowerCase().includes(searchLower)
          );
        });
      }

      setTasks(filteredData);
    } catch (error) {
      console.error('Error loading task history:', error);
    } finally {
      setLoading(false);
    }
  }, [currentFarm?.id, filterPeriod, searchQuery]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTaskTitle = (task: TaskWithDetails) => {
    return task.title_override || task.task_templates?.title || 'Task';
  };

  const getTaskDetail = (task: TaskWithDetails) => {
    if (task.data_payload) {
      // Try to extract meaningful detail from data_payload
      if (typeof task.data_payload === 'object') {
        const payload = task.data_payload as Record<string, unknown>;
        if (payload.quantity && payload.unit) {
          return `${payload.quantity} ${payload.unit}`;
        }
        if (payload.notes) {
          return String(payload.notes);
        }
      }
    }
    if (task.completion_notes) {
      return task.completion_notes;
    }
    if (task.notes) {
      return task.notes;
    }
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('tasks.history.title') || 'Task History'}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('tasks.history.description') || 'View and manage completed tasks'}
        </p>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('tasks.history.search_placeholder') || 'Search tasks...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neon-500 focus:border-transparent text-gray-900 bg-white"
          />
        </div>
        <div className="relative">
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value as FilterPeriod)}
            className="appearance-none pl-4 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neon-500 focus:border-transparent bg-white cursor-pointer text-sm text-gray-900 min-w-[140px]"
          >
            <option value="last_week">{t('tasks.filter.last_week') || 'Last Week'}</option>
            <option value="last_month">{t('tasks.filter.last_month') || 'Last Month'}</option>
            <option value="last_3_months">{t('tasks.filter.last_3_months') || 'Last 3 Months'}</option>
            <option value="last_6_months">{t('tasks.filter.last_6_months') || 'Last 6 Months'}</option>
            <option value="last_year">{t('tasks.filter.last_year') || 'Last Year'}</option>
            <option value="all_time">{t('tasks.filter.all_time') || 'All Time'}</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">{t('common.loading') || 'Loading...'}</div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 text-sm">
            {searchQuery
              ? t('tasks.history.no_results') || 'No tasks found matching your search.'
              : t('tasks.history.no_completed') || 'No completed tasks found in this period.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const taskDetail = getTaskDetail(task);
            return (
              <div
                key={task.id}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">{getTaskTitle(task)}</h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span>{formatDate(task.completed_at)}</span>
                      </div>
                      {taskDetail && (
                        <p className="text-sm text-gray-500 mt-1">{taskDetail}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {!loading && tasks.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <div className="bg-gray-100 rounded-full px-4 py-2">
            <p className="text-sm text-gray-900">
              {t('tasks.history.showing', {
                count: tasks.length,
                total: tasks.length,
              }) || `Showing ${tasks.length} of ${tasks.length} completed tasks`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
