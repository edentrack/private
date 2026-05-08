import { ModuleName } from './navigationPermissions';
import { LucideIcon } from 'lucide-react';

/**
 * Navigation grouping — May 2026 rewrite per Greg's brief.
 *
 * Both mobile (More menu) and desktop (sidebar) consume this. The five
 * group buckets match the conceptual order a farmer thinks about their
 * day:
 *
 *   PRODUCTION   what the animals are doing       (eggs, mortality, weight, vaccines, harvest, breeding...)
 *   MONEY        cash flowing in and out          (expenses, sales, credit score)
 *   OPERATIONS   day-to-day running of the farm   (inventory, pond planner, shifts)
 *   INSIGHTS     reading the numbers              (insights, reports)
 *   ACCOUNT      who can do what                  (team, settings)
 *
 * Cooperatives was removed from nav in May 2026 per Greg's request. The
 * routes still respond at /cooperatives if accessed directly, and the
 * `src/components/cooperatives/` directory + DB tables are intact. If
 * cooperatives stays out of nav for >3 months, schedule a follow-up to
 * delete the directory + migrations.
 */

export interface NavigationItem {
  id: ModuleName;
  label: string;
  icon: LucideIcon;
  /** Optional red dot badge — currently used for the dead-letter queue
   *  count on the Settings entry. */
  badge?: number;
}

export type NavigationGroupId = 'production' | 'money' | 'operations' | 'insights' | 'account';

export interface NavigationGroup {
  id: NavigationGroupId;
  label: string;
  items: NavigationItem[];
}

/**
 * Membership map. Each module ID belongs to exactly one group. Items
 * not present here will not show up in any grouped view, so any new
 * module must be added.
 */
const GROUP_MEMBERSHIP: Record<NavigationGroupId, ReadonlyArray<ModuleName>> = {
  production: [
    // Poultry-specific
    'egg-records',
    'vaccinations',
    // Cross-species
    'mortality',
    'weight',
    // Aquaculture-specific
    'harvest',
    'water-quality',
    'sampling',
    'stocking',
    'fish-health',
    'pond-inspections',
    // Rabbits-specific
    'rabbit-harvest',
    'breeding-events',
    'litters',
    'rabbit-registry',
  ],
  money: ['expenses', 'sales', 'credit-score'],
  operations: ['inventory', 'pond-planner', 'shifts'],
  insights: ['insights', 'reports'],
  account: ['team', 'settings'],
};

const GROUP_ORDER: ReadonlyArray<{ id: NavigationGroupId; label: string; labelFr: string }> = [
  { id: 'production', label: 'PRODUCTION', labelFr: 'PRODUCTION' },
  { id: 'money', label: 'MONEY', labelFr: 'ARGENT' },
  { id: 'operations', label: 'OPERATIONS', labelFr: 'OPÉRATIONS' },
  { id: 'insights', label: 'INSIGHTS', labelFr: 'APERÇUS' },
  { id: 'account', label: 'ACCOUNT', labelFr: 'COMPTE' },
];

export function getNavigationGroups(items: NavigationItem[], isFr = false): NavigationGroup[] {
  return GROUP_ORDER
    .map(({ id, label, labelFr }) => ({
      id,
      label: isFr ? labelFr : label,
      items: items.filter(item => GROUP_MEMBERSHIP[id].includes(item.id)),
    }))
    .filter(group => group.items.length > 0);
}

const ALL_GROUP_IDS: ReadonlyArray<NavigationGroupId> = GROUP_ORDER.map(g => g.id);
const DEFAULT_EXPANDED = new Set<NavigationGroupId>(ALL_GROUP_IDS);

// Get expanded state from localStorage
export function getExpandedGroups(): Set<NavigationGroupId> {
  if (typeof window === 'undefined') return new Set(DEFAULT_EXPANDED);

  const saved = localStorage.getItem('navGroupsExpanded');
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as NavigationGroupId[];
      // Filter out any legacy group IDs from before the May 2026 rewrite.
      return new Set(parsed.filter((g): g is NavigationGroupId => ALL_GROUP_IDS.includes(g)));
    } catch {
      return new Set(DEFAULT_EXPANDED);
    }
  }

  // Default: all expanded
  return new Set(DEFAULT_EXPANDED);
}

// Save expanded state to localStorage
export function saveExpandedGroups(expanded: Set<NavigationGroupId>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('navGroupsExpanded', JSON.stringify(Array.from(expanded)));
}
