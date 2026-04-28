import { useState, useEffect } from 'react';
import { Bot, Save, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface AIPermissions {
  can_add_workers: boolean;
  can_edit_workers: boolean;
  can_change_team_roles: boolean;
  can_run_payroll: boolean;
  can_edit_records: boolean;
  can_void_records: boolean;
}

const DEFAULTS: AIPermissions = {
  can_add_workers: true,
  can_edit_workers: true,
  can_change_team_roles: true,
  can_run_payroll: true,
  can_edit_records: true,
  can_void_records: true,
};

const PERMISSION_DEFS: { key: keyof AIPermissions; label: string; desc: string; risk: 'low' | 'medium' | 'high' }[] = [
  {
    key: 'can_add_workers',
    label: 'Add workers',
    desc: 'Eden can add new offline workers to your farm by name via chat',
    risk: 'low',
  },
  {
    key: 'can_edit_workers',
    label: 'Edit worker details',
    desc: 'Eden can update worker salary, role, and other details via chat',
    risk: 'medium',
  },
  {
    key: 'can_change_team_roles',
    label: 'Change app user roles',
    desc: 'Eden can promote or demote team members who have app accounts',
    risk: 'medium',
  },
  {
    key: 'can_run_payroll',
    label: 'Run payroll',
    desc: 'Eden can execute pay runs and log salary payments for workers',
    risk: 'medium',
  },
  {
    key: 'can_edit_records',
    label: 'Edit records',
    desc: 'Eden can correct existing sales, expense, or mortality records',
    risk: 'medium',
  },
  {
    key: 'can_void_records',
    label: 'Delete / void records',
    desc: 'Eden can permanently delete records you ask it to remove — this cannot be undone',
    risk: 'high',
  },
];

const riskColor = (risk: 'low' | 'medium' | 'high') => ({
  low:    'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high:   'bg-red-50 text-red-700 border-red-200',
}[risk]);

const riskLabel = (risk: 'low' | 'medium' | 'high') => ({
  low: 'Low risk', medium: 'Confirm required', high: 'High risk',
}[risk]);

export function AIPermissionsSection() {
  const { currentFarm, currentRole } = useAuth();
  const { showToast } = useToast();
  const [perms, setPerms] = useState<AIPermissions>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentFarm?.id) return;
    load();
  }, [currentFarm?.id]);

  const load = async () => {
    try {
      const { data } = await supabase
        .from('farm_setup_config')
        .select('ai_permissions')
        .eq('farm_id', currentFarm!.id)
        .maybeSingle();
      if (data?.ai_permissions && Object.keys(data.ai_permissions).length > 0) {
        setPerms({ ...DEFAULTS, ...data.ai_permissions });
      }
    } catch {}
    finally { setLoading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from('farm_setup_config').upsert({
        farm_id: currentFarm!.id,
        ai_permissions: perms,
        updated_at: new Date().toISOString(),
      });
      showToast('Eden permissions saved', 'success');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      showToast('Failed to save: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof AIPermissions) => {
    setPerms(prev => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  if (currentRole !== 'owner' && currentRole !== 'manager') return null;
  if (loading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
        <div className="p-2 rounded-xl bg-indigo-50">
          <Bot className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">Eden AI Permissions</h3>
          <p className="text-xs text-gray-500">Control what Eden is allowed to do on your farm. All actions still require your confirmation before executing.</p>
        </div>
      </div>

      <div className="space-y-3">
        {PERMISSION_DEFS.map(p => (
          <div key={p.key} className="flex items-start justify-between gap-4 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-gray-900">{p.label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${riskColor(p.risk)}`}>
                  {riskLabel(p.risk)}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{p.desc}</p>
            </div>
            <button
              onClick={() => toggle(p.key)}
              className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                perms[p.key] ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                perms[p.key] ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        ))}
      </div>

      <div className="pt-2 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save permissions'}
        </button>
        <p className="text-xs text-gray-400">Only owners and managers can change these settings</p>
      </div>
    </div>
  );
}
