import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock } from '../../types/database';
import { TaskTemplate } from '../../types/database';
import { useTranslation } from 'react-i18next';
import { farmLocalToUtcIso, getFarmTimeZone } from '../../utils/farmTime';

interface TeamMember {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
}

interface AddTaskModalProps {
  flockId?: string;
  initialDueDate?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddTaskModal({ flockId, initialDueDate, onClose, onSuccess }: AddTaskModalProps) {
  const { t } = useTranslation();
  const { user, currentFarm } = useAuth();
  const farmTz = getFarmTimeZone(currentFarm);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedFlockId, setSelectedFlockId] = useState(flockId || '');
  const [assignedTo, setAssignedTo] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(initialDueDate || new Date().toISOString().split('T')[0]);
  const [dueTime, setDueTime] = useState('09:00');
  const [showInDaily, setShowInDaily] = useState(true);
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [requiresInputOverride, setRequiresInputOverride] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedTemplate = taskTemplates.find((t) => t.id === selectedTemplateId) || null;

  useEffect(() => {
    if (currentFarm) {
      loadFlocks();
      loadTeamMembers();
      loadTemplates();
    }
  }, [currentFarm]);

  useEffect(() => {
    if (!selectedTemplate) return;
    // When choosing a template, default the title/description and the entry/click behavior.
    setTitle((prev) => (prev.trim().length > 0 ? prev : selectedTemplate.title));
    setDescription((prev) => (prev.trim().length > 0 ? prev : selectedTemplate.description || ''));
    setRequiresInputOverride(Boolean(selectedTemplate.requires_input));
  }, [selectedTemplate]);

  const loadFlocks = async () => {
    if (!currentFarm?.id) return;

    const { data } = await supabase
      .from('flocks')
      .select('*')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'active')
      .order('name');

    if (data) {
      setFlocks(data);
    }
  };

  const loadTeamMembers = async () => {
    if (!currentFarm?.id) return;

    const { data } = await supabase
      .from('farm_members')
      .select('id, user_id, role, profiles(full_name)')
      .eq('farm_id', currentFarm.id)
      .eq('is_active', true);

    if (data) {
      const members: TeamMember[] = data.map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        full_name: m.profiles?.full_name || 'Unknown',
        role: m.role,
      }));
      setTeamMembers(members);
    }
  };

  const loadTemplates = async () => {
    if (!currentFarm?.id) return;
    const { data, error } = await supabase
      .from('task_templates')
      .select('*')
      .eq('farm_id', currentFarm.id)
      .eq('is_active', true)
      .eq('is_enabled', true)
      .order('display_order', { ascending: true });

    if (error || !Array.isArray(data)) {
      setTaskTemplates([]);
      return;
    }

    // Exclude egg templates; eggs have their own interval flow.
    setTaskTemplates((data as TaskTemplate[]).filter((tpl) => tpl.icon !== 'egg'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentFarm?.id) return;

    if (!title.trim()) {
      setError('Please enter a task title');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // tasks.scheduled_for is DATE in your schema; scheduled_time is TIME.
      const scheduledForDate = dueDate;
      const scheduledTsISO = showInDaily ? farmLocalToUtcIso({ dateISO: dueDate, timeHHMM: dueTime, farmTz }) : null;
      const completionWindowMinutes = Number(selectedTemplate?.completion_window_minutes ?? 120);
      const windowStart = scheduledTsISO;
      const windowEnd = scheduledTsISO
        ? new Date(new Date(scheduledTsISO).getTime() + completionWindowMinutes * 60 * 1000).toISOString()
        : null;

      const { data: taskData, error: insertError } = await supabase
        .from('tasks')
        .insert({
          farm_id: currentFarm.id,
          flock_id: selectedFlockId || null,
          template_id: selectedTemplateId || null,
          title_override: title,
          notes: description,
          scheduled_for: scheduledForDate,
          window_start: windowStart,
          window_end: windowEnd,
          scheduled_time: showInDaily ? dueTime : null,
          due_date: dueDate,
          assigned_to: assignedTo || null,
          status: 'pending',
          requires_input: Boolean(requiresInputOverride),
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        farm_id: currentFarm.id,
        action: `Created task: ${title}`,
        entity_type: 'task',
        entity_id: taskData.id,
        details: {
          title,
          scheduled_for: scheduledForDate,
          flock_id: selectedFlockId || null,
          template_id: selectedTemplateId || null,
        },
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{t('add_task')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-2">
                Task Date
              </label>
              <input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
                required
              />
            </div>

            <div>
              <label htmlFor="dueTime" className="block text-sm font-medium text-gray-700 mb-2">
                Task Time
              </label>
              <input
                id="dueTime"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="taskTemplate" className="block text-sm font-medium text-gray-700 mb-2">
              Task Template
            </label>
            <select
              id="taskTemplate"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
            >
              <option value="">Custom (no template)</option>
              {taskTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.icon ? `${tpl.icon} ` : ''}
                  {tpl.title}
                </option>
              ))}
            </select>

            {selectedTemplate ? (
              <div className="mt-2 text-xs text-gray-600">
                <span className="font-medium">{selectedTemplate.requires_input ? 'Entry (needs input)' : 'Click (no extra input)'}</span>
                <span className="ml-2">• Completion window: {selectedTemplate.completion_window_minutes} min</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800">Entry vs Click</div>
              <div className="text-xs text-gray-600">Entry tasks open the detailed completion modal.</div>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresInputOverride}
                onChange={(e) => setRequiresInputOverride(e.target.checked)}
                className="w-5 h-5 text-[#3D5F42] border-gray-300 rounded focus:ring-[#3D5F42]"
              />
              <span className="text-xs text-gray-700">{requiresInputOverride ? 'Entry' : 'Click'}</span>
            </label>
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Task Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
              placeholder="e.g., Clean chicken coop"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all resize-none text-sm"
              placeholder="Task details..."
            />
          </div>

          <div>
            <label htmlFor="flock" className="block text-sm font-medium text-gray-700 mb-2">
              Flock (Optional)
            </label>
            <select
              id="flock"
              value={selectedFlockId}
              onChange={(e) => setSelectedFlockId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
            >
              <option value="">None - General task</option>
              {flocks.map((flock) => (
                <option key={flock.id} value={flock.id}>
                  {flock.name} ({flock.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="assignedTo" className="block text-sm font-medium text-gray-700 mb-2">
              Assigned To (Optional)
            </label>
            <select
              id="assignedTo"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
            >
              <option value="">Unassigned</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.user_id}>
                  {member.full_name} ({member.role})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <input
              id="showInDaily"
              type="checkbox"
              checked={showInDaily}
              onChange={(e) => setShowInDaily(e.target.checked)}
              className="w-5 h-5 text-[#3D5F42] border-gray-300 rounded focus:ring-[#3D5F42] cursor-pointer"
            />
            <label htmlFor="showInDaily" className="text-sm font-medium text-gray-700 cursor-pointer">
              {t('tasks.show_in_daily')}
            </label>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4632] transition-colors font-medium disabled:opacity-50"
            >
              {loading ? t('tasks.creating') : t('tasks.create_task')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
