import { useState, useEffect } from 'react';
import { Plus, Eye, X, Calendar, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';

/**
 * Pond Inspections — Phase B Step 16 UI.
 *
 * Daily 30-second visual log of pond health. Shorter than a sampling event;
 * captures observations a meter can't see. Backed by the `pond_inspections`
 * table (created in migration 20260506000001).
 *
 * The form is intentionally compact — 4 dropdowns + 1 number + 1 text — so
 * a farmer can fill it in under 30 seconds on mobile in the morning.
 */

interface AquaFlock {
  id: string;
  name: string;
  type: string;
}

interface PondInspection {
  id: string;
  flock_id: string;
  inspection_date: string;
  water_clarity: string | null;
  fish_behavior: string | null;
  feeding_response: string | null;
  dead_fish_count: number | null;
  notes: string | null;
  inspected_by: string | null;
  created_at: string;
}

const AQUA_TYPES = ['Catfish', 'Tilapia', 'Clarias', 'Other Fish'];

const CLARITY_OPTIONS = [
  { value: 'clear', label: 'Clear', color: 'bg-blue-100 text-blue-800', warn: false },
  { value: 'murky', label: 'Murky', color: 'bg-amber-100 text-amber-800', warn: false },
  { value: 'green', label: 'Green', color: 'bg-emerald-100 text-emerald-800', warn: true },
  { value: 'brown', label: 'Brown', color: 'bg-orange-100 text-orange-800', warn: true },
  { value: 'black', label: 'Black', color: 'bg-gray-800 text-white', warn: true },
];

const BEHAVIOR_OPTIONS = [
  { value: 'normal', label: 'Normal', color: 'bg-green-100 text-green-800', warn: false },
  { value: 'feeding-vigorous', label: 'Feeding vigorously', color: 'bg-green-100 text-green-800', warn: false },
  { value: 'lethargic', label: 'Lethargic', color: 'bg-amber-100 text-amber-800', warn: true },
  { value: 'gasping', label: 'Gasping at surface', color: 'bg-red-100 text-red-800', warn: true },
  { value: 'erratic', label: 'Erratic / spinning', color: 'bg-red-100 text-red-800', warn: true },
];

const FEEDING_OPTIONS = [
  { value: 'vigorous', label: 'Vigorous', color: 'bg-green-100 text-green-800', warn: false },
  { value: 'normal', label: 'Normal', color: 'bg-green-100 text-green-800', warn: false },
  { value: 'slow', label: 'Slow', color: 'bg-amber-100 text-amber-800', warn: true },
  { value: 'none', label: 'No response', color: 'bg-red-100 text-red-800', warn: true },
];

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(s: string): string {
  const parts = String(s).split(/[-T]/);
  const d = parts.length >= 3 ? new Date(+parts[0], +parts[1] - 1, +parts[2]) : new Date(s);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function flag(value: string | null, options: typeof CLARITY_OPTIONS) {
  return options.find(o => o.value === value);
}

export function PondInspectionsPage() {
  const { currentFarm, user } = useAuth();
  const toast = useToast();

  const [flocks, setFlocks] = useState<AquaFlock[]>([]);
  const [inspections, setInspections] = useState<PondInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formFlockId, setFormFlockId] = useState('');
  const [formDate, setFormDate] = useState(todayLocal);
  const [formClarity, setFormClarity] = useState('');
  const [formBehavior, setFormBehavior] = useState('');
  const [formFeeding, setFormFeeding] = useState('');
  const [formDeadCount, setFormDeadCount] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    if (!currentFarm?.id) return;
    loadFlocks();
    loadInspections();
  }, [currentFarm?.id]);

  const loadFlocks = async () => {
    const { data } = await supabase
      .from('flocks')
      .select('id, name, type')
      .eq('farm_id', currentFarm!.id)
      .eq('status', 'active')
      .in('type', AQUA_TYPES)
      .order('name');
    const result = data || [];
    setFlocks(result);
    if (result.length > 0) setFormFlockId(result[0].id);
  };

  const loadInspections = async () => {
    setLoading(true);
    // Defense-in-depth: scope by farm_id alongside the implicit RLS check.
    const { data, error } = await supabase
      .from('pond_inspections')
      .select('*')
      .eq('farm_id', currentFarm!.id)
      .order('inspection_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      // If the migration hasn't been applied to this environment yet, show a
      // helpful empty state rather than a crash.
      if (error.code === '42P01' || error.message?.includes('pond_inspections')) {
        setInspections([]);
        toast.info('Pond inspections table not yet applied — run migration 20260506000001 to enable.');
      } else {
        toast.error('Failed to load pond inspections');
      }
    } else {
      setInspections((data as PondInspection[]) || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormDate(todayLocal());
    setFormClarity('');
    setFormBehavior('');
    setFormFeeding('');
    setFormDeadCount('');
    setFormNotes('');
    if (flocks.length > 0) setFormFlockId(flocks[0].id);
  };

  const handleSubmit = async () => {
    if (!formFlockId) {
      toast.error('Please select a pond');
      return;
    }
    if (!formClarity && !formBehavior && !formFeeding && !formDeadCount && !formNotes) {
      toast.error('Please record at least one observation');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('pond_inspections').insert({
      farm_id: currentFarm!.id,
      flock_id: formFlockId,
      inspection_date: formDate,
      water_clarity: formClarity || null,
      fish_behavior: formBehavior || null,
      feeding_response: formFeeding || null,
      dead_fish_count: formDeadCount ? Number(formDeadCount) : 0,
      notes: formNotes || null,
      inspected_by: user?.id ?? null,
    });
    setSubmitting(false);
    if (error) {
      toast.error('Failed to save inspection');
    } else {
      toast.success('Inspection saved');
      resetForm();
      setShowForm(false);
      loadInspections();
    }
  };

  const flockName = (id: string) => flocks.find(f => f.id === id)?.name || 'Unknown pond';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pond Inspections</h1>
            <p className="text-sm text-gray-500">A 30-second daily check on water + fish behavior.</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); if (!showForm) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'New Inspection'}
        </button>
      </div>

      {showForm && (
        <div className="section-card animate-fade-in-up">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Inspection</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pond *</label>
              {flocks.length === 0 ? (
                <p className="text-xs text-amber-600">No active aquaculture flocks found.</p>
              ) : (
                <select
                  value={formFlockId}
                  onChange={e => setFormFlockId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
                >
                  {flocks.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.type})</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input
                type="date"
                value={formDate}
                max={todayLocal()}
                onChange={e => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Water clarity</label>
              <select
                value={formClarity}
                onChange={e => setFormClarity(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              >
                <option value="">— select —</option>
                {CLARITY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fish behavior</label>
              <select
                value={formBehavior}
                onChange={e => setFormBehavior(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              >
                <option value="">— select —</option>
                {BEHAVIOR_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Feeding response</label>
              <select
                value={formFeeding}
                onChange={e => setFormFeeding(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              >
                <option value="">— select —</option>
                {FEEDING_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dead fish observed</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={formDeadCount}
                onChange={e => setFormDeadCount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
                placeholder="Anything else you noticed — algae bloom, predator marks, smell, etc."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30 resize-none"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-[#3D5F42] text-white rounded-lg hover:bg-[#2f4a34] disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save inspection'}
            </button>
          </div>
        </div>
      )}

      <div className="section-card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Recent inspections</h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : inspections.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No inspections logged yet.</p>
            <p className="text-xs mt-1">Click "New Inspection" to record your first one.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {inspections.map(insp => {
              const clarity = flag(insp.water_clarity, CLARITY_OPTIONS);
              const behavior = flag(insp.fish_behavior, BEHAVIOR_OPTIONS);
              const feeding = flag(insp.feeding_response, FEEDING_OPTIONS);
              const anyWarning =
                (clarity?.warn) || (behavior?.warn) || (feeding?.warn) || (insp.dead_fish_count ?? 0) > 0;
              return (
                <div key={insp.id} className="py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{flockName(insp.flock_id)}</span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(insp.inspection_date)}
                    </span>
                    {anyWarning && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                        <AlertTriangle className="w-3 h-3" />
                        Watch
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {clarity && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${clarity.color}`}>
                        Water: {clarity.label}
                      </span>
                    )}
                    {behavior && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${behavior.color}`}>
                        {behavior.label}
                      </span>
                    )}
                    {feeding && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${feeding.color}`}>
                        Feed: {feeding.label}
                      </span>
                    )}
                    {(insp.dead_fish_count ?? 0) > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                        {insp.dead_fish_count} dead fish
                      </span>
                    )}
                  </div>
                  {insp.notes && <p className="text-xs text-gray-500 mt-1">{insp.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
