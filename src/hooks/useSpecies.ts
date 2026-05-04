import { useFarmType } from './useFarmType';
import { useAuth } from '../contexts/AuthContext';
import { getSpeciesModule, getSpeciesByType, type AnimalSpecies, type AnimalType, type SpeciesModule } from '../utils/speciesModules';

/**
 * Derive the species module for the current farm.
 * Use this in any UI where copy/behaviour depends on species.
 */
export function useFarmSpecies(): SpeciesModule {
  const { currentFarm } = useAuth();
  const { isAquaculture } = useFarmType();
  const farmType = (currentFarm as any)?.farm_type as string | undefined;

  let species: AnimalSpecies;
  if (isAquaculture || farmType === 'aquaculture') {
    species = 'aquaculture';
  } else if (farmType === 'rabbits') {
    species = 'rabbits';
  } else {
    species = 'poultry';
  }

  return getSpeciesModule(species);
}

/**
 * Derive the species module for a specific flock type.
 * Falls back to farm species if the flock type doesn't map to a known species.
 */
export function useFlockSpecies(flockType?: string | null): SpeciesModule {
  const farmSpecies = useFarmSpecies();
  if (!flockType) return farmSpecies;
  try {
    const species = getSpeciesByType(flockType as AnimalType);
    return getSpeciesModule(species);
  } catch {
    return farmSpecies;
  }
}
