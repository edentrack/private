/**
 * Species Module System
 * Defines configuration for each animal species supported
 */

import { ChickenIcon } from '../components/icons/ChickenIcon';
import { Rabbit, Fish } from 'lucide-react';

export type AnimalSpecies = 'poultry' | 'rabbits' | 'aquaculture';

export type AnimalType =
  // Poultry
  | 'Broiler'
  | 'Layer'
  // Rabbits
  | 'Meat Rabbits'
  | 'Breeder Rabbits'
  // Aquaculture
  | 'Tilapia'
  | 'Catfish'
  | 'Clarias'
  | 'Other Fish';

export interface SpeciesPhase {
  name: string;
  startWeek: number;
  endWeek: number;
}

export interface SpeciesTaskTemplate {
  title: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  category: string;
}

export interface SpeciesModule {
  id: AnimalSpecies;
  label: string;
  icon: any;
  groupTerm: string;        // "Flock", "Rabbitry", "Pond"
  groupTermPlural: string;  // "Flocks", "Rabbitries", "Ponds"
  animalTerm: string;       // "Bird", "Rabbit", "Fish"
  animalTermPlural: string; // "Birds", "Rabbits", "Fish"
  types: AnimalType[];
  features: {
    production: boolean;  // eggs, milk, etc.
    eggs: boolean;        // egg recording specifically
    harvest: boolean;     // harvest/slaughter tracking
    weight: boolean;
    breeding: boolean;
    vaccination: boolean;
  };
  defaultPurchaseTerm: string; // "chicks", "rabbits", "fingerlings"

  // Loss event terminology
  lossNoun: string;        // "Mortality", "Loss", "Death"
  lossNounPlural: string;  // "Mortalities", "Losses", "Deaths"
  lossReasons: string[];

  // Production cycle
  defaultCycleWeeks: number;
  phases: SpeciesPhase[];

  // Knowledge & tasks
  knowledgeFile: string;
  defaultTaskTemplates: SpeciesTaskTemplate[];

  // Insights / KPI labels — drive species-aware copy out of the species
  // module so InsightsPage doesn't have to hardcode "kg eggs" or
  // "Pre-lay phase" for non-poultry.

  /** Sub-label shown under the FCR KPI, e.g. "kg feed/kg eggs". */
  fcrUnit: string;

  /**
   * Sell/Keep signal copy for the pre-harvest / pre-lay phase. The audit
   * flagged that fish farms were inheriting the layer "Pre-lay phase
   * (typically before week 18); no sell signal yet" string. Each species
   * provides its own copy.
   */
  preHarvestSignal: {
    headline: string;     // "Keep flock", "Keep growing", "Keep colony"
    reason: string;       // describes why the signal isn't tripping yet
  };
}

// ─── Default phase arrays (exported for components that need type-specific ones) ───

export const BROILER_DEFAULT_PHASES: SpeciesPhase[] = [
  { name: 'Brooding', startWeek: 1, endWeek: 2 },
  { name: 'Growth', startWeek: 3, endWeek: 4 },
  { name: 'Finishing', startWeek: 5, endWeek: 8 },
];

export const LAYER_DEFAULT_PHASES: SpeciesPhase[] = [
  { name: 'Chick', startWeek: 1, endWeek: 5 },
  { name: 'Grower', startWeek: 6, endWeek: 12 },
  { name: 'Pullet', startWeek: 13, endWeek: 17 },
  { name: 'Pre-lay', startWeek: 18, endWeek: 20 },
  { name: 'Laying', startWeek: 21, endWeek: 72 },
];

export const RABBIT_DEFAULT_PHASES: SpeciesPhase[] = [
  { name: 'Kit', startWeek: 1, endWeek: 4 },
  { name: 'Weanling', startWeek: 5, endWeek: 8 },
  { name: 'Grower', startWeek: 9, endWeek: 14 },
  { name: 'Market-ready', startWeek: 15, endWeek: 16 },
];

