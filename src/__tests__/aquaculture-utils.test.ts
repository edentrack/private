import { describe, it, expect } from 'vitest';
import { calculateSGR, classifySGR, formatSGR } from '../utils/sgrAnalysis';
import { calculateFishFCR, classifyFishFCR, formatFCR } from '../utils/fcrAquaculture';
import { calculateHarvestReadiness } from '../utils/harvestReadiness';
import { calculateStockingDensity } from '../utils/stockingDensity';
import {
  classifyDO,
  classifyPH,
  classifyAmmonia,
  classifyNitrite,
  classifyTemperature,
  classifyAll,
} from '../utils/waterQualityThresholds';

describe('SGR (specific growth rate)', () => {
  it('returns invalid when inputs missing', () => {
    expect(calculateSGR({ previousWeightG: 0, currentWeightG: 100, days: 7 }).status).toBe('invalid');
    expect(calculateSGR({ previousWeightG: 100, currentWeightG: 0, days: 7 }).status).toBe('invalid');
    expect(calculateSGR({ previousWeightG: 100, currentWeightG: 100, days: 0 }).status).toBe('invalid');
  });

  it('flags healthy growth (tilapia 10g → 14g over 7 days ≈ 4.8%/day)', () => {
    const r = calculateSGR({ previousWeightG: 10, currentWeightG: 14, days: 7 });
    expect(r.sgr).toBeGreaterThan(4);
    expect(r.sgr).toBeLessThan(6);
    expect(r.status).toBe('excellent');
  });

  it('flags concerning growth (10g → 11g over 7 days ≈ 1.4%/day)', () => {
    const r = calculateSGR({ previousWeightG: 10, currentWeightG: 11, days: 7 });
    expect(r.sgr).toBeGreaterThan(1);
    expect(r.sgr).toBeLessThan(2);
    expect(r.status).toBe('concerning');
  });

  it('classifies thresholds at boundaries', () => {
    expect(classifySGR(3.0).status).toBe('excellent');
    expect(classifySGR(2.0).status).toBe('healthy');
    expect(classifySGR(1.2).status).toBe('concerning');
    expect(classifySGR(0.5).status).toBe('critical');
    expect(classifySGR(-1).status).toBe('critical');
  });

  it('formats SGR for display', () => {
    expect(formatSGR(2.345)).toBe('2.3%/day');
    expect(formatSGR(2.345, false)).toBe('2.3');
  });
});

describe('Fish FCR', () => {
  it('returns null with reason when no feed', () => {
    const r = calculateFishFCR({ feedKg: 0, biomassGainedKg: 100, species: 'Tilapia' });
    expect(r.fcr).toBeNull();
    expect(r.reason).toMatch(/no feed/i);
  });

  it('returns null when no biomass gain', () => {
    const r = calculateFishFCR({ feedKg: 100, biomassGainedKg: 0, species: 'Tilapia' });
    expect(r.fcr).toBeNull();
    expect(r.reason).toMatch(/biomass/i);
  });

  it('classifies tilapia 1.5 as excellent, 2.2 as acceptable, 3.0 as high', () => {
    expect(classifyFishFCR(1.5, 'Tilapia').status).toBe('excellent');
    expect(classifyFishFCR(2.2, 'Tilapia').status).toBe('acceptable');
    expect(classifyFishFCR(3.0, 'Tilapia').status).toBe('high');
  });

  it('classifies clarias as more efficient than tilapia (1.5 boundary differs)', () => {
    expect(classifyFishFCR(1.5, 'Clarias').status).toBe('excellent');
    expect(classifyFishFCR(1.8, 'Clarias').status).toBe('acceptable');
    expect(classifyFishFCR(2.5, 'Clarias').status).toBe('high');
  });

  it('formats FCR', () => {
    expect(formatFCR(1.789)).toBe('1.79');
    expect(formatFCR(null)).toBe('—');
  });
});

describe('Harvest readiness', () => {
  it('flags too-early before earliestWeek', () => {
    const r = calculateHarvestReadiness({
      species: 'Tilapia',
      currentWeek: 8,
      currentAbwG: 100,
      sgrPercent: 2,
    });
    expect(r.status).toBe('too-early');
  });

  it('flags ready when at target inside window', () => {
    const r = calculateHarvestReadiness({
      species: 'Tilapia',
      currentWeek: 20,
      currentAbwG: 420,
      sgrPercent: 2,
    });
    expect(r.status).toBe('ready');
    expect(r.daysToTarget).toBe(0);
  });

  it('flags overdue when past latestWeek even at target', () => {
    const r = calculateHarvestReadiness({
      species: 'Tilapia',
      currentWeek: 26,
      currentAbwG: 450,
      sgrPercent: 1,
    });
    expect(r.status).toBe('overdue');
  });

  it('projects days correctly via SGR formula', () => {
    // current 200g, target 400g, sgr 2%/day → days = ln(2)/0.02 ≈ 35
    const r = calculateHarvestReadiness({
      species: 'Tilapia',
      currentWeek: 18,
      currentAbwG: 200,
      sgrPercent: 2,
    });
    expect(r.daysToTarget).toBeGreaterThan(30);
    expect(r.daysToTarget).toBeLessThan(40);
  });

  it('returns unknown when no weight sample', () => {
    const r = calculateHarvestReadiness({
      species: 'Tilapia',
      currentWeek: 20,
      currentAbwG: 0,
      sgrPercent: 2,
    });
    expect(r.status).toBe('unknown');
  });
});

