export type Role = 'owner' | 'manager' | 'worker' | 'viewer';

export type ModuleId =
  | 'dashboard'
  | 'smart-dashboard'
  | 'flocks'
  | 'tasks'
  | 'inventory'
  | 'expenses'
  | 'sales'
  | 'analytics'
  | 'vaccinations'
  | 'vet-log'
  | 'mortality'
  | 'weight'
  | 'team'
  | 'shifts'
  | 'payroll'
  | 'settings'
  | 'smart-upload'
  | 'ai-assistant';

export type Action = 'view' | 'create' | 'edit' | 'delete';

export interface ModulePermissions {
  visible: boolean;
  actions: Action[];
  readOnly?: boolean;
}

export type RolePermissions = {
  [key in ModuleId]?: ModulePermissions;
};

export const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
  owner: {
    dashboard:       { visible: true, actions: ['view'] },
    'smart-dashboard': { visible: true, actions: ['view'] },
    flocks:          { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    tasks:           { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    inventory:       { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    expenses:        { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    sales:           { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    analytics:       { visible: true, actions: ['view'] },
    vaccinations:    { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    'vet-log':       { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    mortality:       { visible: true, actions: ['view', 'create', 'edit'] },
    weight:          { visible: true, actions: ['view', 'create', 'edit'] },
    team:            { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    shifts:          { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    payroll:         { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    settings:        { visible: true, actions: ['view', 'edit'] },
    'smart-upload':  { visible: true, actions: ['view', 'create'] },
    'ai-assistant':  { visible: true, actions: ['view', 'create'] },
  },
  manager: {
    dashboard:       { visible: true, actions: ['view'] },
    'smart-dashboard': { visible: true, actions: ['view'] },
    flocks:          { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    tasks:           { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    inventory:       { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    expenses:        { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    sales:           { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    analytics:       { visible: true, actions: ['view'] },
    vaccinations:    { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    'vet-log':       { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    mortality:       { visible: true, actions: ['view', 'create', 'edit'] },
    weight:          { visible: true, actions: ['view', 'create', 'edit'] },
    team:            { visible: true, actions: ['view'] },
    shifts:          { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    payroll:         { visible: true, actions: ['view', 'create', 'edit', 'delete'] },
    settings:        { visible: true, actions: ['view', 'edit'] },
    'smart-upload':  { visible: true, actions: ['view', 'create'] },
    'ai-assistant':  { visible: true, actions: ['view', 'create'] },
  },
  worker: {
    dashboard:       { visible: true, actions: ['view'] },
    flocks:          { visible: true, actions: ['view'], readOnly: true },
    tasks:           { visible: true, actions: ['view', 'edit'] },
    shifts:          { visible: true, actions: ['view'] },
    vaccinations:    { visible: true, actions: ['view'] },
    'vet-log':       { visible: true, actions: ['view'] },
    mortality:       { visible: true, actions: ['view', 'create'] }, // gated by workers_can_log_mortality
    weight:          { visible: false, actions: ['view', 'create'] }, // gated by workers_can_log_weight
    inventory:       { visible: false, actions: [] },
    expenses:        { visible: false, actions: [] },
    sales:           { visible: false, actions: [] },
    analytics:       { visible: false, actions: [] },
    team:            { visible: false, actions: [] },
    payroll:         { visible: false, actions: [] },
    settings:        { visible: true, actions: ['view', 'edit'] },
    'smart-upload':  { visible: false, actions: [] },
    'ai-assistant':  { visible: true, actions: ['view', 'create'] }, // gated by workers_can_use_eden_ai
    'smart-dashboard': { visible: false, actions: [] },
  },
  viewer: {
    dashboard:       { visible: true, actions: ['view'] },
    'smart-dashboard': { visible: true, actions: ['view'] },
    flocks:          { visible: true, actions: ['view'], readOnly: true },
    tasks:           { visible: true, actions: ['view'], readOnly: true },
    inventory:       { visible: true, actions: ['view'], readOnly: true },
    expenses:        { visible: true, actions: ['view'], readOnly: true },
    sales:           { visible: true, actions: ['view'], readOnly: true },
    analytics:       { visible: true, actions: ['view'], readOnly: true },
    vaccinations:    { visible: true, actions: ['view'], readOnly: true },
    'vet-log':       { visible: true, actions: ['view'], readOnly: true },
    mortality:       { visible: true, actions: ['view'], readOnly: true },
    weight:          { visible: true, actions: ['view'], readOnly: true },
    team:            { visible: false, actions: [] },
    shifts:          { visible: true, actions: ['view'], readOnly: true },
    payroll:         { visible: false, actions: [] },
    settings:        { visible: false, actions: [] },
    'smart-upload':  { visible: false, actions: [] },
    'ai-assistant':  { visible: true, actions: ['view', 'create'] },
  },
};

export function hasPermission(role: Role | null | undefined, moduleId: ModuleId, action: Action): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role]?.[moduleId];
  if (!permissions) return false;
  return permissions.visible && permissions.actions.includes(action);
}

export function isModuleVisible(role: Role | null | undefined, moduleId: ModuleId): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.[moduleId]?.visible ?? false;
}

export function isModuleReadOnly(role: Role | null | undefined, moduleId: ModuleId): boolean {
  if (!role) return true;
  return ROLE_PERMISSIONS[role]?.[moduleId]?.readOnly ?? false;
}

export function canManageTeam(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'manager';
}

export function canPromoteToOwner(role: Role | null | undefined): boolean {
  return role === 'owner';
}

export function canViewFinancials(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'manager' || role === 'viewer';
}
