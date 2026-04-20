import { UserRole } from '../types/database';

export function canViewInventoryCosts(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canViewInventoryQuantities(role: UserRole): boolean {
  return true;
}

export function canEditExpenses(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canDeleteRecords(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canManageFlocks(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canViewAnalytics(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canCompleteTasksAnytime(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canManageInventory(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canCreateTaskTemplates(role: UserRole): boolean {
  return role === 'owner' || role === 'manager';
}
