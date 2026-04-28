import { ModuleName } from './navigationPermissions';
import { LucideIcon } from 'lucide-react';

export interface NavigationItem {
  id: ModuleName;
  label: string;
  icon: LucideIcon;
}

export type NavigationGroupId = 'analytics' | 'health' | 'money' | 'team' | 'other';

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
      id: 'analytics',
      label: 'ANALYTICS',
      items: items.filter(item => ['insights'].includes(item.id)),
    },
    {
      id: 'health',
      label: 'HEALTH',
      items: items.filter(item => ['vaccinations', 'weight'].includes(item.id)),
    },
    {
      id: 'money',
      label: 'MONEY',
      items: items.filter(item => ['expenses', 'sales', 'inventory'].includes(item.id)),
    },
    {
      id: 'team',
      label: 'TEAM & OPS',
      items: items.filter(item => ['team', 'shifts'].includes(item.id)),
    },
    {
      id: 'other',
      label: 'OTHER',
      items: items.filter(item => ['settings'].includes(item.id)),
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
      return new Set(['analytics', 'health', 'money', 'team', 'other']);
    }
  }

  // Default: all expanded
  return new Set(['analytics', 'health', 'money', 'team', 'other']);
}

// Save expanded state to localStorage
export function saveExpandedGroups(expanded: Set<NavigationGroupId>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('navGroupsExpanded', JSON.stringify(Array.from(expanded)));
}
