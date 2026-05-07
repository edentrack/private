import { describe, it, expect } from 'vitest';
import { sortActionsByDependency } from '../utils/actionDependencyOrder';

/**
 * BUG-033 regression coverage.
 *
 * Eden's rabbit onboarding emitted bulk actions in a sensible-looking
 * order ("create the rabbitry, then register the doe, then log her
 * kindling"), but the executor processed them as-given. When Eden's
 * order drifted (e.g. it emitted LOG_KINDLING before REGISTER_RABBIT
 * because the user mentioned them in that order in chat), the kindling
 * insert raced ahead of the doe creation and the run partially failed.
 *
 * The sort below pins dependency order so the run is robust to whatever
 * order Eden produces.
 */

describe('sortActionsByDependency', () => {
  it('puts CREATE_RABBITRY before REGISTER_RABBIT before LOG_KINDLING', () => {
    const result = sortActionsByDependency([
      { type: 'LOG_KINDLING', doe_tag: 'D-01' },
      { type: 'REGISTER_RABBIT', tag: 'D-01' },
      { type: 'CREATE_RABBITRY', name: 'Backyard Rabbitry' },
    ]);
    expect(result.map((a) => a.type)).toEqual([
      'CREATE_RABBITRY',
      'REGISTER_RABBIT',
      'LOG_KINDLING',
    ]);
  });

  it('CREATE_FARM is always first regardless of input order', () => {
    const result = sortActionsByDependency([
      { type: 'LOG_MORTALITY' },
      { type: 'CREATE_FLOCK' },
      { type: 'CREATE_FARM' },
    ]);
    expect(result[0].type).toBe('CREATE_FARM');
  });

  it('LOG_BIRD_SALE / LOG_EGG_SALE come after the events they reference', () => {
    const result = sortActionsByDependency([
      { type: 'LOG_BIRD_SALE' },
      { type: 'LOG_MORTALITY' },
      { type: 'LOG_EGGS' },
    ]);
    expect(result.map((a) => a.type)).toEqual([
      'LOG_MORTALITY',
      'LOG_EGGS',
      'LOG_BIRD_SALE',
    ]);
  });

  it('LOG_WEANING comes after LOG_KINDLING', () => {
    const result = sortActionsByDependency([
      { type: 'LOG_WEANING', doe_tag: 'D-01' },
      { type: 'LOG_KINDLING', doe_tag: 'D-01' },
    ]);
    expect(result.map((a) => a.type)).toEqual(['LOG_KINDLING', 'LOG_WEANING']);
  });

  it('preserves original order within the same priority tier (stable sort)', () => {
    const result = sortActionsByDependency([
      { type: 'LOG_MORTALITY', cause: 'A' },
      { type: 'LOG_MORTALITY', cause: 'B' },
      { type: 'LOG_MORTALITY', cause: 'C' },
    ]);
    expect(result.map((a) => (a as any).cause)).toEqual(['A', 'B', 'C']);
  });

  it('full rabbit onboarding example from BUG-033 sorts correctly', () => {
    // The actual Eden output that broke in Phase 3 of the stress test.
    const eden = [
      { type: 'LOG_KINDLING', doe_tag: 'Doe-01', kits_born_alive: 8 },
      { type: 'LOG_RABBIT_LOSS', count: 2, cause: 'heat stress' },
      { type: 'CREATE_RABBITRY', name: 'Backyard Rabbitry', count: 25 },
      { type: 'REGISTER_RABBIT', tag: 'Doe-01', sex: 'doe' },
      { type: 'REGISTER_RABBIT', tag: 'Buck-01', sex: 'buck' },
    ];
    const ordered = sortActionsByDependency(eden);
    const types = ordered.map((a) => a.type);
    // Tier 1 (CREATE_RABBITRY) before Tier 2 (REGISTER_RABBIT) before
    // Tier 3 (LOG_KINDLING) before Tier 4 (LOG_RABBIT_LOSS).
    expect(types.indexOf('CREATE_RABBITRY')).toBeLessThan(types.indexOf('REGISTER_RABBIT'));
    expect(types.indexOf('REGISTER_RABBIT')).toBeLessThan(types.indexOf('LOG_KINDLING'));
    expect(types.indexOf('LOG_KINDLING')).toBeLessThan(types.indexOf('LOG_RABBIT_LOSS'));
  });

  it('handles unknown action types deterministically (default priority)', () => {
    const result = sortActionsByDependency([
      { type: 'NEW_FUTURE_ACTION_TYPE' },
      { type: 'CREATE_FARM' },
      { type: 'LOG_BIRD_SALE' },
    ]);
    // CREATE_FARM (0) < unknown (10) < LOG_BIRD_SALE (8).
    // Unknown actions sort at default priority 10, AFTER LOG_BIRD_SALE (8).
    expect(result.map((a) => a.type)).toEqual([
      'CREATE_FARM',
      'LOG_BIRD_SALE',
      'NEW_FUTURE_ACTION_TYPE',
    ]);
  });

  it('returns a new array — does not mutate the input', () => {
    const input = [
      { type: 'LOG_KINDLING' },
      { type: 'REGISTER_RABBIT' },
    ];
    const inputBefore = [...input];
    sortActionsByDependency(input);
    expect(input.map((a) => a.type)).toEqual(inputBefore.map((a) => a.type));
  });
});
