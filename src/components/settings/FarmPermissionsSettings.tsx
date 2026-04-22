import { useEffect, useState } from 'react';
import { Shield, Save, Users, HardHat, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { FarmPermissions } from '../../types/database';

type RoleTab = 'manager' | 'worker' | 'viewer';

const DEFAULTS: Partial<FarmPermissions> = {
  // Manager
  managers_can_view_financials: true,
  managers_can_create_expenses: true,
  managers_can_create_sales: true,
  managers_can_manage_inventory: true,
  managers_can_manage_payroll: false,
  managers_can_manage_team: false,
  managers_can_edit_flock_costs: false,
  managers_can_delete_records: false,
  managers_can_edit_shift_templates: true,
  managers_can_mark_vaccinations: true,
  managers_can_edit_feed_water: true,
  managers_can_edit_eggs: false,
  managers_can_use_smart_import: true,
  managers_can_view_analytics: true,
  managers_can_use_eden_ai: true,
  // Worker
  workers_can_log_mortality: true,
  workers_can_log_eggs: true,
  workers_can_log_weight: false,
  workers_can_use_eden_ai: true,
  workers_can_view_financials: false,
};

interface PermissionGroup {
  title: string;
  description: string;
  permissions: {
    key: keyof FarmPermissions;
    label: string;
    description: string;
    warning?: string;
  }[];
}

const MANAGER_GROUPS: PermissionGroup[] = [
  {
    title: 'Financial Access',
    description: 'What financial data and operations managers can see and perform',
    permissions: [
      { key: 'managers_can_view_financials', label: 'View Expenses & Sales', description: 'See expense records, sales, revenue and P&L data' },
      { key: 'managers_can_view_analytics', label: 'View Analytics & Insights', description: 'Access the Analytics dashboard, KPIs, and Insights page' },
      { key: 'managers_can_create_expenses', label: 'Add & Edit Expenses', description: 'Create and modify expense records on behalf of the farm' },
      { key: 'managers_can_create_sales', label: 'Record Sales & Receipts', description: 'Create bird sales, egg sales and print receipts' },
      { key: 'managers_can_edit_flock_costs', label: 'Edit Flock Purchase Costs', description: 'Modify the initial cost and transport cost of a flock' },
    ],
  },
  {
    title: 'Operations',
    description: 'Day-to-day farm operations the manager can control',
    permissions: [
      { key: 'managers_can_manage_inventory', label: 'Manage Inventory', description: 'Add feed types, adjust stock levels, and log usage' },
      { key: 'managers_can_edit_shift_templates', label: 'Edit Shift Templates', description: 'Create and modify recurring shift schedules' },
      { key: 'managers_can_mark_vaccinations', label: 'Record Vaccinations', description: 'Mark vaccinations as administered and add vet log entries' },
      { key: 'managers_can_edit_feed_water', label: 'Edit Feed & Water Records', description: 'Adjust weekly feed and water consumption logs' },
      { key: 'managers_can_edit_eggs', label: 'Edit Egg Records', description: 'Correct egg collection and egg sale records' },
      { key: 'managers_can_use_smart_import', label: 'Use Smart Import', description: 'Upload receipts and documents to auto-import records' },
      { key: 'managers_can_use_eden_ai', label: 'Use Eden AI', description: 'Chat with Eden for health advice, diagnostics, and quick logging' },
    ],
  },
  {
    title: 'Team & Payroll',
    description: 'Sensitive people-management permissions',
    permissions: [
      { key: 'managers_can_manage_team', label: 'Manage Team Members', description: 'Invite workers, change roles, deactivate members' },
      { key: 'managers_can_manage_payroll', label: 'Process Payroll', description: 'Run payroll, adjust salaries, and record payments' },
    ],
  },
  {
    title: 'Data Danger Zone',
    description: 'Irreversible operations — grant with care',
    permissions: [
      {
        key: 'managers_can_delete_records',
        label: 'Delete Records',
        description: 'Permanently delete expenses, sales, flocks, and other records',
        warning: 'Deletions cannot be undone',
      },
    ],
  },
];

const WORKER_GROUPS: PermissionGroup[] = [
  {
    title: 'Data Logging',
    description: 'What workers can record directly from their phone',
    permissions: [
      { key: 'workers_can_log_mortality', label: 'Log Mortality', description: 'Workers can report dead birds and enter cause of death' },
      { key: 'workers_can_log_eggs', label: 'Log Egg Collections', description: 'Workers can record daily egg counts by size and damage' },
      { key: 'workers_can_log_weight', label: 'Log Bird Weights', description: 'Workers can record weight samples for FCR tracking' },
    ],
  },
  {
    title: 'Tools & Visibility',
    description: 'Features and data workers can access',
    permissions: [
      { key: 'workers_can_use_eden_ai', label: 'Use Eden AI', description: 'Workers can chat with Eden for health advice and quick logging' },
      { key: 'workers_can_view_financials', label: 'View Financial Data', description: 'Workers can see expenses, sales, and profit figures' },
    ],
  },
];

// Viewer role is always read-only everywhere — no toggles needed, just show a summary
const VIEWER_INFO = [
  { label: 'Dashboard & Flocks', access: 'Read only' },
  { label: 'Tasks & Shifts', access: 'Read only' },
  { label: 'Expenses & Sales', access: 'Read only' },
  { label: 'Inventory & Feed', access: 'Read only' },
  { label: 'Mortality & Weight', access: 'Read only' },
  { label: 'Vaccinations & Vet Log', access: 'Read only' },
  { label: 'Analytics & Insights', access: 'Read only' },
  { label: 'Eden AI', access: 'Full access' },
  { label: 'Team & Payroll', access: 'No access' },
  { label: 'Settings & Billing', access: 'No access' },
  { label: 'Smart Import', access: 'No access' },
];

export function FarmPermissionsSettings() {
  const { t } = useTranslation();
  const { currentFarm, currentRole } = useAuth();
  const { farmPermissions, refreshPermissions } = usePermissions();
  const [local, setLocal] = useState<Partial<FarmPermissions>>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RoleTab>('manager');

  useEffect(() => {
    if (farmPermissions) {
      setLocal(farmPermissions);
      setLoading(false);
    } else if (currentFarm?.id) {
      setLocal(DEFAULTS);
      setLoading(false);
    }
  }, [farmPermissions, currentFarm?.id]);

  const toggle = (key: keyof FarmPermissions) => {
    setLocal(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!currentFarm?.id) return;
    setSaving(true);
    setMessage('');
    try {
      const { error } = await supabase.from('farm_permissions').upsert({
        farm_id: currentFarm.id,
        ...local,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await refreshPermissions();
      setMessage('Permissions saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  if (currentRole !== 'owner') return null;
  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-6">
        <div className="text-center py-8 text-gray-500">Loading permissions...</div>
      </div>
    );
  }

  const TABS: { id: RoleTab; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'manager', label: 'Manager', icon: <Users className="w-4 h-4" />, color: 'blue' },
    { id: 'worker',  label: 'Worker',  icon: <HardHat className="w-4 h-4" />, color: 'amber' },
    { id: 'viewer',  label: 'Viewer',  icon: <Eye className="w-4 h-4" />,    color: 'gray' },
  ];

  const activeGroups = activeTab === 'manager' ? MANAGER_GROUPS : activeTab === 'worker' ? WORKER_GROUPS : [];

  return (
    <div className="bg-white rounded-3xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-amber-100 rounded-xl">
          <Shield className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Role Permissions</h3>
          <p className="text-sm text-gray-500">Control what each role can see and do on your farm</p>
        </div>
      </div>

      {/* Role tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Role description banner */}
      {activeTab === 'manager' && (
        <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-800">
          <strong>Manager</strong> — trusted team lead. Has most operational access by default. Use these toggles to restrict sensitive areas like financials and payroll.
        </div>
      )}
      {activeTab === 'worker' && (
        <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-100 text-sm text-amber-800">
          <strong>Worker</strong> — hands-on farm staff. Sees tasks, their shifts, and flock info. Can't touch financials, team management, or settings unless you enable it below.
        </div>
      )}
      {activeTab === 'viewer' && (
        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-700">
          <strong>Viewer</strong> — read-only access to most data. Useful for investors, advisors, or external auditors. Cannot create, edit, or delete anything. No configuration needed.
        </div>
      )}

      {/* Save feedback */}
      {message && (
        <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium ${
          message.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      {/* Viewer — static summary */}
      {activeTab === 'viewer' && (
        <div className="space-y-2">
          {VIEWER_INFO.map(item => (
            <div key={item.label} className="flex items-center justify-between py-3 px-4 border border-gray-100 rounded-xl">
              <span className="text-sm font-medium text-gray-800">{item.label}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                item.access === 'Full access'
                  ? 'bg-green-100 text-green-700'
                  : item.access === 'Read only'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {item.access}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Manager / Worker — toggle groups */}
      {activeTab !== 'viewer' && (
        <div className="space-y-6">
          {activeGroups.map((group, gi) => (
            <div key={gi}>
              <div className="mb-3">
                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{group.title}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
              </div>
              <div className="space-y-2">
                {group.permissions.map(perm => {
                  const value = Boolean(local[perm.key]);
                  return (
                    <div
                      key={perm.key}
                      className={`flex items-start justify-between p-4 border rounded-xl transition-colors ${
                        value ? 'border-green-200 bg-green-50/30' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex-1 pr-4">
                        <p className="text-sm font-semibold text-gray-900">{perm.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{perm.description}</p>
                        {perm.warning && (
                          <p className="text-xs text-red-600 font-medium mt-1">⚠ {perm.warning}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(perm.key)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                          value ? 'bg-[#3D5F42]' : 'bg-gray-200'
                        }`}
                        aria-checked={value}
                        role="switch"
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            value ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
              {gi < activeGroups.length - 1 && <div className="border-t border-gray-100 mt-4" />}
            </div>
          ))}

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4632] transition-colors disabled:opacity-50 font-medium"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save {activeTab === 'manager' ? 'Manager' : 'Worker'} Permissions
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
