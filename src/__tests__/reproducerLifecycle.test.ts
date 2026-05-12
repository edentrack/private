import { describe, it, expect } from 'vitest';
import { weeksSinceBirth } from '../lib/reproducerLifecycle/types';
import { SPEC_RABBITS, ACTIVE_SPECIES } from '../lib/reproducerLifecycle/specs';

/**
 * The reproducer-lifecycle module is the template that pigs / goats /
 * sheep / cattle / grasscutters will copy when they ship. These tests
 * lock the shape rather than the values — they catch a future "I
 * renamed a field on the spec and forgot to update the rabbit page".
 */

describe('weeksSinceBirth', () => {
  it('returns null for missing or invalid input', () => {
    expect(weeksSinceBirth(null)).toBeNull();
    expect(weeksSinceBirth('')).toBeNull();
    expect(weeksSinceBirth('not-a-date')).toBeNull();
  });

  it('returns 0 for today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(weeksSinceBirth(today)).toBe(0);
  });

  it('returns 1 for ~8 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 8);
    expect(weeksSinceBirth(d.toISOString().slice(0, 10))).toBe(1);
  });

  it('returns 12 for ~12 weeks (84 days) ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 84);
    // Allow 11 or 12 to absorb DST / boundary edge cases.
    const w = weeksSinceBirth(d.toISOString().slice(0, 10));
    expect(w === 11 || w === 12).toBe(true);
  });

  it('never returns a negative count for future dates', () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    expect(weeksSinceBirth(d.toISOString().slice(0, 10))).toBe(0);
  });
});

describe('SPEC_RABBITS shape', () => {
  it('exposes the canonical terminology', () => {
    expect(SPEC_RABBITS.id).toBe('rabbits');
    expect(SPEC_RABBITS.femaleBreederTerm).toBe('doe');
    expect(SPEC_RABBITS.maleBreederTerm).toBe('buck');
    expect(SPEC_RABBITS.offspringTerm).toBe('kit');
    expect(SPEC_RABBITS.birthEventTerm).toBe('kindling');
  });

  it('exposes table names the pages use', () => {
    expect(SPEC_RABBITS.tables.registry).toBe('rabbits');
    expect(SPEC_RABBITS.tables.growout).toBe('rabbit_growout_groups');
    expect(SPEC_RABBITS.tables.sales).toBe('rabbit_sales');
    expect(SPEC_RABBITS.tables.births).toBe('litters');
  });

  it('has plausible lifecycle durations', () => {
    expect(SPEC_RABBITS.lifecycle.gestationDays).toBe(31);
    expect(SPEC_RABBITS.lifecycle.weaningAgeWeeks).toBeGreaterThan(0);
    expect(SPEC_RABBITS.lifecycle.marketAgeWeeks).toBeGreaterThan(SPEC_RABBITS.lifecycle.weaningAgeWeeks);
  });
});

describe('ACTIVE_SPECIES list', () => {
  it('has exactly one species today (rabbits), and it is the canonical spec', () => {
    expect(ACTIVE_SPECIES).toHaveLength(1);
    expect(ACTIVE_SPECIES[0]).toBe(SPEC_RABBITS);
  });
});
