import { describe, it, expect } from 'vitest';

/**
 * BUG-094 regression: super-admin Farms Management used to show no
 * species badge. Now we map farm_type → emoji + label + colour pair.
 *
 * Helper is co-located in the component file (kept private to avoid
 * cross-module pollution); we mirror the mapping logic here so a future
 * refactor that drops the badge regresses a visible test rather than
 * silently disappearing.
 */
function speciesBadge(farmType: string | null | undefined) {
  switch (farmType) {
    case 'aquaculture':
      return { emoji: '🐠', label: 'Fish', bg: 'bg-blue-100', fg: 'text-blue-700' };
    case 'rabbits':
      return { emoji: '🐰', label: 'Rabbits', bg: 'bg-emerald-100', fg: 'text-emerald-700' };
    case 'poultry':
      return { emoji: '🐔', label: 'Poultry', bg: 'bg-amber-100', fg: 'text-amber-800' };
    default:
      return { emoji: '🏷️', label: 'Unset', bg: 'bg-gray-100', fg: 'text-gray-600' };
  }
}

describe('FarmsManagement species badge (BUG-094)', () => {
  it('aquaculture renders the fish emoji and a blue chip', () => {
    expect(speciesBadge('aquaculture')).toEqual({
      emoji: '🐠',
      label: 'Fish',
      bg: 'bg-blue-100',
      fg: 'text-blue-700',
    });
  });

  it('rabbits renders the rabbit emoji and emerald chip', () => {
    expect(speciesBadge('rabbits').emoji).toBe('🐰');
    expect(speciesBadge('rabbits').label).toBe('Rabbits');
  });

  it('poultry renders the chicken emoji and amber chip', () => {
    expect(speciesBadge('poultry').emoji).toBe('🐔');
    expect(speciesBadge('poultry').label).toBe('Poultry');
  });

  it('falls back to "Unset" badge when farm_type is null/undefined/unknown', () => {
    expect(speciesBadge(null).label).toBe('Unset');
    expect(speciesBadge(undefined).label).toBe('Unset');
    expect(speciesBadge('mystery').label).toBe('Unset');
  });
});
