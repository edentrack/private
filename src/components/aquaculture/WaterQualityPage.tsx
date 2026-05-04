import { useState, useEffect } from 'react';
import { Plus, Droplets, X, Thermometer, Wind, FlaskConical } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import type { WaterQualityLog } from '../../types/database';

interface AquaFlock {
  id: string;
  name: string;
  type: string;
}

function getDOStatus(do2: number | null | undefined): { label: string; color: string; bg: string } {
  if (do2 === null || do2 === undefined) return { label: '—', color: 'text-gray-400', bg: 'bg-gray-100' };
  if (do2 >= 5) return { label: `${do2} mg/L`, color: 'text-emerald-700', bg: 'bg-emerald-100' };
  if (do2 >= 3) return { label: `${do2} mg/L`, color: 'text-amber-700', bg: 'bg-amber-100' };
  return { label: `${do2} mg/L`, color: 'text-red-700', bg: 'bg-red-100' };
}

const AQUA_TYPES = ['Catfish', 'Tilapia', 'Clarias', 'Other Fish'];

export function WaterQualityPage() {
  const { currentFarm } = useAuth();
  const toast = useToast();

  const [logs, setLogs] = useState<WaterQualityLog[]>([]);
  const [flocks, setFlocks] = useState<AquaFlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formFlockId, setFormFlockId] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formTemp, setFormTemp] = useState('');
  const [formDO, setFormDO] = useState('');
  const [formPH, setFormPH] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    if (!currentFarm?.id) return;
    loadFlocks();
    loadLogs();
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

  const loadLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('water_quality_logs')
      .select('*')
      .eq('farm_id', currentFarm!.id)
      .order('logged_at', { ascending: false });
    if (error) {
      toast.error('Failed to load water quality logs');
    } else {
      setLogs(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormTemp('');
    setFormDO('');
    setFormPH('');
    setFormNotes('');
    if (flocks.length > 0) setFormFlockId(flocks[0].id);
  };

  const handleSubmit = async () => {
    if (!formFlockId) {
      toast.error('Please select a pond/flock');
      return;
    }
    if (!formDate) {
      toast.error('Please select a date');
      return;
    }
    if (!formTemp && !formDO && !formPH) {
      toast.error('Please enter at least one measurement');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('water_quality_logs').insert({
      farm_id: currentFarm!.id,
      flock_id: formFlockId,
      logged_at: formDate,
      temperature_c: formTemp ? parseFloat(formTemp) : null,
      dissolved_oxygen: formDO ? parseFloat(formDO) : null,
      ph: formPH ? parseFloat(formPH) : null,
      notes: formNotes || null,
    });
    setSubmitting(false);

    if (error) {
      toast.error('Failed to save reading');
    } else {
      toast.success('Water quality reading saved');
      resetForm();
      setShowForm(false);
      loadLogs();
    }
  };

  const getFlockName = (id: string) => flocks.find(f => f.id === id)?.name ?? 'Unknown pond';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
            <Droplets className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Water Quality</h1>
            <p className="text-sm text-gray-500">Monitor pond parameters for your fish farm.</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); if (!showForm) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Log Reading'}
        </button>
      </div>

      {/* Inline Add Form */}
      {showForm && (
        <div className="section-card animate-fade-in-up">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Water Quality Reading</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pond / Flock *</label>
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
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Thermometer className="inline w-3 h-3 mr-1" />Temperature (°C)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="50"
                placeholder="e.g. 28.5"
                value={formTemp}
                onChange={e => setFormTemp(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Wind className="inline w-3 h-3 mr-1" />Dissolved Oxygen (mg/L)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="20"
                placeholder="e.g. 6.0"
                value={formDO}
                onChange={e => setFormDO(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
              <p className="text-xs text-gray-400 mt-0.5">Normal: ≥5 mg/L</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <FlaskConical className="inline w-3 h-3 mr-1" />pH
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="14"
                placeholder="e.g. 7.2"
                value={formPH}
                onChange={e => setFormPH(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
              <p className="text-xs text-gray-400 mt-0.5">Ideal: 6.5 – 8.5</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input
                type="text"
                placeholder="Optional observations..."
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting || flocks.length === 0}
              className="px-5 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving...' : 'Save Reading'}
            </button>
          </div>
        </div>
      )}

      {/* Logs list */}
      <div className="section-card">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-[#3D5F42] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-3">
              <Droplets className="w-7 h-7 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">No readings yet</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              Start monitoring your pond health by logging your first water quality reading.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Log First Reading
            </button>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-gray-100">
            {logs.map(log => {
              const doStatus = getDOStatus(log.dissolved_oxygen);
              return (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{getFlockName(log.flock_id)}</span>
                      <span className="text-xs text-gray-400">
                        {(() => { const p = String(log.logged_at).split(/[-T]/); const d = p.length >= 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date(log.logged_at); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); })()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {log.temperature_c !== null && log.temperature_c !== undefined && (
                        <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                          <Thermometer className="w-3 h-3" />{log.temperature_c}°C
                        </span>
                      )}
                      {log.dissolved_oxygen !== null && log.dissolved_oxygen !== undefined && (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${doStatus.bg} ${doStatus.color}`}>
                          <Wind className="w-3 h-3" />{doStatus.label}
                        </span>
                      )}
                      {log.ph !== null && log.ph !== undefined && (
                        <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                          <FlaskConical className="w-3 h-3" />pH {log.ph}
                        </span>
                      )}
                    </div>
                    {log.notes && (
                      <p className="text-xs text-gray-500 mt-1 truncate">{log.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DO color key */}
      {logs.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> DO ≥5 mg/L — Good
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> DO 3–5 mg/L — Warning
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> DO &lt;3 mg/L — Critical
          </span>
        </div>
      )}
    </div>
  );
}
