/**
 * Dashboard Preferences Utility
 * Manages user preferences for dashboard widget visibility
 */

export interface DashboardWidget {
  id: string;
  name: string;
  category: 'overview' | 'production' | 'tasks' | 'analytics' | 'quick_actions';
  defaultVisible: boolean;
}

export const AVAILABLE_WIDGETS: DashboardWidget[] = [
  { id: 'today_tasks', name: 'Today\'s Tasks', category: 'tasks', defaultVisible: true },
  { id: 'egg_collection', name: 'Egg Collection', category: 'production', defaultVisible: true },
  { id: 'production_cycle', name: 'Production Cycle', category: 'production', defaultVisible: true },
  { id: 'weight_input', name: 'Weight Input', category: 'production', defaultVisible: true },
  { id: 'weight_progress', name: 'Weight Progress', category: 'production', defaultVisible: true },
  { id: 'inventory_usage', name: 'Inventory Usage', category: 'overview', defaultVisible: true },
  { id: 'alerts', name: 'Alerts', category: 'analytics', defaultVisible: true },
  { id: 'kpis', name: 'Key Performance Indicators', category: 'analytics', defaultVisible: true },
  { id: 'daily_summary', name: 'Daily Summary', category: 'analytics', defaultVisible: true },
  { id: 'quick_sales', name: 'Quick Sales', category: 'quick_actions', defaultVisible: true },
  { id: 'quick_inventory', name: 'Quick Inventory', category: 'quick_actions', defaultVisible: true },
];

const STORAGE_KEY = 'dashboard_widget_preferences';

let _prefCache: Set<string> | null = null;

export function getDashboardPreferences(): Set<string> {
  if (_prefCache) return _prefCache;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      _prefCache = new Set(parsed.visibleWidgets || []);
      return _prefCache;
    }
  } catch (e) {
    console.warn('Failed to load dashboard preferences:', e);
  }
  _prefCache = new Set(
    AVAILABLE_WIDGETS
      .filter(w => w.defaultVisible)
      .map(w => w.id)
  );
  return _prefCache;
}

export function saveDashboardPreferences(visibleWidgets: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      visibleWidgets: Array.from(visibleWidgets),
      updatedAt: new Date().toISOString(),
    }));
    _prefCache = new Set(visibleWidgets);
  } catch (e) {
    console.warn('Failed to save dashboard preferences:', e);
  }
}

export function isWidgetVisible(widgetId: string): boolean {
  const preferences = getDashboardPreferences();
  return preferences.has(widgetId);
}

export function toggleWidget(widgetId: string, visible: boolean) {
  const preferences = getDashboardPreferences();
  if (visible) {
    preferences.add(widgetId);
  } else {
    preferences.delete(widgetId);
  }
  saveDashboardPreferences(preferences);
}