// Default aquaculture lifecycle phases — used when a species-specific override
// isn't available. Uses biological lifecycle terminology that farmers recognise
// (Fingerling → Juvenile → Grow-out → Pre-harvest), parallel to how poultry
// uses Chick → Grower → Pullet → Pre-lay → Laying.
export const AQUACULTURE_DEFAULT_PHASES: SpeciesPhase[] = [
  { name: 'Fingerling', startWeek: 1, endWeek: 4 },
  { name: 'Juvenile', startWeek: 5, endWeek: 12 },
  { name: 'Grow-out', startWeek: 13, endWeek: 20 },
  { name: 'Pre-harvest', startWeek: 21, endWeek: 24 },
];

// ─── Species registry ───────────────────────────────────────────────────────────

export const SPECIES_MODULES: Record<AnimalSpecies, SpeciesModule> = {
  poultry: {
    id: 'poultry',
    label: 'Poultry',
    icon: ChickenIcon,
    groupTerm: 'Flock',
    groupTermPlural: 'Flocks',
    animalTerm: 'Bird',
    animalTermPlural: 'Birds',
    types: ['Broiler', 'Layer'],
    features: {
      production: true,
      eggs: true,
      harvest: true,
      weight: true,
      breeding: false,
      vaccination: true,
    },
    defaultPurchaseTerm: 'chicks',

    lossNoun: 'Mortality',
    lossNounPlural: 'Mortalities',
    lossReasons: [
      'Disease',
      'Heat Stress',
      'Cold Stress',
      'Predation',
      'Injury',
      'Cannibalism',
      'Vaccination Reaction',
      'Unknown',
      'Other',
    ],

    defaultCycleWeeks: 8,
    phases: BROILER_DEFAULT_PHASES,

    knowledgeFile: 'poultry.md',
    defaultTaskTemplates: [
      { title: 'Clean Coop', frequency: 'daily', category: 'Sanitation' },
      { title: 'Check Water Lines', frequency: 'daily', category: 'Maintenance' },
      { title: 'Inspect Feeders', frequency: 'daily', category: 'Maintenance' },
      { title: 'Biosecurity Check', frequency: 'daily', category: 'Biosecurity' },
      { title: 'Record Mortality', frequency: 'daily', category: 'Health' },
      { title: 'Weekly Broiler Weight Check', frequency: 'weekly', category: 'Growth Tracking' },
    ],

    // Layer FCR is feed per egg-mass; broiler FCR is feed per liveweight gain.
    // We default to the layer phrasing here because Insights' sell/keep logic
    // already pivots on `isLayerFlock`. Components can refine per-flock-type.
    fcrUnit: 'kg feed/kg eggs',
    preHarvestSignal: {
      headline: 'Keep flock',
      reason: 'Pre-lay phase (typically before week 18); no sell signal yet.',
    },
  },

  aquaculture: {
    id: 'aquaculture',
    label: 'Aquaculture',
    icon: Fish,
    groupTerm: 'Pond',
    groupTermPlural: 'Ponds',
    animalTerm: 'Fish',
    animalTermPlural: 'Fish',
    types: ['Catfish', 'Clarias', 'Tilapia', 'Other Fish'],
    features: {
      production: false,
      eggs: false,
      harvest: true,
      weight: true,
      breeding: false,
      vaccination: false,
    },
    defaultPurchaseTerm: 'fingerlings',

    lossNoun: 'Loss',
    lossNounPlural: 'Losses',
    lossReasons: [
      'Low Dissolved Oxygen',
      'Ammonia Spike',
      'Nitrite Spike',
      'Disease',
      'Parasites',
      'Predation',
      'Stocking Stress',
      'Temperature Shock',
      'Water Quality',
      'Unknown',
      'Other',
    ],

    defaultCycleWeeks: 24,
    phases: AQUACULTURE_DEFAULT_PHASES,

    knowledgeFile: 'fish-aquaculture.md',
    defaultTaskTemplates: [
      { title: 'Check water DO morning', frequency: 'daily', category: 'Water Quality' },
      { title: 'Check water DO evening', frequency: 'daily', category: 'Water Quality' },
      { title: 'Feed pond', frequency: 'daily', category: 'Feed Management' },
      { title: 'Inspect pond for deaths', frequency: 'daily', category: 'Health' },
      { title: 'Check ammonia and nitrite', frequency: 'weekly', category: 'Water Quality' },
      { title: 'Sample weight (5–10 fish)', frequency: 'weekly', category: 'Growth Tracking' },
      { title: 'Pond clean / partial water change', frequency: 'monthly', category: 'Sanitation' },
      { title: 'Health inspection', frequency: 'monthly', category: 'Health' },
    ],

    fcrUnit: 'kg feed/kg fish gained',
    preHarvestSignal: {
      headline: 'Keep growing',
      reason: 'Below pre-harvest phase; harvest signal triggers near week 19 (Pre-harvest).',
    },
  },

  rabbits: {
    id: 'rabbits',
    label: 'Rabbits',
    icon: Rabbit,
    groupTerm: 'Rabbitry',
    groupTermPlural: 'Rabbitries',
    animalTerm: 'Rabbit',
    animalTermPlural: 'Rabbits',
    types: ['Meat Rabbits', 'Breeder Rabbits'],
    features: {
      production: false,
      eggs: false,
      harvest: true,
      weight: true,
      breeding: true,
      vaccination: true,
    },
    defaultPurchaseTerm: 'rabbits',

    lossNoun: 'Death',
    lossNounPlural: 'Deaths',
    lossReasons: [
      'Disease',
      'Injury',
      'Stress',
      'Heat',
      'Predation',
      'Pasteurella',
      'Coccidiosis',
      'Unknown',
      'Other',
    ],

    defaultCycleWeeks: 16,
    phases: RABBIT_DEFAULT_PHASES,

    knowledgeFile: 'rabbits.md',
    defaultTaskTemplates: [
      { title: 'Feed rabbits', frequency: 'daily', category: 'Feed Management' },
      { title: 'Check water supply', frequency: 'daily', category: 'Maintenance' },
      { title: 'Inspect hutches for health issues', frequency: 'daily', category: 'Health' },
      { title: 'Record deaths', frequency: 'daily', category: 'Health' },
      { title: 'Clean hutches', frequency: 'weekly', category: 'Sanitation' },
      { title: 'Weight sampling', frequency: 'weekly', category: 'Growth Tracking' },
    ],

    fcrUnit: 'kg feed/kg liveweight gained',
    preHarvestSignal: {
      headline: 'Keep colony',
      reason: 'Below market-ready phase; harvest signal triggers near week 15.',
    },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────────

export function getSpeciesModule(species: AnimalSpecies): SpeciesModule {
  return SPECIES_MODULES[species] || SPECIES_MODULES.poultry;
}

export function getSpeciesByType(type: AnimalType): AnimalSpecies {
  if (type === 'Broiler' || type === 'Layer') return 'poultry';
  if (type === 'Meat Rabbits' || type === 'Breeder Rabbits') return 'rabbits';
  if (type === 'Tilapia' || type === 'Catfish' || type === 'Clarias' || type === 'Other Fish') return 'aquaculture';
  return 'poultry';
}

export function getTypesForSpecies(species: AnimalSpecies): AnimalType[] {
  return SPECIES_MODULES[species]?.types || [];
}

export function speciesSupportsFeature(species: AnimalSpecies, feature: keyof SpeciesModule['features']): boolean {
  return SPECIES_MODULES[species]?.features[feature] || false;
}

export function getSpeciesTerminology(species: AnimalSpecies) {
  const module = getSpeciesModule(species);
  return {
    group: module.groupTerm,
    animal: module.animalTerm,
    animals: module.animalTermPlural,
    purchase: module.defaultPurchaseTerm,
  };
}
