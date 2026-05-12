/**
 * Reproducer-species lifecycle — shared types & terminology.
 *
 * "Reproducer species" = animals where breeding happens in-care and the
 * farmer tracks cohorts of offspring growing out alongside the breeding
 * stock. The lifecycle pattern is:
 *
 *    Registry (named bucks/does)
 *         ↓
 *    Breeding event (mating / AI / due date)
 *         ↓
 *    Birth event ("litter"/"farrowing"/"kidding"/"lambing"/"calving")
 *         ↓
 *    Grow-out group (auto-created cohort with birth date + count)
 *         ↓
 *    Sales (from cohort or named individual)
 *
 * This file defines the SHARED interfaces so adding pigs / goats /
 * sheep / cattle / grasscutters becomes "copy the rabbit modules and
 * change names + table prefixes". Each species gets:
 *
 *    1. A `ReproducerSpeciesSpec` constant (below) — describes the
 *       species-specific terminology and table mapping
 *    2. Page components: `<Species>RegistryPage`, `<Species>BreedingPage`,
 *       `<Species>BirthsPage`, `<Species>GrowoutPage`, `<Species>SalesPage`
 *    3. A migration that follows the rabbit schema verbatim with the
 *       species prefix
 *
 * The rabbit module is the canonical first implementation; new species
 * are 90% find-and-replace.
 */

/**
 * Species-specific labels & DB mapping. Terminology varies a lot:
 *   rabbits:  doe / buck / kits  / kindling
 *   pigs:     sow / boar / piglets / farrowing
 *   goats:    doe / buck / kids   / kidding
 *   sheep:    ewe / ram  / lambs  / lambing
 *   cattle:   cow / bull / calves / calving
 *   grasscutters: doe / buck / kits / kindling (same as rabbits)
 *
 * The labels drive UI copy and Eden AI's tool descriptions. The table
 * names route DB reads/writes to the right per-species tables.
 */
export interface ReproducerSpeciesSpec {
  /** Internal id for the species — used as the URL slug. */
  id: 'rabbits' | 'pigs' | 'goats' | 'sheep' | 'cattle' | 'grasscutters';

  /** Display name (singular). "Rabbit", "Pig", "Goat". */
  displayName: string;
  displayNamePlural: string;

  /** What you call a female + male. */
  femaleBreederTerm: string;   // "doe", "sow", "cow"
  maleBreederTerm: string;     // "buck", "boar", "bull"

  /** What you call newborn offspring. */
  offspringTerm: string;          // "kit", "piglet", "kid", "lamb", "calf"
  offspringTermPlural: string;

  /** The event name for a birth. */
  birthEventTerm: string;       // "kindling", "farrowing", "kidding", "lambing", "calving"

  /** What you call a litter / brood. */
  litterTerm: string;           // "litter", "litter of piglets", "set of kids"

  /** Table mapping — drives Supabase queries. */
  tables: {
    registry: string;       // 'rabbits', would be 'pigs', 'goats', etc.
    breeding: string;       // 'breeding_events' — shared today; per-species later
    births:   string;       // 'litters'
    growout:  string;       // 'rabbit_growout_groups'
    sales:    string;       // 'rabbit_sales'
  };

  /**
   * Typical lifecycle durations in days. Used for:
   *   - Eden AI's age estimate when farmer asks "how old is X"
   *   - Headline metric on the growout card ("12w old")
   *   - Default "ready to sell" age
   */
  lifecycle: {
    gestationDays: number;     // rabbits 31, pigs 114, goats 150, sheep 147, cattle 283
    weaningAgeWeeks: number;   // rabbits 4-5, pigs 3-4, goats 8-12, sheep 8-12
    marketAgeWeeks: number;    // rabbits 10-12, pigs 24, goats 26-52
  };
}

/**
 * The shape every species' growout-group row must conform to. New
 * species can use this verbatim if they call their cohort table
 * `<species>_growout_groups` with the same columns.
 */
export interface GrowoutGroup {
  id: string;
  farm_id: string;
  name: string;
  source_litter_id: string | null;
  birth_date: string | null;
  starting_count: number;
  current_count: number;
  status: 'active' | 'sold_out' | 'closed';
  notes: string | null;
  created_at: string;
}

/**
 * Shared age helper. Returns weeks since `birth_date` (null-safe).
 * Used by every species' growout card.
 */
export function weeksSinceBirth(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const start = new Date(birthDate);
  if (isNaN(start.getTime())) return null;
  const diff = Date.now() - start.getTime();
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
}
