import { ModuleName } from './navigationPermissions';
import { LucideIcon } from 'lucide-react';

export interface NavigationItem {
  id: ModuleName;
  label: string;
  icon: LucideIcon;
}

export type NavigationGroupId = 'core' | 'production' | 'financial' | 'operations' | 'tools' | 'other';

export interface NavigationGroup {
  id: NavigationGroupId;
  label: string;
  items: NavigationItem[];
}

export function getNavigationGroups(
  items: NavigationItem[]
): NavigationGroup[] {
  const groups: NavigationGroup[] = [
    {
      id: 'core',
      label: 'CORE',
      items: items.filter(item => ['dashboard', 'flocks', 'insights'].includes(item.id)),
    },
    {
      id: 'production',
      label: 'PRODUCTION',
      items: items.filter(item => ['weight', 'vaccinations', 'inventory'].includes(item.id)),
    },
    {
      id: 'financial',
      label: 'FINANCIAL',
      items: items.filter(item => ['expenses', 'sales', 'payroll'].includes(item.id)),
    },
    {
      id: 'operations',
      label: 'OPERATIONS',
      items: items.filter(item => ['shifts', 'team', 'tasks', 'task-history'].includes(item.id)),
    },
    {
      id: 'tools',
      label: 'TOOLS',
      items: items.filter(item => ['compare', 'smart-upload', 'marketplace'].includes(item.id)),
    },
    {
      id: 'other',
      label: 'OTHER',
      items: items.filter(item => ['settings', 'roadmap'].includes(item.id)),
    },
  ];

  // Filter out groups with no items
  return groups.filter(group => group.items.length > 0);
}

// Get expanded state from localStorage
export function getExpandedGroups(): Set<NavigationGroupId> {
  if (typeof window === 'undefined') return new Set(['core', 'production', 'financial', 'operations', 'tools', 'other']);
  
  const saved = localStorage.getItem('navGroupsExpanded');
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as NavigationGroupId[];
      return new Set(parsed);
    } catch {
      return new Set(['core', 'production', 'financial', 'operations', 'tools', 'other']);
    }
  }
  
  // Default: all expanded
  return new Set(['core', 'production', 'financial', 'operations', 'tools', 'other']);
}

// Save expanded state to localStorage
export function saveExpandedGroups(expanded: Set<NavigationGroupId>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('navGroupsExpanded', JSON.stringify(Array.from(expanded)));
}
