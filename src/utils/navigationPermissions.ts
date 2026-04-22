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
  | 'vet-log'
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
  // Manager defaults
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
  // Worker defaults
  workers_can_log_mortality: true,
  workers_can_log_eggs: true,
  workers_can_log_weight: false,
  workers_can_use_eden_ai: true,
  workers_can_view_financials: false,
  created_at: '',
  updated_at: '',
};

export function canViewModule(
  role: Role | null | undefined,
  moduleName: ModuleName,
  farmPermissions?: FarmPermissions | null
): ModuleVisibility {
  if (!role) return { visible: false, reason: 'No role assigned' };

  const normalizedRole = role.toLowerCase() as Role;
  const p = farmPermissions || DEFAULT_PERMISSIONS;

  switch (normalizedRole) {
    case 'owner':
      return { visible: true };
    case 'manager':
      return getManagerVisibility(moduleName, p);
    case 'worker':
      return getWorkerVisibility(moduleName, p);
    case 'viewer':
      return getViewerVisibility(moduleName);
    default:
      return { visible: false, reason: 'Unknown role' };
  }
}

function getManagerVisibility(m: ModuleName, p: FarmPermissions): ModuleVisibility {
  switch (m) {
    case 'ai-assistant':
      return { visible: p.managers_can_use_eden_ai ?? true };

    case 'dashboard':
    case 'smart-dashboard':
    case 'flocks':
    case 'tasks':
    case 'shifts':
    case 'vaccinations':
    case 'vet-log':
    case 'mortality':
    case 'weight':
    case 'marketplace':
    case 'roadmap':
    case 'task-history':
    case 'audit':
    case 'settings':
      return { visible: true };

    case 'smart-upload':
      return { visible: p.managers_can_use_smart_import };

    case 'inventory':
      return { visible: p.managers_can_manage_inventory };

    case 'expenses':
      return { visible: p.managers_can_view_financials };

    case 'sales':
      return { visible: p.managers_can_view_financials };

    case 'insights':
    case 'forecast':
    case 'compare':
      return { visible: p.managers_can_view_analytics || p.managers_can_view_financials };

    case 'analytics':
      return { visible: p.managers_can_view_analytics };

    case 'payroll':
      return { visible: p.managers_can_manage_payroll };

    case 'team':
      return { visible: p.managers_can_manage_team };

    case 'billing':
    case 'my-work':
      return { visible: false, reason: 'Owner only' };

    default:
      return { visible: false };
  }
}

function getWorkerVisibility(m: ModuleName, p: FarmPermissions): ModuleVisibility {
  switch (m) {
    case 'dashboard':
    case 'my-work':
    case 'tasks':
    case 'task-history':
    case 'shifts':
    case 'flocks':
    case 'vaccinations':
    case 'vet-log':
    case 'marketplace':
    case 'roadmap':
      return { visible: true };

    case 'ai-assistant':
      return { visible: p.workers_can_use_eden_ai };

    case 'mortality':
      return { visible: p.workers_can_log_mortality };

    case 'weight':
      return { visible: p.workers_can_log_weight };

    case 'inventory':
      return { visible: p.workers_can_log_eggs }; // inventory visible so eggs can be synced

    case 'expenses':
    case 'sales':
    case 'insights':
    case 'analytics':
    case 'forecast':
    case 'compare':
      return { visible: p.workers_can_view_financials };

    case 'smart-dashboard':
    case 'smart-upload':
    case 'payroll':
    case 'team':
    case 'audit':
    case 'billing':
      return { visible: false, reason: 'Not available for workers' };

    case 'settings':
      return { visible: true }; // language / profile only

    default:
      return { visible: false };
  }
}

function getViewerVisibility(m: ModuleName): ModuleVisibility {
  switch (m) {
    case 'dashboard':
    case 'smart-dashboard':
    case 'ai-assistant':
    case 'flocks':
    case 'tasks':
    case 'shifts':
    case 'vaccinations':
    case 'vet-log':
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
    case 'task-history':
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
      return { visible: false };
  }
}

export function canPerformAction(
  role: Role | null | undefined,
  action: 'create' | 'edit' | 'delete',
  context: string,
  farmPermissions?: FarmPermissions | null
): boolean {
  if (!role) return false;
  const p = farmPermissions || DEFAULT_PERMISSIONS;

  if (role === 'owner') return true;
  if (role === 'viewer') return false;

  if (role === 'worker') {
    if (action === 'edit' && context === 'task-completion') return true;
    if (action === 'create' && context === 'mortality') return p.workers_can_log_mortality;
    if (action === 'create' && context === 'egg-collection') return p.workers_can_log_eggs;
    if (action === 'create' && context === 'weight') return p.workers_can_log_weight;
    if (action === 'create' && context === 'eden-log') return p.workers_can_use_eden_ai;
    return false;
  }

  if (role === 'manager') {
    if (action === 'delete' && !p.managers_can_delete_records) return false;
    switch (context) {
      case 'expense':        return p.managers_can_create_expenses;
      case 'sale':
      case 'invoice':
      case 'receipt':        return p.managers_can_create_sales;
      case 'inventory':      return p.managers_can_manage_inventory;
      case 'payroll':        return p.managers_can_manage_payroll;
      case 'team':           return p.managers_can_manage_team;
      case 'flock-costs':    return action !== 'edit' || p.managers_can_edit_flock_costs;
      case 'shift-template': return p.managers_can_edit_shift_templates;
      case 'vaccination':    return p.managers_can_mark_vaccinations;
      case 'feed-water':     return p.managers_can_edit_feed_water;
      case 'egg-collection':
      case 'egg-sale':       return p.managers_can_edit_eggs;
      case 'smart-import':   return p.managers_can_use_smart_import;
      case 'flock':
      case 'task':
      case 'mortality':
      case 'weight':
      case 'eden-log':
        return true;
      default:
        return true;
    }
  }

  return false;
}

export function shouldHideFinancialData(role: Role | null | undefined, farmPermissions?: FarmPermissions | null): boolean {
  if (!role) return true;
  if (role === 'worker') return !(farmPermissions || DEFAULT_PERMISSIONS).workers_can_view_financials;
  return false;
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
  const all: ModuleName[] = [
    'dashboard', 'smart-dashboard', 'ai-assistant', 'my-work',
    'flocks', 'tasks', 'shifts', 'vaccinations', 'vet-log',
    'inventory', 'expenses', 'sales',
    'insights', 'analytics', 'forecast', 'compare',
    'mortality', 'weight', 'payroll', 'team',
    'task-history', 'audit', 'smart-upload', 'marketplace', 'roadmap',
    'settings', 'billing',
  ];
  return all.filter(mod => canViewModule(role, mod, farmPermissions).visible);
}
