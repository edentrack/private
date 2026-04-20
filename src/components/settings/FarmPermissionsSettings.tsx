import { useEffect, useState } from 'react';
import { Shield, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { FarmPermissions } from '../../types/database';

export function FarmPermissionsSettings() {
  const { t } = useTranslation();
  const { currentFarm, currentRole } = useAuth();
  const { farmPermissions, refreshPermissions } = usePermissions();
  const [localPermissions, setLocalPermissions] = useState<Partial<FarmPermissions>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (farmPermissions) {
      setLocalPermissions(farmPermissions);
      setLoading(false);
    } else if (currentFarm?.id) {
      setLocalPermissions({
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
        managers_can_edit_feed_water: false,
        managers_can_edit_eggs: false,
      });
      setLoading(false);
    }
  }, [farmPermissions, currentFarm?.id]);

  const handleToggle = (key: keyof FarmPermissions) => {
    setLocalPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = async () => {
    if (!currentFarm?.id) return;

    try {
      setSaving(true);
      setMessage('');

      const { error } = await supabase
        .from('farm_permissions')
        .upsert({
          farm_id: currentFarm.id,
          ...localPermissions,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      await refreshPermissions();

      setMessage(t('settings.permissions_saved') || 'Permissions saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving permissions:', error);
      setMessage(t('settings.permissions_save_failed') || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  if (currentRole !== 'owner') {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-4">
        <div className="text-center py-8 text-gray-500">
          {t('settings.loading_permissions') || 'Loading permissions...'}
        </div>
      </div>
    );
  }

  const permissionGroups = [
    {
      title: t('settings.permissions_financial_access') || 'Financial Access',
      description: t('settings.permissions_financial_desc') || 'Control manager access to financial data and operations',
      permissions: [
        {
          key: 'managers_can_view_financials' as keyof FarmPermissions,
          label: t('settings.permissions_view_financials') || 'View Financials',
          description: t('settings.permissions_view_financials_desc') || 'Allows managers to view expenses, sales, revenue, and profit data'
        },
        {
          key: 'managers_can_create_expenses' as keyof FarmPermissions,
          label: t('settings.permissions_create_expenses') || 'Create & Edit Expenses',
          description: t('settings.permissions_create_expenses_desc') || 'Allows managers to add and modify expense records'
        },
        {
          key: 'managers_can_create_sales' as keyof FarmPermissions,
          label: t('settings.permissions_create_sales') || 'Create & Edit Sales',
          description: t('settings.permissions_create_sales_desc') || 'Allows managers to create and manage sales, receipts, and invoices'
        },
        {
          key: 'managers_can_edit_flock_costs' as keyof FarmPermissions,
          label: t('settings.permissions_edit_flock_costs') || 'Edit Flock Costs',
          description: t('settings.permissions_edit_flock_costs_desc') || 'Allows managers to modify flock purchase prices and transport costs'
        },
      ]
    },
    {
      title: t('settings.permissions_operations') || 'Operations Management',
      description: t('settings.permissions_operations_desc') || 'Control manager access to operational features',
      permissions: [
        {
          key: 'managers_can_manage_inventory' as keyof FarmPermissions,
          label: t('settings.permissions_manage_inventory') || 'Manage Inventory',
          description: t('settings.permissions_manage_inventory_desc') || 'Allows managers to add feed types, adjust stock, and track inventory'
        },
        {
          key: 'managers_can_edit_shift_templates' as keyof FarmPermissions,
          label: t('settings.permissions_edit_shifts') || 'Edit Shift Templates',
          description: t('settings.permissions_edit_shifts_desc') || 'Allows managers to create and modify recurring shift schedules'
        },
        {
          key: 'managers_can_mark_vaccinations' as keyof FarmPermissions,
          label: t('settings.permissions_mark_vaccinations') || 'Mark Vaccinations',
          description: t('settings.permissions_mark_vaccinations_desc') || 'Allows managers to record vaccination administration'
        },
        {
          key: 'managers_can_edit_feed_water' as keyof FarmPermissions,
          label: t('settings.permissions_edit_feed_water') || 'Edit Feed & Water Records',
          description: t('settings.permissions_edit_feed_water_desc') || 'Allows managers to edit feed and water consumption records by week'
        },
        {
          key: 'managers_can_edit_eggs' as keyof FarmPermissions,
          label: t('settings.permissions_edit_eggs') || 'Edit Egg Records',
          description: t('settings.permissions_edit_eggs_desc') || 'Allows managers to edit egg collection and egg sale records when there is a recording error'
        },
      ]
    },
    {
      title: t('settings.permissions_team_payroll') || 'Team & Payroll',
      description: t('settings.permissions_team_payroll_desc') || 'Control manager access to sensitive team operations',
      permissions: [
        {
          key: 'managers_can_manage_team' as keyof FarmPermissions,
          label: t('settings.permissions_manage_team') || 'Manage Team',
          description: t('settings.permissions_manage_team_desc') || 'Allows managers to invite members, change roles, and manage team status'
        },
        {
          key: 'managers_can_manage_payroll' as keyof FarmPermissions,
          label: t('settings.permissions_manage_payroll') || 'Manage Payroll',
          description: t('settings.permissions_manage_payroll_desc') || 'Allows managers to process payroll runs and adjustments'
        },
      ]
    },
    {
      title: t('settings.permissions_data_management') || 'Data Management',
      description: t('settings.permissions_data_management_desc') || 'Control destructive operations',
      permissions: [
        {
          key: 'managers_can_delete_records' as keyof FarmPermissions,
          label: t('settings.permissions_delete_records') || 'Delete Records',
          description: t('settings.permissions_delete_records_desc') || 'Allows managers to permanently delete records across the system'
        },
      ]
    },
  ];

  return (
    <div className="bg-white rounded-3xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-100 rounded-xl">
            <Shield className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">{t('settings.manager_permissions') || 'Manager Permissions'}</h3>
            <p className="text-sm text-gray-600">{t('settings.manager_permissions_desc') || 'Control what managers can access and do'}</p>
          </div>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
          message.includes('success')
            ? 'bg-green-50 text-green-600'
            : 'bg-red-50 text-red-600'
        }`}>
          {message}
        </div>
      )}

      <div className="space-y-4">
        {permissionGroups.map((group, groupIndex) => (
          <div key={groupIndex}>
            <div className="mb-4">
              <h4 className="text-base font-semibold text-gray-900">{group.title}</h4>
              <p className="text-sm text-gray-500">{group.description}</p>
            </div>
            <div className="space-y-3">
              {group.permissions.map((permission) => (
                <div
                  key={permission.key}
                  className="flex items-start justify-between p-4 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor={permission.key}
                        className="font-medium text-gray-900 cursor-pointer"
                      >
                        {permission.label}
                      </label>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {permission.description}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-4">
                    <input
                      id={permission.key}
                      type="checkbox"
                      checked={Boolean(typeof localPermissions[permission.key] === 'boolean' && localPermissions[permission.key])}
                      onChange={() => handleToggle(permission.key)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3D5F42]"></div>
                  </label>
                </div>
              ))}
            </div>
            {groupIndex < permissionGroups.length - 1 && (
              <div className="border-t border-gray-200 mt-4"></div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4632] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              {t('settings.saving') || 'Saving...'}
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              {t('settings.save_permissions') || 'Save Permissions'}
            </>
          )}
        </button>
      </div>

      <div className="mt-4 p-4 bg-blue-50 rounded-xl">
        <p className="text-sm text-blue-800">
          <strong>{t('settings.note') || 'Note:'}</strong> {t('settings.permissions_note') || 'These permissions only affect managers. Owners always have full access, workers have limited task access, and viewers are read-only across the entire system.'}
        </p>
      </div>
    </div>
  );
}
