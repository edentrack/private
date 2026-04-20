import { Role } from './rolePermissions';
import { FarmPermissions } from '../types/database';

export type ModuleName =
  | 'dashboard'
  | 'smart-dashboard'
  | 'ai-assistant'
  | 'my-work'
  | 'flocks'
  | 'tasks'
  | 'shifts'
  | 'vaccinations'
  | 'inventory'
  | 'expenses'
  | 'sales'
  | 'insights'
  | 'analytics'
  | 'forecast'
  | 'compare'
  | 'mortality'
  | 'weight'
  | 'payroll'
  | 'team'
  | 'task-history'
  | 'audit'
  | 'settings'
  | 'billing'
  | 'smart-upload'
  | 'marketplace'
  | 'roadmap';

export interface ModuleVisibility {
  visible: boolean;
  reason?: string;
}

const DEFAULT_PERMISSIONS: FarmPermissions = {
  farm_id: '',
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
  created_at: '',
  updated_at: '',
};

export function canViewModule(
  role: Role | null | undefined,
  moduleName: ModuleName,
  farmPermissions?: FarmPermissions | null
): ModuleVisibility {
  if (!role) {
    return { visible: false, reason: 'No role assigned' };
  }

  // Normalize role for case-insensitive matching (DB may return different casing)
  const normalizedRole = typeof role === 'string' ? role.toLowerCase() : role;

  const permissions = farmPermissions || DEFAULT_PERMISSIONS;

  switch (normalizedRole) {
    case 'owner':
      return { visible: true };

    case 'manager':
      return getManagerModuleVisibility(moduleName, permissions);

    case 'worker':
      return getWorkerModuleVisibility(moduleName);

    case 'viewer':
      return getViewerModuleVisibility(moduleName);

    default:
      return { visible: false, reason: 'Unknown role' };
  }
}

function getManagerModuleVisibility(
  moduleName: ModuleName,
  permissions: FarmPermissions
): ModuleVisibility {
  switch (moduleName) {
    case 'dashboard':
    case 'smart-dashboard':
    case 'ai-assistant':
    case 'flocks':
    case 'tasks':
    case 'shifts':
    case 'vaccinations':
    case 'mortality':
    case 'weight':
    case 'smart-upload':
    case 'marketplace':
    case 'roadmap':
      return { visible: true };

    case 'inventory':
      return { visible: permissions.managers_can_manage_inventory };

    case 'expenses':
      return { visible: permissions.managers_can_view_financials };

    case 'sales':
      return { visible: permissions.managers_can_view_financials };

    case 'insights':
    case 'analytics':
    case 'forecast':
    case 'compare':
      return { visible: permissions.managers_can_view_financials };

    case 'payroll':
      return { visible: permissions.managers_can_manage_payroll };

    case 'team':
      return { visible: permissions.managers_can_manage_team };

    case 'audit':
      return { visible: true }; // Managers can view audit logs

    case 'settings':
      return { visible: true }; // Managers can access settings (Language, Growth Targets, Lifecycle)

    case 'billing':
      return { visible: false, reason: 'Owner only' };

    case 'my-work':
      return { visible: false, reason: 'Worker only' };

    default:
      return { visible: false, reason: 'Unknown module' };
  }
}

function getWorkerModuleVisibility(moduleName: ModuleName): ModuleVisibility {
  switch (moduleName) {
    case 'dashboard':
    case 'my-work':
    case 'tasks':
    case 'task-history':
    case 'shifts':
    case 'vaccinations':
    case 'flocks':
    case 'ai-assistant':
    case 'marketplace':
    case 'roadmap':
      return { visible: true };

    case 'smart-dashboard':
    case 'smart-upload':
    case 'inventory':
    case 'expenses':
    case 'sales':
    case 'insights':
    case 'analytics':
    case 'forecast':
    case 'compare':
    case 'mortality':
    case 'weight':
    case 'payroll':
    case 'team':
    case 'audit':
    case 'billing':
      return { visible: false, reason: 'Not available for workers' };

    case 'settings':
      return { visible: true }; // Workers can access language settings

    default:
      return { visible: false, reason: 'Unknown module' };
  }
}

function getViewerModuleVisibility(moduleName: ModuleName): ModuleVisibility {
  switch (moduleName) {
    case 'dashboard':
    case 'smart-dashboard':
    case 'ai-assistant':
    case 'flocks':
    case 'tasks':
    case 'shifts':
    case 'vaccinations':
    case 'inventory':
    case 'expenses':
    case 'sales':
    case 'insights':
    case 'analytics':
    case 'forecast':
    case 'compare':
    case 'mortality':
    case 'weight':
    case 'marketplace':
    case 'roadmap':
      return { visible: true };

    case 'smart-upload':
    case 'payroll':
    case 'team':
    case 'audit':
    case 'settings':
    case 'billing':
    case 'my-work':
      return { visible: false, reason: 'Not available for viewers' };

    default:
      return { visible: false, reason: 'Unknown module' };
  }
}

export function canPerformAction(
  role: Role | null | undefined,
  action: 'create' | 'edit' | 'delete',
  context: string,
  farmPermissions?: FarmPermissions | null
): boolean {
  if (!role) return false;

  const permissions = farmPermissions || DEFAULT_PERMISSIONS;

  if (role === 'owner') return true;

  if (role === 'viewer') return false;

  if (role === 'worker') {
    return action === 'edit' && context === 'task-completion';
  }

  if (role === 'manager') {
    if (action === 'delete' && !permissions.managers_can_delete_records) {
      return false;
    }

    switch (context) {
      case 'expense':
        return permissions.managers_can_create_expenses;
      case 'sale':
      case 'invoice':
      case 'receipt':
        return permissions.managers_can_create_sales;
      case 'inventory':
        return permissions.managers_can_manage_inventory;
      case 'payroll':
        return permissions.managers_can_manage_payroll;
      case 'team':
        return permissions.managers_can_manage_team;
      case 'flock-costs':
        return action !== 'edit' || permissions.managers_can_edit_flock_costs;
      case 'shift-template':
        return permissions.managers_can_edit_shift_templates;
      case 'vaccination':
        return permissions.managers_can_mark_vaccinations;
      case 'flock':
      case 'task':
      case 'mortality':
      case 'weight':
        return true;
      default:
        return true;
    }
  }

  return false;
}

export function shouldHideFinancialData(role: Role | null | undefined): boolean {
  if (!role) return true;
  return role === 'worker';
}

export function canAccessBilling(role: Role | null | undefined): boolean {
  return role === 'owner';
}

export function canManagePermissions(role: Role | null | undefined): boolean {
  return role === 'owner';
}

export function getVisibleModules(
  role: Role | null | undefined,
  farmPermissions?: FarmPermissions | null
): ModuleName[] {
  const allModules: ModuleName[] = [
    'dashboard',
    'smart-dashboard',
    'ai-assistant',
    'my-work',
    'flocks',
    'tasks',
    'shifts',
    'vaccinations',
    'inventory',
    'expenses',
    'sales',
    'insights',
    'analytics',
    'forecast',
    'compare',
    'mortality',
    'weight',
    'payroll',
    'team',
    'task-history',
    'audit',
    'smart-upload',
    'marketplace',
    'roadmap',
    'settings',
    'billing',
  ];

  return allModules.filter((module) => {
    const visibility = canViewModule(role, module, farmPermissions);
    return visibility.visible;
  });
}
