/**
 * Water quality alert thresholds — Phase B Step 13.
 *
 * For each parameter, classifies a measured value as healthy / marginal /
 * emergency. Tilapia, catfish, and clarias all share most thresholds; the
 * key differences are in temperature tolerance.
 *
 * Sources used to set defaults:
 *   - FAO Aquaculture Manual (2014)
 *   - SRAC Publication No. 463 (Pond Water Quality)
 *   - Boyd, C.E. — Water Quality in Warmwater Fish Ponds (2nd ed)
 */

import type { FishSpeciesType } from './fcrAquaculture';

export type WaterQualityStatus = 'healthy' | 'marginal' | 'emergency' | 'unknown';

export interface WaterQualityClassification {
  status: WaterQualityStatus;
  color: 'green' | 'amber' | 'red' | 'gray';
  label: string;
  message: string;
}

// ─── Dissolved Oxygen (mg/L) ────────────────────────────────────────────
//   <3   = emergency (suffocation; immediate aeration / water change)
//   3–5  = marginal (fish stressed, growth slows)
//   ≥5   = healthy
export function classifyDO(mgPerL: number | null | undefined): WaterQualityClassification {
  if (mgPerL == null || mgPerL <= 0) {
    return { status: 'unknown', color: 'gray', label: '—', message: 'No DO reading' };
  }
  if (mgPerL < 3) {
    return {
      status: 'emergency',
      color: 'red',
      label: 'Critical',
      message: `DO ${mgPerL.toFixed(1)} mg/L — fish are suffocating. Aerate immediately or partial water exchange.`,
    };
  }
  if (mgPerL < 5) {
    return {
      status: 'marginal',
      color: 'amber',
      label: 'Low',
      message: `DO ${mgPerL.toFixed(1)} mg/L — fish stressed and growth slowing. Add aeration or reduce feed.`,
    };
  }
  return {
    status: 'healthy',
    color: 'green',
    label: 'Healthy',
    message: `DO ${mgPerL.toFixed(1)} mg/L — good.`,
  };
}

// ─── pH ──────────────────────────────────────────────────────────────────
//   <6.5 or >9.0 = emergency
//   6.5–7.0 or 8.5–9.0 = marginal
//   7.0–8.5 = healthy
export function classifyPH(pH: number | null | undefined): WaterQualityClassification {
  if (pH == null || pH <= 0) {
    return { status: 'unknown', color: 'gray', label: '—', message: 'No pH reading' };
  }
  if (pH < 6.5 || pH > 9.0) {
    return {
      status: 'emergency',
      color: 'red',
      label: 'Out of safe range',
      message: `pH ${pH.toFixed(1)} — outside safe range (6.5–9.0). Check buffering and inflow source.`,
    };
  }
  if (pH < 7.0 || pH > 8.5) {
    return {
      status: 'marginal',
      color: 'amber',
      label: 'Watch',
      message: `pH ${pH.toFixed(1)} — outside ideal 7.0–8.5. Add lime if low, partial water change if high.`,
    };
  }
  return { status: 'healthy', color: 'green', label: 'Healthy', message: `pH ${pH.toFixed(1)} — ideal.` };
}

// ─── Ammonia (un-ionised NH₃, mg/L) ─────────────────────────────────────
//   >0.5  = emergency (toxic at any pH)
//   0.05–0.5 = marginal
//   <0.05 = healthy
export function classifyAmmonia(mgPerL: number | null | undefined): WaterQualityClassification {
  if (mgPerL == null || mgPerL < 0) {
    return { status: 'unknown', color: 'gray', label: '—', message: 'No ammonia reading' };
  }
  if (mgPerL >= 0.5) {
    return {
      status: 'emergency',
      color: 'red',
      label: 'Toxic',
      message: `NH₃ ${mgPerL.toFixed(2)} mg/L — toxic to fish. Stop feeding, partial water exchange, check biofilter / pond age.`,
    };
  }
  if (mgPerL > 0.05) {
    return {
      status: 'marginal',
      color: 'amber',
      label: 'Elevated',
      message: `NH₃ ${mgPerL.toFixed(2)} mg/L — climbing. Reduce feed by 25%, add water if possible.`,
    };
  }
  return { status: 'healthy', color: 'green', label: 'Safe', message: `NH₃ ${mgPerL.toFixed(2)} mg/L — safe.` };
}

