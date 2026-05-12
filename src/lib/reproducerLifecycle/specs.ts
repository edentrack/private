import type { ReproducerSpeciesSpec } from './types';

/**
 * Locked species specs.
 *
 * Adding a new species: copy the rabbits block below, change the
 * terminology + table prefixes, and ship a migration that creates
 * the matching tables. Then duplicate the rabbit page components
 * (RabbitSalesPage, RabbitGrowoutPage, etc.) and swap the imports
 * to read from the new species spec.
 *
 * Grasscutters is the closest copy-paste of rabbits (identical
 * lifecycle, slightly different terminology); pigs / goats / sheep
 * each have their own gestation and weaning timelines.
 */

export const SPEC_RABBITS: ReproducerSpeciesSpec = {
  id: 'rabbits',
  displayName: 'Rabbit',
  displayNamePlural: 'Rabbits',
  femaleBreederTerm: 'doe',
  maleBreederTerm: 'buck',
  offspringTerm: 'kit',
  offspringTermPlural: 'kits',
  birthEventTerm: 'kindling',
  litterTerm: 'litter',
  tables: {
    registry: 'rabbits',
    breeding: 'breeding_events',
    births:   'litters',
    growout:  'rabbit_growout_groups',
    sales:    'rabbit_sales',
  },
  lifecycle: {
    gestationDays: 31,
    weaningAgeWeeks: 5,
    marketAgeWeeks: 11,
  },
};

/**
 * Future species — kept here as placeholders + planning aids so the
 * code reads as a coherent roadmap. None are active until their
 * migration + pages ship. To enable: uncomment + add to ACTIVE_SPECIES.
 */

/* PLANNED — uncomment when pigs migration lands
export const SPEC_PIGS: ReproducerSpeciesSpec = {
  id: 'pigs',
  displayName: 'Pig',
  displayNamePlural: 'Pigs',
  femaleBreederTerm: 'sow',
  maleBreederTerm: 'boar',
  offspringTerm: 'piglet',
  offspringTermPlural: 'piglets',
  birthEventTerm: 'farrowing',
  litterTerm: 'litter',
  tables: {
    registry: 'pigs',
    breeding: 'breeding_events',
    births:   'farrowings',
    growout:  'pig_growout_groups',
    sales:    'pig_sales',
  },
  lifecycle: { gestationDays: 114, weaningAgeWeeks: 4, marketAgeWeeks: 24 },
};

export const SPEC_GOATS: ReproducerSpeciesSpec = {
  id: 'goats',
  displayName: 'Goat',
  displayNamePlural: 'Goats',
  femaleBreederTerm: 'doe',
  maleBreederTerm: 'buck',
  offspringTerm: 'kid',
  offspringTermPlural: 'kids',
  birthEventTerm: 'kidding',
  litterTerm: 'kidding',
  tables: {
    registry: 'goats',
    breeding: 'breeding_events',
    births:   'kiddings',
    growout:  'goat_growout_groups',
    sales:    'goat_sales',
  },
  lifecycle: { gestationDays: 150, weaningAgeWeeks: 10, marketAgeWeeks: 36 },
};

export const SPEC_GRASSCUTTERS: ReproducerSpeciesSpec = {
  id: 'grasscutters',
  displayName: 'Grasscutter',
  displayNamePlural: 'Grasscutters',
  femaleBreederTerm: 'doe',
  maleBreederTerm: 'buck',
  offspringTerm: 'pup',
  offspringTermPlural: 'pups',
  birthEventTerm: 'kindling',
  litterTerm: 'litter',
  tables: {
    registry: 'grasscutters',
    breeding: 'breeding_events',
    births:   'grasscutter_litters',
    growout:  'grasscutter_growout_groups',
    sales:    'grasscutter_sales',
  },
  lifecycle: { gestationDays: 155, weaningAgeWeeks: 6, marketAgeWeeks: 24 },
};
*/

/** Active species — drives the species picker on farm setup. */
export const ACTIVE_SPECIES: ReproducerSpeciesSpec[] = [SPEC_RABBITS];
