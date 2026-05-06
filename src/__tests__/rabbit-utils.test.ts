import { describe, it, expect } from 'vitest';
import { calculateKindlingRate, classifyKindlingRate, formatKindlingRate } from '../utils/kindlingRate';
import { calculateRabbitFCR, classifyRabbitFCR, formatRabbitFCR } from '../utils/fcrRabbits';

describe('Kindling rate', () => {
  it('returns invalid when no does or no period', () => {
    expect(calculateKindlingRate({ weanedKits: 50, periodDays: 0, activeDoes: 5 }).status).toBe('invalid');
    expect(calculateKindlingRate({ weanedKits: 50, periodDays: 90, activeDoes: 0 }).status).toBe('invalid');
  });

  it('annualises correctly', () => {
    // 5 does, 90 days, 30 weaned → 30 × (365/90) / 5 = 24.3/year
    const r = calculateKindlingRate({ weanedKits: 30, periodDays: 90, activeDoes: 5 });
    expect(r.kitsPerDoePerYear).toBeGreaterThan(24);
    expect(r.kitsPerDoePerYear).toBeLessThan(25);
    expect(r.status).toBe('fair');
  });

  it('classifies excellence at 40+', () => {
    expect(classifyKindlingRate(45).status).toBe('excellent');
    expect(classifyKindlingRate(40).status).toBe('excellent');
    expect(classifyKindlingRate(35).status).toBe('good');
    expect(classifyKindlingRate(25).status).toBe('fair');
    expect(classifyKindlingRate(15).status).toBe('poor');
  });

  it('formats correctly', () => {
    expect(formatKindlingRate(34.7)).toBe('35/doe/yr');
  });
});

describe('Rabbit FCR', () => {
  it('returns null with reason when feed = 0', () => {
    const r = calculateRabbitFCR({ feedKg: 0, liveweightGainedKg: 100 });
    expect(r.fcr).toBeNull();
    expect(r.reason).toMatch(/no feed/i);
  });

  it('returns null with reason when no gain', () => {
    const r = calculateRabbitFCR({ feedKg: 200, liveweightGainedKg: 0 });
    expect(r.fcr).toBeNull();
    expect(r.reason).toMatch(/liveweight/i);
  });

  it('classifies meat rabbit thresholds', () => {
    expect(classifyRabbitFCR(3.0).status).toBe('excellent');
    expect(classifyRabbitFCR(3.5).status).toBe('acceptable');
    expect(classifyRabbitFCR(4.0).status).toBe('high');
  });

  it('breeder rabbits have looser thresholds', () => {
    expect(classifyRabbitFCR(3.4, 'Breeder Rabbits').status).toBe('excellent');
    expect(classifyRabbitFCR(4.0, 'Breeder Rabbits').status).toBe('acceptable');
    expect(classifyRabbitFCR(5.0, 'Breeder Rabbits').status).toBe('high');
  });

  it('formats FCR', () => {
    expect(formatRabbitFCR(3.456)).toBe('3.46');
    expect(formatRabbitFCR(null)).toBe('—');
  });
});