// ─── Nitrite (NO₂⁻, mg/L) ───────────────────────────────────────────────
//   >1.0  = emergency
//   0.1–1.0 = marginal
//   <0.1  = healthy
export function classifyNitrite(mgPerL: number | null | undefined): WaterQualityClassification {
  if (mgPerL == null || mgPerL < 0) {
    return { status: 'unknown', color: 'gray', label: '—', message: 'No nitrite reading' };
  }
  if (mgPerL >= 1.0) {
    return {
      status: 'emergency',
      color: 'red',
      label: 'Toxic',
      message: `NO₂⁻ ${mgPerL.toFixed(2)} mg/L — brown blood disease risk. Add salt (chloride blocks nitrite uptake) and exchange water.`,
    };
  }
  if (mgPerL > 0.1) {
    return {
      status: 'marginal',
      color: 'amber',
      label: 'Elevated',
      message: `NO₂⁻ ${mgPerL.toFixed(2)} mg/L — biofilter not keeping up. Add salt, reduce feed.`,
    };
  }
  return { status: 'healthy', color: 'green', label: 'Safe', message: `NO₂⁻ ${mgPerL.toFixed(2)} mg/L — safe.` };
}

// ─── Temperature (°C) ───────────────────────────────────────────────────
// Species-specific. Outside the optimum band, fish stop feeding and growth halts.
const TEMP_BANDS: Record<FishSpeciesType, { optimumLow: number; optimumHigh: number; criticalLow: number; criticalHigh: number }> = {
  Tilapia: { optimumLow: 26, optimumHigh: 32, criticalLow: 18, criticalHigh: 36 },
  Catfish: { optimumLow: 24, optimumHigh: 30, criticalLow: 15, criticalHigh: 34 },
  Clarias: { optimumLow: 25, optimumHigh: 32, criticalLow: 17, criticalHigh: 35 },
  'Other Fish': { optimumLow: 24, optimumHigh: 32, criticalLow: 18, criticalHigh: 35 },
};

export function classifyTemperature(
  tempC: number | null | undefined,
  species: FishSpeciesType,
): WaterQualityClassification {
  if (tempC == null) {
    return { status: 'unknown', color: 'gray', label: '—', message: 'No temperature reading' };
  }
  const band = TEMP_BANDS[species];
  if (tempC < band.criticalLow || tempC > band.criticalHigh) {
    return {
      status: 'emergency',
      color: 'red',
      label: 'Critical',
      message: `${tempC.toFixed(1)} °C is outside ${species.toLowerCase()}'s tolerable range (${band.criticalLow}–${band.criticalHigh} °C). Mortality risk.`,
    };
  }
  if (tempC < band.optimumLow || tempC > band.optimumHigh) {
    return {
      status: 'marginal',
      color: 'amber',
      label: 'Suboptimal',
      message: `${tempC.toFixed(1)} °C — outside the optimum ${band.optimumLow}–${band.optimumHigh} °C for ${species.toLowerCase()}. Growth and feeding will slow.`,
    };
  }
  return {
    status: 'healthy',
    color: 'green',
    label: 'Optimal',
    message: `${tempC.toFixed(1)} °C — in the ideal range for ${species.toLowerCase()}.`,
  };
}

// ─── Combined health check ──────────────────────────────────────────────
export interface WaterQualitySnapshot {
  do_mgL?: number | null;
  pH?: number | null;
  ammonia_mgL?: number | null;
  nitrite_mgL?: number | null;
  temp_c?: number | null;
}

export function classifyAll(
  snapshot: WaterQualitySnapshot,
  species: FishSpeciesType,
): {
  overallStatus: WaterQualityStatus;
  emergencies: string[];
  marginals: string[];
  byParam: Record<string, WaterQualityClassification>;
} {
  const byParam = {
    do: classifyDO(snapshot.do_mgL),
    pH: classifyPH(snapshot.pH),
    ammonia: classifyAmmonia(snapshot.ammonia_mgL),
    nitrite: classifyNitrite(snapshot.nitrite_mgL),
    temp: classifyTemperature(snapshot.temp_c, species),
  };
  const emergencies = Object.values(byParam)
    .filter((c) => c.status === 'emergency')
    .map((c) => c.message);
  const marginals = Object.values(byParam)
    .filter((c) => c.status === 'marginal')
    .map((c) => c.message);

  let overallStatus: WaterQualityStatus = 'healthy';
  if (emergencies.length > 0) overallStatus = 'emergency';
  else if (marginals.length > 0) overallStatus = 'marginal';

  return { overallStatus, emergencies, marginals, byParam };
}
