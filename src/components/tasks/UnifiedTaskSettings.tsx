import { useState, useEffect, useMemo, useRef } from 'react';
import { Settings, X, Pencil, Trash2, RefreshCw, Copy, Eye, EyeOff, HelpCircle, Clock, Save, AlertCircle, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { TaskTemplate, TaskScope, TaskTypeCategory } from '../../types/database';
import { ensureTasksGeneratedForDate, getFlockTypesForFarm } from '../../utils/unifiedTaskSystem';
import { formatFarmTimeForViewerWithFormat, getFarmTimeZone, getFarmTodayISO, getUiTimeFormat, setUiTimeFormat } from '../../utils/farmTime';

interface UnifiedTaskSettingsProps {
  onClose: () => void;
}

const CATEGORIES = ['Feed', 'Health', 'Cleaning', 'Eggs', 'Weighing', 'Other'];
const NEW_TEMPLATE_ID = '__new_template__';
const FREQUENCIES = [
  { value: 'once_per_day', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'multiple_per_day', label: 'Multiple/Day' },
  { value: 'ad_hoc', label: 'As Needed' },
];

export function UnifiedTaskSettings({ onClose }: UnifiedTaskSettingsProps) {
  const { currentFarm } = useAuth();
  const farmTz = getFarmTimeZone(currentFarm);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'general' | 'broiler' | 'layer'>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [farmFlockTypes, setFarmFlockTypes] = useState<string[]>([]);

  useEffect(() => {
    if (currentFarm?.id) {
      loadTemplates();
      loadFlockTypes();
    }
  }, [currentFarm?.id]);

  const loadFlockTypes = async () => {
    if (!currentFarm?.id) return;
    const types = await getFlockTypesForFarm(supabase, currentFarm.id);
    setFarmFlockTypes(types);
  };

  const loadTemplates = async () => {
    if (!currentFarm?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_templates')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeSystemTemplates = async () => {
    if (!currentFarm?.id) return;
    try {
      const { error } = await supabase.rpc('create_system_task_templates', {
        p_farm_id: currentFarm.id
      });
      if (error) throw error;

      // Per requirement: default templates should be OFF until user enables them.
      await supabase
        .from('task_templates')
        .update({ is_active: false, is_enabled: false })
        .eq('farm_id', currentFarm.id);

      await loadTemplates();
    } catch (error) {
      console.error('Error initializing templates:', error);
    }
  };

  const disableAllTemplates = async () => {
    if (!currentFarm?.id) return;
    try {
      const { error } = await supabase
        .from('task_templates')
        .update({ is_active: false, is_enabled: false })
        .eq('farm_id', currentFarm.id);
      if (error) throw error;
      await loadTemplates();
    } catch (error) {
      console.error('Error disabling all templates:', error);
    }
  };

  const handleToggleEnabled = async (template: TaskTemplate) => {
    try {
      const nextEnabled = !template.is_active;
      const { error } = await supabase
        .from('task_templates')
        .update({ is_active: nextEnabled, is_enabled: nextEnabled })
        .eq('id', template.id);
      if (error) throw error;
      await loadTemplates();

      // When enabling a template, generate today's tasks immediately.
      if (nextEnabled && currentFarm?.id) {
        const today = getFarmTodayISO(farmTz);
        await ensureTasksGeneratedForDate(supabase as any, currentFarm.id, today, farmFlockTypes, farmTz);
      }
    } catch (error) {
      console.error('Error toggling template:', error);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Delete this task template? This cannot be undone.')) return;
    try {
      const { error } = await supabase
        .from('task_templates')
        .delete()
        .eq('id', templateId);
      if (error) throw error;
      await loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const handleDuplicate = async (template: TaskTemplate) => {
    if (!currentFarm?.id) return;
    try {
      const newTemplate = {
        farm_id: currentFarm.id,
        title: `${template.title} (Copy)`,
        description: template.description,
        task_type: template.task_type,
        category: template.category,
        requires_input: template.requires_input,
        input_fields: template.input_fields,
        is_active: false,
        is_enabled: false,
        display_order: template.display_order + 1,
        default_frequency: template.default_frequency,
        preferred_time_of_day: template.preferred_time_of_day,
        completion_window_minutes: template.completion_window_minutes,
        scope: template.scope,
        type_category: template.type_category,
        is_system_template: false,
      };
      const { error } = await supabase.from('task_templates').insert(newTemplate);
      if (error) throw error;
      await loadTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
    }
  };

  const handleAddTemplate = async () => {
    if (!currentFarm?.id) return;
    const maxOrder = templates.reduce((m, t) => Math.max(m, Number(t.display_order || 0)), 0);
    const draftTemplate = {
      id: NEW_TEMPLATE_ID,
      farm_id: currentFarm.id,
      title: 'New Task',
      description: '',
      category: 'Other',
      task_type: 'checklist',
      requires_input: false,
      input_fields: null,
      updates_inventory: false,
      inventory_type: null,
      inventory_item_id: null,
      inventory_effect: 'none',
      inventory_unit: null,
      // New template stays draft until user explicitly clicks Save Changes.
      is_active: true,
      is_enabled: true,
      display_order: maxOrder + 1,
      frequency_mode: 'once_per_day' as any,
      default_frequency: 'once_per_day' as any,
      times_per_day: null,
      scheduled_times: null,
      is_time_bound: true,
      window_before_minutes: 60,
      window_after_minutes: 60,
      completion_window_minutes: 0,
      preferred_time_of_day: '09:00',
      days_of_week: null,
      one_time_date: null,
      allowed_roles_to_complete: ['owner', 'manager', 'worker'] as any,
      scope: 'general',
      type_category: 'daily',
      is_system_template: false,
      flock_type_filter: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as TaskTemplate;
    setEditingTemplate(draftTemplate);
  };

  const handleSaveTemplate = async (template: TaskTemplate) => {
    try {
      if (template.id === NEW_TEMPLATE_ID) {
        const now = getFarmTodayISO(farmTz);
        const insertPayload: Partial<TaskTemplate> = {
          farm_id: currentFarm!.id,
          title: template.title,
          description: template.description || '',
          category: template.category || 'Other',
          task_type: template.task_type || 'checklist',
          requires_input: Boolean(template.requires_input),
          input_fields: template.input_fields ?? null,
          updates_inventory: (template as any).updates_inventory ?? false,
          inventory_type: template.inventory_type ?? null,
          inventory_item_id: template.inventory_item_id ?? null,
          inventory_effect: template.inventory_effect ?? 'none',
          inventory_unit: template.inventory_unit ?? null,
          is_active: Boolean((template as any).is_active),
          is_enabled: Boolean((template as any).is_enabled),
          display_order: Number(template.display_order || 0),
          frequency_mode: template.frequency_mode,
          default_frequency: template.default_frequency,
          times_per_day: template.times_per_day ?? null,
          scheduled_times: template.scheduled_times ?? null,
          is_time_bound: template.is_time_bound,
          window_before_minutes: template.window_before_minutes ?? 60,
          window_after_minutes: template.window_after_minutes ?? 60,
          completion_window_minutes: (template.completion_window_minutes ?? 0) as any,
          preferred_time_of_day: template.preferred_time_of_day || '09:00',
          days_of_week: (template as any).days_of_week ?? null,
          one_time_date: (template as any).one_time_date ?? null,
          allowed_roles_to_complete: (template as any).allowed_roles_to_complete ?? ['owner', 'manager', 'worker'],
          scope: template.scope || 'general',
          type_category: template.type_category || 'daily',
          is_system_template: false,
          flock_type_filter: (template as any).flock_type_filter ?? null,
        };
        const { error } = await supabase.from('task_templates').insert(insertPayload as any);
        if (error) throw error;

        if (currentFarm?.id && (template as any).is_active) {
          await ensureTasksGeneratedForDate(supabase as any, currentFarm.id, now, farmFlockTypes, farmTz);
        }
      } else {
        const { error } = await supabase
          .from('task_templates')
          .update({
            title: template.title,
            description: template.description,
            category: template.category,
            default_frequency: template.default_frequency,
            preferred_time_of_day: template.preferred_time_of_day,
            // DB constraint: completion_window_minutes is NOT NULL in some schemas.
            // Use 0 to represent "no window / all day".
            completion_window_minutes: (template.completion_window_minutes ?? 0) as any,
            // Used as the default "Sync to inventory" value for egg interval entries.
            // (Workers can still override per entry on the Eggs page.)
            updates_inventory: (template as any).updates_inventory ?? false,
            scope: template.scope,
            type_category: template.type_category,
            requires_input: template.requires_input,
            frequency_mode: template.frequency_mode,
            times_per_day: template.times_per_day,
            scheduled_times: template.scheduled_times,
            is_time_bound: template.is_time_bound,
            window_before_minutes: template.window_before_minutes,
            window_after_minutes: template.window_after_minutes,
            days_of_week: (template as any).days_of_week ?? null,
            one_time_date: (template as any).one_time_date ?? null,
          })
          .eq('id', template.id);
        if (error) throw error;
      }

      // If this template is enabled, ensure tasks exist for today (and reflect updated schedule).
      if (template.id !== NEW_TEMPLATE_ID && currentFarm?.id && (template as any).is_active) {
        const today = getFarmTodayISO(farmTz);
        await ensureTasksGeneratedForDate(supabase as any, currentFarm.id, today, farmFlockTypes, farmTz);
      }

      // Ensure the saved template is visible and list stays fresh.
      setShowHidden(true);
      setFilter('all');
      await loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  // Auto-save should be lightweight: no template list reload, and do not generate tasks.
  const handleAutoSaveTemplate = async (template: TaskTemplate) => {
    if (template.id === NEW_TEMPLATE_ID) return;
    try {
      const { error } = await supabase
        .from('task_templates')
        .update({
          title: template.title,
          description: template.description,
          category: template.category,
          default_frequency: template.default_frequency,
          preferred_time_of_day: template.preferred_time_of_day,
          completion_window_minutes: (template.completion_window_minutes ?? 0) as any,
          updates_inventory: (template as any).updates_inventory ?? false,
          scope: template.scope,
          type_category: template.type_category,
          requires_input: template.requires_input,
          frequency_mode: template.frequency_mode,
          times_per_day: template.times_per_day,
          scheduled_times: template.scheduled_times,
          is_time_bound: template.is_time_bound,
          window_before_minutes: template.window_before_minutes,
          window_after_minutes: template.window_after_minutes,
          days_of_week: (template as any).days_of_week ?? null,
          one_time_date: (template as any).one_time_date ?? null,
        })
        .eq('id', template.id);
      if (error) throw error;

      setTemplates((prev) => prev.map((t) => (t.id === template.id ? { ...t, ...template } : t)));
    } catch (error) {
      // Auto-save failures shouldn't break the editor UI.
      console.error('Error auto-saving template:', error);
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    const freq = FREQUENCIES.find(f => f.value === frequency);
    return freq?.label || frequency;
  };

  const getScopeLabel = (scope: TaskScope) => {
    switch (scope) {
      case 'broiler': return 'Broiler';
      case 'layer': return 'Layer';
      default: return 'General';
    }
  };

  const getScopeBadgeStyle = (scope: TaskScope) => {
    switch (scope) {
      case 'broiler': return 'bg-amber-50 text-amber-700';
      case 'layer': return 'bg-sky-50 text-sky-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getTypeBadgeStyle = (type: TaskTypeCategory) => {
    switch (type) {
      case 'recording': return 'bg-blue-50 text-blue-700';
      case 'one_time': return 'bg-teal-50 text-teal-700';
      default: return 'bg-green-50 text-green-700';
    }
  };

  const getTypeLabel = (type: TaskTypeCategory) => {
    switch (type) {
      case 'recording': return 'Recording';
      case 'one_time': return 'One-time';
      default: return 'Daily';
    }
  };

  const hasBroilers = farmFlockTypes.includes('Broiler');
  const hasLayers = farmFlockTypes.includes('Layer');

  const filteredTemplates = templates.filter(t => {
    if (filter !== 'all' && t.scope !== filter) return false;
    if (!showHidden && !t.is_active) return false;
    if (!showHidden) {
      if (t.scope === 'broiler' && !hasBroilers) return false;
      if (t.scope === 'layer' && !hasLayers) return false;
    }
    return true;
  });

  const systemTemplates = filteredTemplates.filter(t => t.is_system_template);
  const customTemplates = filteredTemplates.filter(t => !t.is_system_template);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#3D5F42]/10 rounded-xl">
              <Settings className="w-5 h-5 text-[#3D5F42]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Task Settings</h2>
              <p className="text-sm text-gray-500">Manage task templates</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleAddTemplate}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'general', 'broiler', 'layer'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-[#3D5F42] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowHidden(!showHidden)}
              className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-lg transition-colors ${
                showHidden ? 'bg-gray-200 text-gray-700' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {showHidden ? 'Showing all' : 'Show hidden'}
            </button>
            <button
              onClick={initializeSystemTemplates}
              className="flex items-center gap-1.5 px-3 py-1 text-sm text-[#3D5F42] hover:bg-[#3D5F42]/10 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Reset defaults
            </button>
            <button
              onClick={disableAllTemplates}
              className="flex items-center gap-1.5 px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              title="Turn off all templates until you enable them"
            >
              <X className="w-4 h-4" />
              Disable all
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-[#3D5F42] rounded-full animate-spin" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <Settings className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">No templates found</h3>
              <p className="text-sm text-gray-500 mb-4">Click "Reset defaults" to create system templates</p>
            </div>
          ) : (
            <div className="space-y-4">
              {systemTemplates.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    System Templates ({systemTemplates.length})
                  </h3>
                  <div className="space-y-1">
                    {systemTemplates.map((template) => (
                      <TemplateRow
                        key={template.id}
                        template={template}
                        onToggle={() => handleToggleEnabled(template)}
                        onEdit={() => setEditingTemplate(template)}
                        onDuplicate={() => handleDuplicate(template)}
                        onDelete={() => handleDelete(template.id)}
                        getScopeBadgeStyle={getScopeBadgeStyle}
                        getScopeLabel={getScopeLabel}
                        getTypeBadgeStyle={getTypeBadgeStyle}
                        getTypeLabel={getTypeLabel}
                        getFrequencyLabel={getFrequencyLabel}
                      />
                    ))}
                  </div>
                </div>
              )}

              {customTemplates.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Custom Templates ({customTemplates.length})
                  </h3>
                  <div className="space-y-1">
                    {customTemplates.map((template) => (
                      <TemplateRow
                        key={template.id}
                        template={template}
                        onToggle={() => handleToggleEnabled(template)}
                        onEdit={() => setEditingTemplate(template)}
                        onDuplicate={() => handleDuplicate(template)}
                        onDelete={() => handleDelete(template.id)}
                        getScopeBadgeStyle={getScopeBadgeStyle}
                        getScopeLabel={getScopeLabel}
                        getTypeBadgeStyle={getTypeBadgeStyle}
                        getTypeLabel={getTypeLabel}
                        getFrequencyLabel={getFrequencyLabel}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>

      {editingTemplate && (
        <EditTemplateModal
          template={editingTemplate}
          farmTz={farmTz}
          onClose={() => setEditingTemplate(null)}
          onSave={handleSaveTemplate}
          onAutoSave={handleAutoSaveTemplate}
        />
      )}
    </div>
  );
}

interface TemplateRowProps {
  template: TaskTemplate;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  getScopeBadgeStyle: (s: TaskScope) => string;
  getScopeLabel: (s: TaskScope) => string;
  getTypeBadgeStyle: (t: TaskTypeCategory) => string;
  getTypeLabel: (t: TaskTypeCategory) => string;
  getFrequencyLabel: (f: string) => string;
}

function TemplateRow({
  template,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  getScopeBadgeStyle,
  getScopeLabel,
  getTypeBadgeStyle,
  getTypeLabel,
  getFrequencyLabel,
}: TemplateRowProps) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
      template.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'
    }`}>
      <button
        onClick={onToggle}
        className={`relative w-8 h-5 rounded-full transition-colors flex-shrink-0 ${
          template.is_active ? 'bg-[#3D5F42]' : 'bg-gray-300'
        }`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          template.is_active ? 'left-3.5' : 'left-0.5'
        }`} />
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className={`font-medium truncate ${template.is_active ? 'text-gray-900' : 'text-gray-500'}`}>
          {template.title}
        </span>
        <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded ${getTypeBadgeStyle(template.type_category)}`}>
          {getTypeLabel(template.type_category)}
        </span>
        <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded ${getScopeBadgeStyle(template.scope)}`}>
          {getScopeLabel(template.scope)}
        </span>
        <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
          {getFrequencyLabel(template.default_frequency)}
        </span>
        {template.preferred_time_of_day && (
          <span className="flex-shrink-0 text-xs text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {template.preferred_time_of_day}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded" title="Edit">
          <Pencil className="w-4 h-4 text-gray-400 hover:text-gray-600" />
        </button>
        <button onClick={onDuplicate} className="p-1.5 hover:bg-gray-100 rounded" title="Duplicate">
          <Copy className="w-4 h-4 text-gray-400 hover:text-gray-600" />
        </button>
        <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded" title="Delete">
          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
        </button>
      </div>
    </div>
  );
}

interface EditTemplateModalProps {
  template: TaskTemplate;
  farmTz: string;
  onClose: () => void;
  onSave: (template: TaskTemplate) => Promise<void>;
  onAutoSave: (template: TaskTemplate) => Promise<void>;
}

function EditTemplateModal({ template, farmTz, onClose, onSave, onAutoSave }: EditTemplateModalProps) {
  const isEggTemplate = template.icon === 'egg' || template.category === 'Egg Production';
  const viewerTz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    } catch {
      return 'Local';
    }
  })();

  const [timeDisplayFormat, setTimeDisplayFormat] = useState<'24h' | '12h'>(() => getUiTimeFormat());
  const conversionDateISO = useMemo(() => getFarmTodayISO(farmTz), [farmTz]);

  const normalizeTimes = (times: string[] | null | undefined) => {
    if (!Array.isArray(times)) return [];
    const cleaned = times
      .map((t) => String(t).trim().slice(0, 5))
      .filter((t) => /^\d{2}:\d{2}$/.test(t));
    return Array.from(new Set(cleaned)).sort();
  };

  const buildPresetTimes = (preset: 'once' | 'hourly' | 'every_2_hours' | 'twice' | 'three') => {
    if (preset === 'once') return ['09:00'];
    if (preset === 'hourly') return Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    if (preset === 'every_2_hours') return Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, '0')}:00`);
    if (preset === 'twice') return ['09:00', '15:00'];
    return ['08:00', '12:00', '16:00'];
  };

  const [form, setForm] = useState({
    title: template.title,
    description: template.description || '',
    category: template.category || 'Other',
    type_category: template.type_category,
    scope: template.scope,
    default_frequency: template.default_frequency,
    preferred_time_of_day: template.preferred_time_of_day || '09:00',
    // Use 0 for "all day/no window" to match NOT NULL schemas
    completion_window_minutes: (template.completion_window_minutes ?? 0) as number,
    requires_input: template.requires_input,

    // interval scheduling (used by egg-interval tracking)
    frequency_mode: template.frequency_mode || 'multiple_times_per_day',
    times_per_day: template.times_per_day ?? null,
    scheduled_times: normalizeTimes(template.scheduled_times),
    is_time_bound: template.is_time_bound ?? true,
    window_before_minutes: template.window_before_minutes ?? 60,
    window_after_minutes: template.window_after_minutes ?? 60,
    updates_inventory: (template as any).updates_inventory ?? false,

    // recurrence controls
    days_of_week: ((template as any).days_of_week ?? null) as number[] | null,
    one_time_date: ((template as any).one_time_date ?? null) as string | null,
  });

  const [newTime, setNewTime] = useState('08:00');

  const recurrenceMode: 'daily' | 'weekly' | 'one_day' = (() => {
    if (form.one_time_date) return 'one_day';
    if (form.default_frequency === 'weekly') return 'weekly';
    return 'daily';
  })();

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const [saving, setSaving] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);

  const buildTemplateForSave = () => {
    const times = normalizeTimes(form.scheduled_times as any);
    const inferredFrequency =
      form.default_frequency === 'weekly'
        ? 'weekly'
        : form.one_time_date
        ? 'once_per_day'
        : times.length > 1
        ? 'multiple_per_day'
        : 'once_per_day';

    return {
      ...template,
      ...form,
      default_frequency: inferredFrequency,
      scheduled_times: times,
      times_per_day: times.length || null,
      preferred_time_of_day: times[0] || form.preferred_time_of_day || '09:00',
      completion_window_minutes: Number.isFinite(Number(form.completion_window_minutes))
        ? Math.max(0, Number(form.completion_window_minutes))
        : 0,
    } as TaskTemplate;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(buildTemplateForSave());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Auto-save (debounced) so schedule/repeat changes persist quickly.
  // Only applies while the modal is open; it won't close the modal.
  const initialFormKeyRef = useRef<string>(JSON.stringify(form));

  useEffect(() => {
    if (!autoSaveEnabled) return;
    if (!form.title?.trim()) return;

    // Don't auto-save immediately after opening; only save once the user changes something.
    const currentKey = JSON.stringify(form);
    if (currentKey === initialFormKeyRef.current) return;

    const timer = setTimeout(async () => {
      setAutoSaveState('saving');
      setAutoSaveError(null);
      try {
        await onAutoSave(buildTemplateForSave());
        setAutoSaveState('saved');
      } catch (e: any) {
        setAutoSaveState('error');
        setAutoSaveError(String(e?.message || 'Auto-save failed'));
      }
    }, 900);

    return () => clearTimeout(timer);
    // We intentionally depend on form values; debounce prevents spam.
  }, [autoSaveEnabled, form, onAutoSave]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Edit Task Template</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Task Kind</label>
              <select
                value={form.type_category}
                onChange={(e) => setForm({ ...form, type_category: e.target.value as TaskTypeCategory })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
              >
                <option value="daily">Checklist</option>
                <option value="recording">Recording</option>
                <option value="one_time">One-time</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Applies To</label>
              <select
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value as TaskScope })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
              >
                <option value="general">General (All)</option>
                <option value="broiler">Broiler Only</option>
                <option value="layer">Layer Only</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
              <select
                value={form.default_frequency}
                onChange={(e) => setForm({ ...form, default_frequency: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
              >
                {FREQUENCIES.map(freq => (
                  <option key={freq.value} value={freq.value}>{freq.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={`rounded-xl p-3 space-y-3 border ${
            isEggTemplate ? 'border-amber-100 bg-amber-50/30' : 'border-gray-200 bg-gray-50/30'
          }`}>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {(form.title || 'Task') + ' task schedule'}
              </label>
              <div className="text-[11px] text-gray-600">
                Times are in farm timezone: <span className="font-semibold">{farmTz}</span>
                <span className="text-gray-400"> • </span>
                Your timezone: <span className="font-semibold">{viewerTz}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] font-semibold text-gray-500">Display:</span>
                <button
                  type="button"
                  onClick={() => {
                    setTimeDisplayFormat('24h');
                    setUiTimeFormat('24h');
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    timeDisplayFormat === '24h'
                      ? 'bg-[#3D5F42] text-white border-[#3D5F42]'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  24h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimeDisplayFormat('12h');
                    setUiTimeFormat('12h');
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    timeDisplayFormat === '12h'
                      ? 'bg-[#3D5F42] text-white border-[#3D5F42]'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  12h
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, scheduled_times: buildPresetTimes('once') })}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-200 hover:bg-gray-50"
                >
                  Once/day
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, scheduled_times: buildPresetTimes('twice') })}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-200 hover:bg-gray-50"
                >
                  Twice/day
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, scheduled_times: buildPresetTimes('every_2_hours') })}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-200 hover:bg-gray-50"
                >
                  Every 2 hours
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, scheduled_times: buildPresetTimes('hourly') })}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-200 hover:bg-gray-50"
                >
                  Hourly
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-600">
                Set exact times below. Tasks will generate for only the times you set.
              </p>
            </div>

            {isEggTemplate && (
              <div>
                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(form.updates_inventory)}
                      onChange={(e) => setForm({ ...form, updates_inventory: e.target.checked })}
                      className="w-4 h-4 text-[#3D5F42] border-gray-300 rounded focus:ring-[#3D5F42]"
                    />
                    Default: sync new egg intervals to inventory
                  </label>
                </div>
                <p className="mt-1 text-[11px] text-gray-600">
                  This sets the default for new interval entries. You can still toggle sync per entry on the Eggs page.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Exact times</label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = normalizeTimes([...(form.scheduled_times || []), newTime]);
                    setForm({ ...form, scheduled_times: next });
                  }}
                  className="px-3 py-2 rounded-lg bg-[#3D5F42] text-white text-sm font-semibold hover:bg-[#2F4A34] inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
              <div className="mt-1 text-[11px] text-gray-600">
                Your time for {newTime}:{' '}
                <span className="font-semibold">
                  {formatFarmTimeForViewerWithFormat({
                    dateISO: conversionDateISO,
                    timeHHMM: newTime,
                    farmTz,
                    timeFormat: timeDisplayFormat,
                  })}
                </span>
              </div>

              {(form.scheduled_times?.length || 0) > 0 ? (
                <div className="flex flex-wrap gap-2 mt-3">
                  {form.scheduled_times!.map((t) => (
                    <span key={t} className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-800">
                      {t}
                      <span className="text-[10px] font-medium text-gray-500">
                        ({formatFarmTimeForViewerWithFormat({
                          dateISO: conversionDateISO,
                          timeHHMM: t,
                          farmTz,
                          timeFormat: timeDisplayFormat,
                        })})
                      </span>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, scheduled_times: form.scheduled_times!.filter((x) => x !== t) })}
                        className="p-0.5 rounded-full hover:bg-gray-100"
                        title="Remove"
                      >
                        <X className="w-3 h-3 text-gray-500" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-xs text-gray-600">
                  No times set yet.
                </div>
              )}
            </div>

            <div className={`pt-3 space-y-2 border-t ${isEggTemplate ? 'border-amber-100' : 'border-gray-200'}`}>
              <label className="block text-sm font-semibold text-gray-700">Repeat</label>
              <select
                value={recurrenceMode}
                onChange={(e) => {
                  const mode = e.target.value as 'daily' | 'weekly' | 'one_day';
                  if (mode === 'daily') {
                    const times = normalizeTimes(form.scheduled_times as any);
                    const nextFreq = times.length > 1 ? 'multiple_per_day' : 'once_per_day';
                    setForm({ ...form, default_frequency: nextFreq as any, days_of_week: null, one_time_date: null });
                  } else if (mode === 'weekly') {
                    setForm({ ...form, default_frequency: 'weekly', days_of_week: form.days_of_week || [1, 3, 5], one_time_date: null });
                  } else {
                    const today = new Date().toISOString().split('T')[0];
                    setForm({ ...form, default_frequency: 'once_per_day', days_of_week: null, one_time_date: form.one_time_date || today });
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
              >
                <option value="daily">Every day</option>
                <option value="weekly">Specific days of week</option>
                <option value="one_day">One specific day</option>
              </select>

              {recurrenceMode === 'weekly' && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {dayLabels.map((lbl, idx) => {
                    const selected = (form.days_of_week || []).includes(idx);
                    return (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => {
                          const current = form.days_of_week || [];
                          const next = selected ? current.filter((d) => d !== idx) : [...current, idx];
                          setForm({ ...form, days_of_week: next.sort((a, b) => a - b) });
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                          selected ? 'bg-[#3D5F42] text-white border-[#3D5F42]' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              )}

              {recurrenceMode === 'one_day' && (
                <div className="pt-1">
                  <input
                    type="date"
                    value={form.one_time_date || ''}
                    onChange={(e) => setForm({ ...form, one_time_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                  />
                  <p className="mt-1 text-[11px] text-gray-600">Tasks will generate only for this date.</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Time</label>
              <input
                type="time"
                value={form.preferred_time_of_day || ''}
                onChange={(e) => setForm({ ...form, preferred_time_of_day: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
              />
            </div>

            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                Completion Window
                <div className="relative group">
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Time after due before task is overdue
                  </div>
                </div>
              </label>
              <select
                value={String(form.completion_window_minutes ?? 0)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    completion_window_minutes: e.target.value ? parseInt(e.target.value, 10) : 0,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
              >
                <option value="0">All day (no window)</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="240">4 hours</option>
                <option value="480">8 hours</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="requires_input"
              checked={form.requires_input}
              onChange={(e) => setForm({ ...form, requires_input: e.target.checked })}
              className="w-4 h-4 text-[#3D5F42] border-gray-300 rounded focus:ring-[#3D5F42]"
            />
            <label htmlFor="requires_input" className="text-sm text-gray-700">
              Requires data entry when completing
            </label>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 p-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-xs text-gray-600 inline-flex items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={autoSaveEnabled}
                onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              />
              Auto-save
            </label>
            <div className="text-[11px] text-gray-500 min-w-[72px] text-right">
              {autoSaveEnabled && autoSaveState === 'saving' ? 'Saving...' : null}
              {autoSaveEnabled && autoSaveState === 'saved' ? 'Saved' : null}
              {autoSaveEnabled && autoSaveState === 'error' ? 'Not saved' : null}
            </div>
            <button onClick={handleSave} className="btn-primary flex items-center gap-2" disabled={saving}>
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
