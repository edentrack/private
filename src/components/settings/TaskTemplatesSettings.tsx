import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, Save, X, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  scheduled_times: string[];
  type_category: 'daily' | 'one_time' | 'recording';
  is_enabled: boolean;
  applies_to_all_flocks: boolean;
  flock_type_filter: string | null;
}

export function TaskTemplatesSettings() {
  const { currentFarm } = useAuth();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    title: '',
    description: '',
    scheduled_times: ['09:00'],
    type_category: 'daily' as 'daily' | 'one_time' | 'recording',
    applies_to_all_flocks: false,
  });

  useEffect(() => {
    if (currentFarm?.id) {
      loadTemplates();
    }
  }, [currentFarm?.id]);

  const loadTemplates = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_templates')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .eq('is_system_template', false)
        .order('title');

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEnabled = async (templateId: string, currentEnabled: boolean) => {
    try {
      const { error } = await supabase
        .from('task_templates')
        .update({ is_enabled: !currentEnabled })
        .eq('id', templateId);

      if (!error) {
        loadTemplates();
      }
    } catch (error) {
      console.error('Error toggling template:', error);
    }
  };

  const updateTypeCategory = async (templateId: string, newCategory: 'daily' | 'one_time' | 'recording') => {
    try {
      const { error } = await supabase
        .from('task_templates')
        .update({ type_category: newCategory })
        .eq('id', templateId);

      if (!error) {
        loadTemplates();
      }
    } catch (error) {
      console.error('Error updating template category:', error);
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this task template?')) return;

    try {
      const { error } = await supabase
        .from('task_templates')
        .delete()
        .eq('id', templateId);

      if (!error) {
        loadTemplates();
      }
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const createTemplate = async () => {
    if (!currentFarm?.id || !newTemplate.title.trim()) return;

    try {
      const { error } = await supabase
        .from('task_templates')
        .insert({
          farm_id: currentFarm.id,
          title: newTemplate.title,
          description: newTemplate.description,
          scheduled_times: newTemplate.scheduled_times,
          type_category: newTemplate.type_category,
          applies_to_all_flocks: newTemplate.applies_to_all_flocks,
          is_enabled: true,
          is_system_template: false,
        });

      if (!error) {
        setShowAddForm(false);
        setNewTemplate({
          title: '',
          description: '',
          scheduled_times: ['09:00'],
          type_category: 'daily',
          applies_to_all_flocks: false,
        });
        loadTemplates();
      }
    } catch (error) {
      console.error('Error creating template:', error);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-gray-200 border-t-green-600 rounded-full mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Task Templates</h3>
          <p className="text-sm text-gray-500 mt-1">
            Control which tasks appear daily and which are one-time reminders
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-neon inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Template
        </button>
      </div>

      {showAddForm && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-900">New Task Template</h4>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task Name</label>
            <input
              type="text"
              value={newTemplate.title}
              onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
              className="input-field"
              placeholder="e.g., Check Litter"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={newTemplate.description}
              onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
              className="input-field"
              rows={2}
              placeholder="Optional description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
            <input
              type="time"
              value={newTemplate.scheduled_times[0]}
              onChange={(e) => setNewTemplate({ ...newTemplate, scheduled_times: [e.target.value] })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={newTemplate.type_category === 'daily'}
                  onChange={() => setNewTemplate({ ...newTemplate, type_category: 'daily' })}
                  className="w-4 h-4 text-green-600"
                />
                <span className="text-sm">Daily</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={newTemplate.type_category === 'one_time'}
                  onChange={() => setNewTemplate({ ...newTemplate, type_category: 'one_time' })}
                  className="w-4 h-4 text-green-600"
                />
                <span className="text-sm">One-time reminder</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="applies-to-all"
              checked={newTemplate.applies_to_all_flocks}
              onChange={(e) => setNewTemplate({ ...newTemplate, applies_to_all_flocks: e.target.checked })}
              className="w-4 h-4 text-green-600 rounded"
            />
            <label htmlFor="applies-to-all" className="text-sm text-gray-700">
              Apply to all flocks (don't duplicate per flock)
            </label>
          </div>

          <div className="flex gap-3">
            <button onClick={createTemplate} className="btn-neon">
              <Save className="w-4 h-4" />
              Create Template
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {templates.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 mb-4">No task templates yet</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="btn-neon inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Your First Template
            </button>
          </div>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className={`bg-white border rounded-lg p-4 transition-all ${
                template.is_enabled ? 'border-gray-200' : 'border-gray-300 bg-gray-50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-gray-900">{template.title}</h4>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        template.type_category === 'one_time'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {template.type_category === 'one_time' ? (
                        <>
                          <Clock className="w-3 h-3" />
                          One-time
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          Daily
                        </>
                      )}
                    </span>
                  </div>
                  {template.description && (
                    <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {template.scheduled_times.join(', ')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={template.type_category}
                    onChange={(e) =>
                      updateTypeCategory(template.id, e.target.value as 'daily' | 'one_time' | 'recording')
                    }
                    className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="one_time">One-time</option>
                  </select>

                  <button
                    onClick={() => toggleEnabled(template.id, template.is_enabled)}
                    className={`p-2 rounded transition-colors ${
                      template.is_enabled
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={template.is_enabled ? 'Enabled' : 'Disabled'}
                  >
                    {template.is_enabled ? (
                      <ToggleRight className="w-6 h-6" />
                    ) : (
                      <ToggleLeft className="w-6 h-6" />
                    )}
                  </button>

                  <button
                    onClick={() => deleteTemplate(template.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete template"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
