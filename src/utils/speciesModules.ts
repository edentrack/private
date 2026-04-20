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
  | 'Other Fish';

export interface SpeciesModule {
  id: AnimalSpecies;
  label: string;
  icon: any;
  groupTerm: string; // "Flock", "Rabbitry", "Pond"
  animalTerm: string; // "Birds", "Rabbits", "Fish"
  animalTermPlural: string; // "Birds", "Rabbits", "Fish"
  types: AnimalType[];
  features: {
    production: boolean; // eggs, milk, etc.
    weight: boolean;
    breeding: boolean;
    vaccination: boolean;
  };
  defaultPurchaseTerm: string; // "chicks", "rabbits", "fingerlings"
}

export const SPECIES_MODULES: Record<AnimalSpecies, SpeciesModule> = {
  poultry: {
    id: 'poultry',
    label: 'Poultry',
    icon: ChickenIcon,
    groupTerm: 'Flock',
    animalTerm: 'Bird',
    animalTermPlural: 'Birds',
    types: ['Broiler', 'Layer'],
    features: {
      production: true, // eggs
      weight: true,
      breeding: false,
      vaccination: true,
    },
    defaultPurchaseTerm: 'chicks',
  },
  rabbits: {
    id: 'rabbits',
    label: 'Rabbits',
    icon: Rabbit,
    groupTerm: 'Rabbitry',
    animalTerm: 'Rabbit',
    animalTermPlural: 'Rabbits',
    types: ['Meat Rabbits', 'Breeder Rabbits'],
    features: {
      production: false,
      weight: true,
      breeding: false, // Can add later
      vaccination: true,
    },
    defaultPurchaseTerm: 'rabbits',
  },
  aquaculture: {
    id: 'aquaculture',
    label: 'Aquaculture',
    icon: Fish,
    groupTerm: 'Pond',
    animalTerm: 'Fish',
    animalTermPlural: 'Fish',
    types: ['Tilapia', 'Catfish', 'Other Fish'],
    features: {
      production: false,
      weight: true,
      breeding: false, // Can add later
      vaccination: false,
    },
    defaultPurchaseTerm: 'fingerlings',
  },
};

/**
 * Get species module by ID
 */
export function getSpeciesModule(species: AnimalSpecies): SpeciesModule {
  return SPECIES_MODULES[species] || SPECIES_MODULES.poultry;
}

/**
 * Get species module by animal type
 */
export function getSpeciesByType(type: AnimalType): AnimalSpecies {
  if (type === 'Broiler' || type === 'Layer') return 'poultry';
  if (type === 'Meat Rabbits' || type === 'Breeder Rabbits') return 'rabbits';
  if (type === 'Tilapia' || type === 'Catfish' || type === 'Other Fish') return 'aquaculture';
  return 'poultry'; // Default fallback
}

/**
 * Get all types for a species
 */
export function getTypesForSpecies(species: AnimalSpecies): AnimalType[] {
  return SPECIES_MODULES[species]?.types || [];
}

/**
 * Check if species supports a feature
 */
export function speciesSupportsFeature(species: AnimalSpecies, feature: keyof SpeciesModule['features']): boolean {
  return SPECIES_MODULES[species]?.features[feature] || false;
}

/**
 * Get terminology for a species
 */
export function getSpeciesTerminology(species: AnimalSpecies) {
  const module = getSpeciesModule(species);
  return {
    group: module.groupTerm,
    animal: module.animalTerm,
    animals: module.animalTermPlural,
    purchase: module.defaultPurchaseTerm,
  };
}











