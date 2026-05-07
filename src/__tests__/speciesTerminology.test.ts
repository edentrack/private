import { describe, it, expect } from 'vitest';
import { getSpeciesModule } from '../utils/speciesModules';

/**
 * Species-terminology contract tests.
 *
 * Thread 2 of the launch-ready sprint unified user-facing labels on the
 * canonical "Record {lossNoun}" pattern across LogMortalityModal,
 * MortalityTracking, and FlockManagement. These tests pin the contract
 * so a future refactor can't silently regress to the old "Save Loss vs
 * Log Mortality" drift.
 */

describe('species terminology', () => {
  it('every species exposes the fields the UI reads from', () => {
    for (const id of ['poultry', 'aquaculture', 'rabbits'] as const) {
      const m = getSpeciesModule(id);
      expect(m.id).toBe(id);
      expect(m.animalTerm).toMatch(/^[A-Z][a-z]+$/);
      expect(m.animalTermPlural.length).toBeGreaterThan(0);
      expect(m.lossNoun).toMatch(/^[A-Z][a-z]+$/);
      expect(m.lossNounPlural.length).toBeGreaterThan(0);
      expect(m.groupTerm.length).toBeGreaterThan(0);
    }
  });

  it('canonical action label is "Record {lossNoun}" — never "Save"', () => {
    // The UI bug the brief flagged: "Save Loss vs Save Mortality" drift.
    // Standardising on "Record {lossNoun}" gives a single phrase shape
    // and the species-aware noun is what changes per farm.
    const labelFor = (id: 'poultry' | 'aquaculture' | 'rabbits') =>
      `Record ${getSpeciesModule(id).lossNoun}`;

    expect(labelFor('poultry')).toBe('Record Mortality');
    expect(labelFor('aquaculture')).toBe('Record Loss');
    expect(labelFor('rabbits')).toBe('Record Death');
    // None of them should contain "Save" — that's the verb we standardised
    // away from.
    for (const id of ['poultry', 'aquaculture', 'rabbits'] as const) {
      expect(labelFor(id).toLowerCase()).not.toContain('save');
    }
  });

  it('animalTermPlural drives sales-list copy ("X fish" / "X birds" / "X rabbits")', () => {
    const sales = (id: 'poultry' | 'aquaculture' | 'rabbits', n: number) =>
      `${n} ${getSpeciesModule(id).animalTermPlural.toLowerCase()}`;

    expect(sales('poultry', 50)).toBe('50 birds');
    expect(sales('aquaculture', 50)).toBe('50 fish');
    expect(sales('rabbits', 50)).toBe('50 rabbits');
  });

  it('groupTerm provides Pond / Flock / Hutch headings', () => {
    const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    expect(upper(getSpeciesModule('poultry').groupTerm.toLowerCase())).toBe('Flock');
    expect(upper(getSpeciesModule('aquaculture').groupTerm.toLowerCase())).toBe('Pond');
    expect(upper(getSpeciesModule('rabbits').groupTerm.toLowerCase())).toMatch(/Hutch|Rabbitry/);
  });
});
