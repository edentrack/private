import { useState, useEffect } from 'react';
import { Settings, ChevronDown, ChevronUp, Save, X, Clock, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { TaskTemplate, FrequencyMode, UserRole } from '../../types/database';

interface TaskTemplateSettingsProps {
  onClose: () => void;
}

export function TaskTemplateSettings({ onClose }: TaskTemplateSettingsProps) {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, [profile]);

  const loadTemplates = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_templates')
        .select('*')
        .order('category', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);

      const categories = new Set(data?.map((t) => t.category) || []);
      setExpandedCategories(categories);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const updateTemplate = async (templateId: string, updates: Partial<TaskTemplate>) => {
    setSaving(templateId);
    try {
      const { error } = await supabase
        .from('task_templates')
        .update(updates)
        .eq('id', templateId);

      if (error) throw error;

      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, ...updates } : t))
      );
    } catch (error) {
      console.error('Error updating template:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const handleFrequencyChange = async (template: TaskTemplate, mode: FrequencyMode) => {
    const updates: Partial<TaskTemplate> = { frequency_mode: mode };

    if (mode === 'once_per_day') {
      updates.times_per_day = 1;
      updates.scheduled_times = template.scheduled_times?.[0] ? [template.scheduled_times[0]] : null;
    } else if (mode === 'multiple_times_per_day') {
      updates.times_per_day = 2;
      updates.scheduled_times = ['08:00', '16:00'];
    } else {
      updates.times_per_day = null;
      updates.scheduled_times = null;
    }

    await updateTemplate(template.id, updates);
  };

  const handleTimesPerDayChange = async (template: TaskTemplate, count: number) => {
    const validCount = Math.max(1, Math.min(10, count));
    const currentTimes = template.scheduled_times || [];
    const newTimes: string[] = [];

    for (let i = 0; i < validCount; i++) {
      if (currentTimes[i]) {
        newTimes.push(currentTimes[i]);
      } else {
        const defaultHour = 8 + i * Math.floor(12 / validCount);
        newTimes.push(`${defaultHour.toString().padStart(2, '0')}:00`);
      }
    }

    await updateTemplate(template.id, {
      times_per_day: validCount,
      scheduled_times: newTimes,
    });
  };

  const handleScheduledTimeChange = async (
    template: TaskTemplate,
    index: number,
    time: string
  ) => {
    const newTimes = [...(template.scheduled_times || [])];
    newTimes[index] = time;

    await updateTemplate(template.id, { scheduled_times: newTimes });
  };

  const handleRoleToggle = async (template: TaskTemplate, role: UserRole) => {
    const currentRoles = template.allowed_roles_to_complete || ['owner', 'manager', 'worker'];
    let newRoles: UserRole[];

    if (currentRoles.includes(role)) {
      newRoles = currentRoles.filter((r) => r !== role);
    } else {
      newRoles = [...currentRoles, role];
    }

    if (newRoles.length === 0) {
      alert('At least one role must be allowed to complete this task.');
      return;
    }

    await updateTemplate(template.id, { allowed_roles_to_complete: newRoles });
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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-3xl p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto">
          <div className="text-center text-gray-500">Loading task settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl p-6 max-w-5xl w-full max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#3D5F42] rounded-xl">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Task Template Settings</h2>
              <p className="text-sm text-gray-600">Configure daily task frequency and timing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <div className="space-y-4">
          {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
            <div key={category} className="border-2 border-gray-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-6 py-4 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
              >
                <h3 className="font-bold text-gray-900">{category}</h3>
                {expandedCategories.has(category) ? (
                  <ChevronUp className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                )}
              </button>

              {expandedCategories.has(category) && (
                <div className="divide-y divide-gray-200">
                  {categoryTemplates.map((template) => (
                    <div key={template.id} className="p-6 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-bold text-gray-900 mb-1">{template.title}</h4>
                          {template.description && (
                            <p className="text-sm text-gray-600">{template.description}</p>
                          )}
                        </div>
                        <label className="flex items-center gap-2 ml-4">
                          <input
                            type="checkbox"
                            checked={template.is_enabled}
                            onChange={(e) =>
                              updateTemplate(template.id, { is_enabled: e.target.checked })
                            }
                            className="w-5 h-5 text-[#3D5F42] rounded"
                            disabled={saving === template.id}
                          />
                          <span className="text-sm font-medium text-gray-700">Enabled</span>
                        </label>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Frequency
                          </label>
                          <select
                            value={template.frequency_mode}
                            onChange={(e) =>
                              handleFrequencyChange(template, e.target.value as FrequencyMode)
                            }
                            className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-[#3D5F42] focus:outline-none"
                            disabled={saving === template.id}
                          >
                            <option value="once_per_day">Once per day</option>
                            <option value="multiple_times_per_day">Multiple times per day</option>
                            <option value="ad_hoc">Ad-hoc (manual only)</option>
                          </select>
                        </div>

                        {template.frequency_mode === 'once_per_day' && (
                          <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                              <Clock className="w-4 h-4" />
                              Specific Time
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={template.is_time_bound}
                                onChange={(e) =>
                                  updateTemplate(template.id, {
                                    is_time_bound: e.target.checked,
                                    scheduled_times: e.target.checked ? ['09:00'] : null,
                                  })
                                }
                                className="w-5 h-5 text-[#3D5F42] rounded"
                                disabled={saving === template.id}
                              />
                              {template.is_time_bound && (
                                <input
                                  type="time"
                                  value={template.scheduled_times?.[0] || '09:00'}
                                  onChange={(e) =>
                                    updateTemplate(template.id, {
                                      scheduled_times: [e.target.value],
                                    })
                                  }
                                  className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-[#3D5F42] focus:outline-none"
                                  disabled={saving === template.id}
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {template.frequency_mode === 'multiple_times_per_day' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Times per Day
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={template.times_per_day || 2}
                              onChange={(e) =>
                                handleTimesPerDayChange(template, parseInt(e.target.value, 10))
                              }
                              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-[#3D5F42] focus:outline-none"
                              disabled={saving === template.id}
                            />
                          </div>
                        )}
                      </div>

                      {template.frequency_mode === 'multiple_times_per_day' &&
                        template.scheduled_times && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Scheduled Times
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {template.scheduled_times.map((time, index) => (
                                <input
                                  key={index}
                                  type="time"
                                  value={time}
                                  onChange={(e) =>
                                    handleScheduledTimeChange(template, index, e.target.value)
                                  }
                                  className="px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-[#3D5F42] focus:outline-none"
                                  disabled={saving === template.id}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                      {template.is_time_bound && template.frequency_mode !== 'ad_hoc' && (
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Complete Before (minutes)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="240"
                              step="15"
                              value={template.window_before_minutes}
                              onChange={(e) =>
                                updateTemplate(template.id, {
                                  window_before_minutes: parseInt(e.target.value, 10),
                                })
                              }
                              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-[#3D5F42] focus:outline-none"
                              disabled={saving === template.id}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Complete After (minutes)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="240"
                              step="15"
                              value={template.window_after_minutes}
                              onChange={(e) =>
                                updateTemplate(template.id, {
                                  window_after_minutes: parseInt(e.target.value, 10),
                                })
                              }
                              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-[#3D5F42] focus:outline-none"
                              disabled={saving === template.id}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                          <Users className="w-4 h-4" />
                          Who can complete this task?
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {(['owner', 'manager', 'worker'] as UserRole[]).map((role) => (
                            <label
                              key={role}
                              className="flex items-center gap-2 px-4 py-2 border-2 border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={template.allowed_roles_to_complete?.includes(role)}
                                onChange={() => handleRoleToggle(template, role)}
                                className="w-4 h-4 text-[#3D5F42] rounded"
                                disabled={saving === template.id}
                              />
                              <span className="text-sm capitalize">{role}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {saving === template.id && (
                        <div className="flex items-center gap-2 text-sm text-[#3D5F42]">
                          <Save className="w-4 h-4 animate-spin" />
                          <span>Saving...</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-[#3D5F42] text-white rounded-xl font-medium hover:bg-[#2d4632] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
