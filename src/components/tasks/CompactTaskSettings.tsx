import { useState, useEffect } from 'react';
import { Settings, Edit2, X, Clock, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFarmSpecies } from '../../hooks/useSpecies';

interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  frequency: string;
  default_time: string | null;
  completion_window_minutes: number;
  flock_type_scope: string;
  is_active: boolean;
  scope: string;
  input_fields: any[] | null;
  days_of_week: number[] | null;
  custom_interval_days: number | null;
}

interface Props {
  onClose: () => void;
}

export function CompactTaskSettings({ onClose }: Props) {
  const { profile } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  // Note: useFarmSpecies is also called inside EditTemplateModal (the inner
  // component); this hook is cheap so duplicating is fine and keeps each
  // component self-contained.
  const farmId = profile?.farm_id;
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    if (farmId) loadTemplates();
  }, [farmId]);

  async function loadTemplates() {
    setLoading(true);
    const { data } = await supabase
      .from('task_templates')
      .select('*')
      .eq('farm_id', farmId)
      .order('category')
      .order('name');
    if (data) setTemplates(data);
    setLoading(false);
  }

  async function toggleActive(id: string, isActive: boolean) {
    await supabase
      .from('task_templates')
      .update({ is_active: isActive })
      .eq('id', id);
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: isActive } : t));
  }

  async function deleteTemplate(id: string) {
    if (!confirm(isFr ? 'Supprimer ce modèle de tâche ?' : 'Delete this task template?')) return;
    await supabase.from('task_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function getFrequencyTag(template: TaskTemplate) {
    if (template.frequency === 'daily') return isFr ? 'Quotidienne' : 'Daily';
    if (template.frequency === 'weekly') return isFr ? 'Hebdomadaire' : 'Weekly';
    if (template.frequency === 'custom') return isFr ? `Tous les ${template.custom_interval_days}j` : `Every ${template.custom_interval_days}d`;
    return template.frequency;
  }

  function getFlockTypeTag(scope: string) {
    if (scope === 'broiler') return { label: isFr ? 'Poulet de chair' : 'Broiler', color: 'bg-orange-100 text-orange-700' };
    if (scope === 'layer') return { label: isFr ? 'Pondeuse' : 'Layer', color: 'bg-blue-100 text-blue-700' };
    return { label: isFr ? 'Général' : 'General', color: 'bg-gray-100 text-gray-700' };
  }

  const filteredTemplates = templates.filter(t => {
    if (filter === 'active') return t.is_active;
    if (filter === 'inactive') return !t.is_active;
    return true;
  });

  const groupedByCategory = filteredTemplates.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, TaskTemplate[]>);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl p-8">
          <p className="text-gray-500">{isFr ? 'Chargement...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#3D5F42] rounded-lg">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{isFr ? 'Modèles de tâches' : 'Task Templates'}</h2>
              <p className="text-sm text-gray-500">{templates.length} {isFr ? 'modèles' : 'templates'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
            >
              <option value="all">{isFr ? 'Tous' : 'All'}</option>
              <option value="active">{isFr ? 'Actifs' : 'Active'}</option>
              <option value="inactive">{isFr ? 'Inactifs' : 'Inactive'}</option>
            </select>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg touch-target"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {Object.entries(groupedByCategory).map(([category, categoryTemplates]) => (
            <div key={category} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {categoryTemplates.map(template => {
                  const flockTag = getFlockTypeTag(template.flock_type_scope);
                  return (
                    <div
                      key={template.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        template.is_active
                          ? 'bg-white border-gray-200 hover:border-gray-300'
                          : 'bg-gray-50 border-gray-100 opacity-60'
                      }`}
                    >
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={template.is_active}
                          onChange={(e) => toggleActive(template.id, e.target.checked)}
                          className="w-4 h-4 text-[#3D5F42] rounded border-gray-300 focus:ring-[#3D5F42]"
                        />
                      </label>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{template.name}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[#3D5F42]/10 text-[#3D5F42]">
                          {getFrequencyTag(template)}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${flockTag.color}`}>
                          {flockTag.label}
                        </span>
                        {template.default_time && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            {template.default_time.slice(0, 5)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingTemplate(template)}
                          className="p-1.5 hover:bg-gray-100 rounded"
                        >
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          className="p-1.5 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {Object.keys(groupedByCategory).length === 0 && (
            <div className="text-center py-12 text-gray-500">
              {isFr ? 'Aucun modèle de tâche trouvé' : 'No task templates found'}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-between">
          <button
            onClick={() => setEditingTemplate({
              id: '',
              name: '',
              description: null,
              category: 'General',
              frequency: 'daily',
              default_time: '08:00',
              completion_window_minutes: 120,
              flock_type_scope: 'general',
              is_active: true,
              scope: 'flock',
              input_fields: null,
              days_of_week: null,
              custom_interval_days: null,
            })}
            className="flex items-center gap-2 px-4 py-2 text-[#3D5F42] hover:bg-[#3D5F42]/5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {isFr ? 'Ajouter un modèle' : 'Add Template'}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2d4631]"
          >
            {isFr ? 'Terminé' : 'Done'}
          </button>
        </div>
      </div>

      {editingTemplate && (
        <EditTemplateModal
          template={editingTemplate}
          farmId={farmId!}
          onSave={async (updated) => {
            if (updated.id) {
              await supabase
                .from('task_templates')
                .update(updated)
                .eq('id', updated.id);
              setTemplates(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
            } else {
              const { data } = await supabase
                .from('task_templates')
                .insert({ ...updated, farm_id: farmId })
                .select()
                .single();
              if (data) setTemplates(prev => [...prev, data]);
            }
            setEditingTemplate(null);
          }}
          onClose={() => setEditingTemplate(null)}
        />
      )}
    </div>
  );
}

function EditTemplateModal({
  template,
  _farmId,
  onSave,
  onClose
}: {
  template: TaskTemplate;
  farmId: string;
  onSave: (template: TaskTemplate) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(template);
  const [saving, setSaving] = useState(false);
  const farmSpecies = useFarmSpecies();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const groupTermLower = farmSpecies.groupTerm.toLowerCase();

  const isNew = !template.id;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">
            {isNew ? (isFr ? 'Nouveau modèle' : 'New Template') : (isFr ? 'Modifier le modèle' : 'Edit Template')}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{isFr ? 'Titre' : 'Title'}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
              placeholder={isFr ? 'ex. Repas du matin' : 'e.g., Morning Feed'}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{isFr ? 'Description' : 'Description'}</label>
            <textarea
              value={form.description || ''}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value || null }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
              rows={2}
              placeholder={isFr ? 'Description facultative' : 'Optional description'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isFr ? 'Catégorie' : 'Category'}</label>
              <select
                value={form.category}
                onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
              >
                <option value="Feed Management">{isFr ? "Gestion de l'alimentation" : 'Feed Management'}</option>
                <option value="Health">{isFr ? 'Santé' : 'Health'}</option>
                <option value="Biosecurity">{isFr ? 'Biosécurité' : 'Biosecurity'}</option>
                <option value="Cleaning">{isFr ? 'Nettoyage' : 'Cleaning'}</option>
                <option value="Production">{isFr ? 'Production' : 'Production'}</option>
                <option value="General">{isFr ? 'Général' : 'General'}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isFr ? 'Fréquence' : 'Frequency'}</label>
              <select
                value={form.frequency}
                onChange={(e) => setForm(prev => ({ ...prev, frequency: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
              >
                <option value="daily">{isFr ? 'Quotidienne' : 'Daily'}</option>
                <option value="weekly">{isFr ? 'Hebdomadaire' : 'Weekly'}</option>
                <option value="custom">{isFr ? 'Intervalle personnalisé' : 'Custom Interval'}</option>
              </select>
            </div>
          </div>

          {form.frequency === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{isFr ? 'Jours de la semaine' : 'Days of Week'}</label>
              <div className="flex gap-2">
                {(isFr ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).map((day, idx) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      const current = form.days_of_week || [];
                      const newDays = current.includes(idx)
                        ? current.filter(d => d !== idx)
                        : [...current, idx];
                      setForm(prev => ({ ...prev, days_of_week: newDays }));
                    }}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      form.days_of_week?.includes(idx)
                        ? 'bg-[#3D5F42] text-white border-[#3D5F42]'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.frequency === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isFr ? 'Intervalle (jours)' : 'Interval (days)'}</label>
              <input
                type="number"
                min="1"
                max="365"
                value={form.custom_interval_days || 7}
                onChange={(e) => setForm(prev => ({ ...prev, custom_interval_days: parseInt(e.target.value) || 7 }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isFr ? 'Heure par défaut' : 'Default Time'}</label>
              <input
                type="time"
                value={form.default_time || '08:00'}
                onChange={(e) => setForm(prev => ({ ...prev, default_time: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isFr ? 'Délai de complétion' : 'Completion Window'}
                <span className="font-normal text-gray-500 ml-1">{isFr ? '(minutes)' : '(minutes)'}</span>
              </label>
              <input
                type="number"
                min="15"
                max="480"
                step="15"
                value={form.completion_window_minutes}
                onChange={(e) => setForm(prev => ({ ...prev, completion_window_minutes: parseInt(e.target.value) || 120 }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
              />
              <p className="text-xs text-gray-500 mt-1">
                {isFr ? "Temps après échéance avant que la tâche ne devienne en retard" : 'Time after due when task becomes overdue'}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{isFr ? `Portée de type ${farmSpecies.groupTerm.toLowerCase()}` : `${farmSpecies.groupTerm} Type Scope`}</label>
            <select
              value={form.flock_type_scope}
              onChange={(e) => setForm(prev => ({ ...prev, flock_type_scope: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
            >
              <option value="general">{isFr ? `Général (tous les ${farmSpecies.groupTermPlural.toLowerCase()})` : `General (all ${farmSpecies.groupTermPlural.toLowerCase()})`}</option>
              {/* Type-specific filtering only meaningful for poultry where the
                  broiler/layer split drives different task cadences. Aqua and
                  rabbits don't currently differentiate task templates by sub-
                  type, so the type-only options are hidden on those species. */}
              {farmSpecies.id === 'poultry' && (
                <>
                  <option value="broiler">{isFr ? 'Poulets de chair uniquement' : 'Broiler only'}</option>
                  <option value="layer">{isFr ? 'Pondeuses uniquement' : 'Layer only'}</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{isFr ? 'Portée' : 'Scope'}</label>
            <select
              value={form.scope}
              onChange={(e) => setForm(prev => ({ ...prev, scope: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
            >
              <option value="farm">{isFr ? "À l'échelle de la ferme (une tâche)" : 'Farm-wide (one task)'}</option>
              <option value="flock">{isFr ? `Par ${groupTermLower} (une tâche par ${groupTermLower})` : `Per ${groupTermLower} (one task per ${groupTermLower})`}</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={(e) => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
              className="w-4 h-4 text-[#3D5F42] rounded border-gray-300 focus:ring-[#3D5F42]"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
              {isFr ? 'Actif' : 'Active'}
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="px-4 py-2 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2d4631] disabled:opacity-50"
            >
              {saving ? (isFr ? 'Enregistrement...' : 'Saving...') : isNew ? (isFr ? 'Créer' : 'Create') : (isFr ? 'Enregistrer' : 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
