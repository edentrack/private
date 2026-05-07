import { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, X, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';

/**
 * Pond Alerts Settings — Phase B Step 24 UI.
 *
 * Lets the farmer define custom alert rules per pond. The pond_alerts table
 * (created in migration 20260506000001) stores the rules; a background job
 * (future work, separate edge function) evaluates them and writes to
 * notifications.
 *
 * UI here is just CRUD over the rules table. The cron evaluator is the
 * follow-up that turns these rules into push notifications.
 */

const ALERT_TYPES: Array<{
  value: string;
  label: string;
  unit: string;
  defaultThreshold: number;
  hint: string;
}> = [
  { value: 'mortality_per_day', label: 'Mortality per day exceeds', unit: 'fish', defaultThreshold: 5, hint: 'Trigger when daily deaths cross this number' },
  { value: 'no_inspection_days', label: 'No inspection logged for', unit: 'days', defaultThreshold: 3, hint: 'Reminder if you haven\'t inspected the pond in N days' },
  { value: 'do_below', label: 'DO drops below', unit: 'mg/L', defaultThreshold: 3, hint: 'Critical for fish — typically 3 mg/L is the emergency line' },
  { value: 'ammonia_above', label: 'Ammonia rises above', unit: 'mg/L', defaultThreshold: 0.1, hint: 'Toxic above 0.5 mg/L; warn at 0.1 to give time to react' },
  { value: 'ph_below', label: 'pH drops below', unit: '', defaultThreshold: 6.5, hint: 'Below 6.5 stresses fish; below 6 is critical' },
  { value: 'ph_above', label: 'pH rises above', unit: '', defaultThreshold: 9, hint: 'Above 9 amplifies ammonia toxicity' },
  { value: 'temp_below', label: 'Temperature drops below', unit: '°C', defaultThreshold: 22, hint: 'Below species optimum slows growth + invites disease' },
  { value: 'temp_above', label: 'Temperature rises above', unit: '°C', defaultThreshold: 33, hint: 'Above species optimum reduces feeding + risks DO crash' },
  { value: 'sgr_below', label: 'SGR drops below', unit: '%/day', defaultThreshold: 1, hint: 'Healthy growth is 1.5-3 %/day; below 1 means a problem' },
  { value: 'fcr_above', label: 'FCR rises above', unit: '', defaultThreshold: 2.5, hint: 'Above 2.5 = feed cost climbing without proportional weight gain' },
];

interface AquaFlock {
  id: string;
  name: string;
  type: string;
}

interface PondAlert {
  id: string;
  flock_id: string;
  alert_type: string;
  threshold: number;
  enabled: boolean;
  notify_via: string[];
}

const AQUA_TYPES = ['Catfish', 'Tilapia', 'Clarias', 'Other Fish'];

interface PondAlertsSettingsProps {
  onClose?: () => void;
}

export function PondAlertsSettings({ onClose }: PondAlertsSettingsProps) {
  const { currentFarm } = useAuth();
  const toast = useToast();

  const [flocks, setFlocks] = useState<AquaFlock[]>([]);
  const [alerts, setAlerts] = useState<PondAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formFlockId, setFormFlockId] = useState('');
  const [formType, setFormType] = useState(ALERT_TYPES[0].value);
  const [formThreshold, setFormThreshold] = useState(String(ALERT_TYPES[0].defaultThreshold));

  useEffect(() => {
    if (!currentFarm?.id) return;
    loadFlocks();
    loadAlerts();
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

  const loadAlerts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pond_alerts')
      .select('*')
      .eq('farm_id', currentFarm!.id)
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01' || error.message?.includes('pond_alerts')) {
        setAlerts([]);
        toast.info('Pond alerts table not yet applied — run migration 20260506000001 to enable.');
      } else {
        toast.error('Failed to load alerts');
      }
    } else {
      setAlerts((data as PondAlert[]) || []);
    }
    setLoading(false);
  };

  const handleAlertTypeChange = (value: string) => {
    setFormType(value);
    const def = ALERT_TYPES.find(a => a.value === value);
    if (def) setFormThreshold(String(def.defaultThreshold));
  };

  const handleSubmit = async () => {
    if (!formFlockId) {
      toast.error('Please select a pond');
      return;
    }
    const threshold = parseFloat(formThreshold);
    if (isNaN(threshold)) {
      toast.error('Please enter a valid threshold');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('pond_alerts').upsert(
      {
        farm_id: currentFarm!.id,
        flock_id: formFlockId,
        alert_type: formType,
        threshold,
        enabled: true,
        notify_via: ['push'],
      },
      { onConflict: 'flock_id,alert_type' },
    );
    setSubmitting(false);
    if (error) {
      toast.error('Failed to save alert rule');
    } else {
      toast.success('Alert rule saved');
      setShowForm(false);
      loadAlerts();
    }
  };

  const handleToggle = async (alert: PondAlert) => {
    const { error } = await supabase
      .from('pond_alerts')
      .update({ enabled: !alert.enabled })
      .eq('id', alert.id)
      .eq('farm_id', currentFarm!.id);
    if (error) {
      toast.error('Failed to toggle alert');
    } else {
      loadAlerts();
    }
  };

  const handleDelete = async (alert: PondAlert) => {
    if (!confirm('Delete this alert rule?')) return;
    const { error } = await supabase
      .from('pond_alerts')
      .delete()
      .eq('id', alert.id)
      .eq('farm_id', currentFarm!.id);
    if (error) {
      toast.error('Failed to delete alert');
    } else {
      toast.success('Alert deleted');
      loadAlerts();
    }
  };

  const flockName = (id: string) => flocks.find(f => f.id === id)?.name || 'Unknown pond';
  const alertTypeLabel = (v: string) => ALERT_TYPES.find(a => a.value === v)?.label || v;
  const alertTypeUnit = (v: string) => ALERT_TYPES.find(a => a.value === v)?.unit || '';
  const selectedTypeMeta = ALERT_TYPES.find(a => a.value === formType);

  return (
    <div className="bg-white rounded-3xl p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Pond Alerts</h2>
            <p className="text-xs text-gray-500">Per-pond threshold rules. Notifications fire via push when crossed.</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg touch-target">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        )}
      </div>

      {flocks.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">No active aquaculture flocks. Create a pond first.</p>
        </div>
      ) : (
        <>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#3D5F42] text-white text-xs rounded-lg hover:bg-[#2f4a34] transition-colors"
            >
              {showForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {showForm ? 'Cancel' : 'New rule'}
            </button>
          </div>

          {showForm && (
            <div className="border border-gray-200 rounded-xl p-4 mb-4 bg-gray-50/40">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pond</label>
                  <select
                    value={formFlockId}
                    onChange={e => setFormFlockId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {flocks.map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Trigger</label>
                  <select
                    value={formType}
                    onChange={e => handleAlertTypeChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {ALERT_TYPES.map(a => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Threshold {alertTypeUnit(formType) && `(${alertTypeUnit(formType)})`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formThreshold}
                    onChange={e => setFormThreshold(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  {selectedTypeMeta && (
                    <p className="text-[11px] text-gray-500 mt-1">{selectedTypeMeta.hint}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-3 py-1.5 text-xs font-medium bg-[#3D5F42] text-white rounded-lg hover:bg-[#2f4a34] disabled:opacity-60 inline-flex items-center gap-1"
                >
                  <Save className="w-3 h-3" />
                  {submitting ? 'Saving…' : 'Save rule'}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No alert rules yet.</p>
              <p className="text-xs mt-1">Click "New rule" to add one.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {alerts.map(a => (
                <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{flockName(a.flock_id)}</div>
                    <div className="text-xs text-gray-500">
                      {alertTypeLabel(a.alert_type)} <span className="font-medium text-gray-700">{a.threshold}</span> {alertTypeUnit(a.alert_type)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(a)}
                    className={`text-xs px-2 py-1 rounded-full ${
                      a.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {a.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => handleDelete(a)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