describe('Stocking density', () => {
  it('returns unknown for zero pond size', () => {
    const r = calculateStockingDensity({ species: 'Tilapia', count: 1000, pondSizeSqm: 0 });
    expect(r.status).toBe('unknown');
  });

  it('flags ideal at 5 fish/m² for tilapia', () => {
    const r = calculateStockingDensity({ species: 'Tilapia', count: 500, pondSizeSqm: 100 });
    expect(r.density).toBe(5);
    expect(r.status).toBe('ideal');
  });

  it('flags stressed at 12 fish/m² for tilapia', () => {
    const r = calculateStockingDensity({ species: 'Tilapia', count: 1200, pondSizeSqm: 100 });
    expect(r.status).toBe('stressed');
  });

  it('flags crisis at 20 fish/m² for tilapia', () => {
    const r = calculateStockingDensity({ species: 'Tilapia', count: 2000, pondSizeSqm: 100 });
    expect(r.status).toBe('crisis');
  });

  it('aerated ponds tolerate double density', () => {
    // 15 fish/m² unaerated would be "stressed" for tilapia.
    // With aerated factor of 2, the boundaries become ideal=10, acceptable=20, stressed=30.
    // So 15 fish/m² aerated = "acceptable" rather than "stressed" — that's the lift.
    const r = calculateStockingDensity({
      species: 'Tilapia',
      count: 1500,
      pondSizeSqm: 100,
      aerated: true,
    });
    expect(r.status).toBe('acceptable');
    // Same density without aeration would be stressed.
    const unaerated = calculateStockingDensity({
      species: 'Tilapia',
      count: 1500,
      pondSizeSqm: 100,
    });
    expect(unaerated.status).toBe('stressed');
  });
});

describe('Water quality thresholds', () => {
  it('DO < 3 = emergency, 3–5 = marginal, ≥ 5 = healthy', () => {
    expect(classifyDO(2).status).toBe('emergency');
    expect(classifyDO(4).status).toBe('marginal');
    expect(classifyDO(7).status).toBe('healthy');
    expect(classifyDO(null).status).toBe('unknown');
  });

  it('pH out of 6.5–9 = emergency', () => {
    expect(classifyPH(5).status).toBe('emergency');
    expect(classifyPH(9.5).status).toBe('emergency');
    expect(classifyPH(7.5).status).toBe('healthy');
  });

  it('ammonia >0.5 mg/L = emergency', () => {
    expect(classifyAmmonia(0.6).status).toBe('emergency');
    expect(classifyAmmonia(0.1).status).toBe('marginal');
    expect(classifyAmmonia(0.02).status).toBe('healthy');
  });

  it('nitrite ≥1 mg/L = emergency', () => {
    expect(classifyNitrite(1.5).status).toBe('emergency');
    expect(classifyNitrite(0.3).status).toBe('marginal');
    expect(classifyNitrite(0.05).status).toBe('healthy');
  });

  it('temperature thresholds vary by species', () => {
    // Tilapia: optimum 26-32, critical <18 / >36
    expect(classifyTemperature(28, 'Tilapia').status).toBe('healthy');
    expect(classifyTemperature(20, 'Tilapia').status).toBe('marginal');
    expect(classifyTemperature(15, 'Tilapia').status).toBe('emergency');
    // Catfish has lower critical low
    expect(classifyTemperature(16, 'Catfish').status).toBe('marginal');
  });

  it('classifyAll surfaces emergencies first', () => {
    const r = classifyAll(
      { do_mgL: 2, pH: 7.5, ammonia_mgL: 0.02, nitrite_mgL: 0.05, temp_c: 28 },
      'Tilapia',
    );
    expect(r.overallStatus).toBe('emergency');
    expect(r.emergencies.length).toBe(1);
  });

  it('classifyAll returns healthy when all params in range', () => {
    const r = classifyAll(
      { do_mgL: 6, pH: 7.5, ammonia_mgL: 0.02, nitrite_mgL: 0.05, temp_c: 28 },
      'Tilapia',
    );
    expect(r.overallStatus).toBe('healthy');
  });
});
