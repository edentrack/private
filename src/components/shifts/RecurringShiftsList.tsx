import { useState, useEffect } from 'react';
import { Edit2, Trash2, Loader2, Play, Pause, RefreshCw, AlertCircle, Clock, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';

interface RecurringTemplate {
  id: string;
  worker_id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  days_of_week: number[];
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  worker: {
    full_name: string;
    email: string;
  };
}

interface RecurringShiftsListProps {
  farmId: string;
  onEdit: (template: RecurringTemplate) => void;
  refreshTrigger: number;
}

const DAYS_OF_WEEK_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function RecurringShiftsList({ farmId, onEdit, refreshTrigger }: RecurringShiftsListProps) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, [farmId, refreshTrigger]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('shift_templates')
        .select(`
          id,
          worker_id,
          title,
          start_time,
          end_time,
          frequency,
          interval,
          days_of_week,
          day_of_month,
          start_date,
          end_date,
          is_active,
          worker:worker_id (
            full_name,
            email
          )
        `)
        .eq('farm_id', farmId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const formattedTemplates = (data || []).map(template => ({
        ...template,
        worker: Array.isArray(template.worker) ? template.worker[0] : template.worker
      }));

      setTemplates(formattedTemplates);
    } catch (err: any) {
      console.error('Error loading recurring templates:', err);
      setError(err.message || 'Failed to load recurring schedules');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (template: RecurringTemplate) => {
    try {
      setActionInProgress(template.id);

      const { error: updateError } = await supabase
        .from('shift_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id);

      if (updateError) throw updateError;

      await loadTemplates();
    } catch (err: any) {
      console.error('Error toggling template:', err);
      alert(err.message || 'Failed to toggle template');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDelete = async (template: RecurringTemplate) => {
    if (!confirm(`Delete recurring shift for ${template.worker.full_name}? This will not delete already created shifts.`)) {
      return;
    }

    try {
      setActionInProgress(template.id);

      const { error: deleteError } = await supabase
        .from('shift_templates')
        .delete()
        .eq('id', template.id);

      if (deleteError) throw deleteError;

      await loadTemplates();
    } catch (err: any) {
      console.error('Error deleting template:', err);
      alert(err.message || 'Failed to delete template');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRegenerate = async (template: RecurringTemplate) => {
    try {
      setActionInProgress(template.id);

      const today = new Date();
      const until = new Date(today);
      until.setDate(until.getDate() + 60);
      const untilStr = until.toISOString().split('T')[0];

      const { data, error: rpcError } = await supabase.rpc('generate_shifts_for_template', {
        p_template_id: template.id,
        p_until: untilStr
      });

      if (rpcError) throw rpcError;

      alert(`Generated ${data || 0} new shifts for the next 60 days`);
    } catch (err: any) {
      console.error('Error regenerating shifts:', err);
      alert(err.message || 'Failed to regenerate shifts');
    } finally {
      setActionInProgress(null);
    }
  };

  const formatPattern = (template: RecurringTemplate): string => {
    if (template.frequency === 'daily') {
      return `Every ${template.interval > 1 ? template.interval + ' ' : ''}day${template.interval > 1 ? 's' : ''}`;
    } else if (template.frequency === 'weekly') {
      const dayNames = template.days_of_week
        .sort()
        .map(d => DAYS_OF_WEEK_ABBR[d])
        .join(', ');
      return `Every ${template.interval > 1 ? template.interval + ' ' : ''}week${template.interval > 1 ? 's' : ''} on ${dayNames}`;
    } else {
      return `Day ${template.day_of_month} of every ${template.interval > 1 ? template.interval + ' ' : ''}month${template.interval > 1 ? 's' : ''}`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 bg-white/50 rounded-2xl">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-neon-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">Error loading recurring schedules</p>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
        <button
          onClick={loadTemplates}
          className="px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-medium hover:bg-red-200 transition-colors"
        >
          {t('common.retry') || 'Retry'}
        </button>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="bg-white/50 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
          <Calendar className="w-8 h-8 text-neon-600" />
        </div>
        <p className="text-gray-900 font-semibold">{t('shifts.no_recurring_schedules') || 'No recurring schedules yet'}</p>
        <p className="text-sm text-gray-500 mt-1">{t('shifts.create_to_auto_generate') || 'Create one to automatically generate shifts'}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">{t('shifts.assigned_worker')}</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">{t('shifts.title') || 'Title'}</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">{t('shifts.start_time')}</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">{t('shifts.pattern') || 'Pattern'}</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">{t('shifts.dates') || 'Dates'}</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">{t('shifts.status')}</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {templates.map((template) => (
              <tr key={template.id} className="hover:bg-neon-50/50 transition-colors">
                <td className="py-3 px-4">
                  <div>
                    <div className="font-medium text-gray-900">{template.worker.full_name}</div>
                    <div className="text-xs text-gray-500">{template.worker.email}</div>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className="text-sm text-gray-900">
                    {template.title || <span className="italic text-gray-400">{t('shifts.no_title') || 'No title'}</span>}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1 text-sm text-gray-900">
                    <Clock className="w-3 h-3 text-gray-400" />
                    {template.start_time.slice(0, 5)} - {template.end_time.slice(0, 5)}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className="text-sm text-gray-700">{formatPattern(template)}</span>
                </td>
                <td className="py-3 px-4">
                  <div className="text-xs text-gray-600">
                    <div>{t('shifts.starts_on')}: {new Date(template.start_date).toLocaleDateString()}</div>
                    {template.end_date && (
                      <div>{t('shifts.ends_on')}: {new Date(template.end_date).toLocaleDateString()}</div>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4">
                  {template.is_active ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                      <div className="w-1.5 h-1.5 bg-green-600 rounded-full" />
                      {t('team.active')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                      {t('shifts.paused') || 'Paused'}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => handleRegenerate(template)}
                      disabled={actionInProgress === template.id}
                      className="text-neon-600 hover:text-neon-700 p-1.5 rounded-lg hover:bg-neon-50 transition-colors disabled:opacity-50"
                      title="Regenerate next 60 days"
                    >
                      {actionInProgress === template.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleToggleActive(template)}
                      disabled={actionInProgress === template.id}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                        template.is_active
                          ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                          : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                      }`}
                      title={template.is_active ? 'Pause' : 'Resume'}
                    >
                      {actionInProgress === template.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : template.is_active ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => onEdit(template)}
                      disabled={actionInProgress === template.id}
                      className="text-gray-600 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(template)}
                      disabled={actionInProgress === template.id}
                      className="text-red-600 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
