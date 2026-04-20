# Multi-Species Implementation Plan
## Rabbits & Fish First, Then Expand

## 🎯 Implementation Strategy

### Phase 1: Foundation (Week 1)
1. Refactor `Flock` → `AnimalGroup` with species support
2. Create species module system
3. Update database schema
4. Maintain backward compatibility

### Phase 2: Rabbits (Week 2)
1. Add rabbits species module
2. Update UI terminology
3. Test with existing features

### Phase 3: Fish/Aquaculture (Week 3)
1. Add aquaculture species module
2. Add "ponds" concept
3. Update UI for fish terminology

### Phase 4: Polish & Expand (Week 4+)
1. Test all species
2. Add more species as needed
3. Optimize UI/UX

---

## 📋 Detailed Changes

### 1. Type System Changes

```typescript
// NEW: Species types
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

// UPDATED: Flock → AnimalGroup
export interface AnimalGroup {
  id: string;
  user_id: string;
  farm_id: string;
  name: string;
  species: AnimalSpecies;  // NEW
  type: AnimalType;
  start_date: string;
  arrival_date: string;
  initial_count: number;
  current_count: number;
  status: FlockStatus;
  // ... rest stays the same
}

// Backward compatibility alias
export type Flock = AnimalGroup;
```

### 2. Species Module System

```typescript
// src/utils/speciesModules.ts
export interface SpeciesModule {
  id: AnimalSpecies;
  label: string;
  icon: any;
  groupTerm: string; // "Flock", "Rabbitry", "Pond"
  animalTerm: string; // "Birds", "Rabbits", "Fish"
  types: AnimalType[];
  features: {
    production: boolean; // eggs, milk, etc.
    weight: boolean;
    breeding: boolean;
  };
}

export const SPECIES_MODULES: Record<AnimalSpecies, SpeciesModule> = {
  poultry: {
    id: 'poultry',
    label: 'Poultry',
    icon: ChickenIcon,
    groupTerm: 'Flock',
    animalTerm: 'Birds',
    types: ['Broiler', 'Layer'],
    features: {
      production: true, // eggs
      weight: true,
      breeding: false,
    },
  },
  rabbits: {
    id: 'rabbits',
    label: 'Rabbits',
    icon: RabbitIcon, // Need to add
    groupTerm: 'Rabbitry',
    animalTerm: 'Rabbits',
    types: ['Meat Rabbits', 'Breeder Rabbits'],
    features: {
      production: false,
      weight: true,
      breeding: false, // Can add later
    },
  },
  aquaculture: {
    id: 'aquaculture',
    label: 'Aquaculture',
    icon: FishIcon, // Need to add
    groupTerm: 'Pond',
    animalTerm: 'Fish',
    types: ['Tilapia', 'Catfish', 'Other Fish'],
    features: {
      production: false,
      weight: true,
      breeding: false, // Can add later
    },
  },
};
```

### 3. Database Migration

```sql
-- Migration: Add species support
ALTER TABLE flocks 
  ADD COLUMN IF NOT EXISTS species VARCHAR(20) DEFAULT 'poultry';

-- Update existing records
UPDATE flocks SET species = 'poultry' WHERE species IS NULL;

-- Add constraint
ALTER TABLE flocks 
  ADD CONSTRAINT flocks_species_check 
  CHECK (species IN ('poultry', 'rabbits', 'aquaculture'));

-- For aquaculture, add optional fields
ALTER TABLE flocks
  ADD COLUMN IF NOT EXISTS pond_size_sqm NUMERIC,
  ADD COLUMN IF NOT EXISTS stocking_density NUMERIC;
```

### 4. UI Component Updates

```typescript
// Example: FlockSwitcher → AnimalGroupSwitcher
function AnimalGroupSwitcher({ species, ... }) {
  const module = SPECIES_MODULES[species];
  return (
    <div>
      <label>{module.groupTerm}</label>
      <select>
        {/* groups */}
      </select>
    </div>
  );
}

// Dashboard widgets adapt automatically
{species === 'poultry' && hasLayers && <EggCollectionWidget />}
{species === 'rabbits' && <WeightWidget />}
{species === 'aquaculture' && <WeightWidget />}
```

---

## 🚀 Step-by-Step Implementation

### Step 1: Create Species Module System
- Create `src/utils/speciesModules.ts`
- Define species modules
- Create helper functions

### Step 2: Update Types
- Add `AnimalSpecies` and expanded `AnimalType`
- Update `Flock` interface (add species, keep backward compat)
- Update all type references

### Step 3: Database Migration
- Create migration file
- Add species column
- Update existing data

### Step 4: Update Core Components
- FlockSwitcher → AnimalGroupSwitcher
- Update terminology based on species
- Add species selector

### Step 5: Update UI Components
- Dashboard widgets
- Forms and inputs
- Reports and analytics

### Step 6: Testing
- Test with poultry (should work as before)
- Test with rabbits
- Test with fish

---

## 📝 Files to Modify

### Core Files:
- `src/types/database.ts` - Add species types
- `src/utils/speciesModules.ts` - NEW: Species module system
- `src/utils/flockTypeUtils.ts` - Update for multi-species

### Components:
- `src/components/common/FlockSwitcher.tsx` → `AnimalGroupSwitcher.tsx`
- `src/components/flocks/FlockManagement.tsx` - Add species selector
- `src/components/dashboard/DashboardHome.tsx` - Species-aware widgets
- `src/components/insights/InsightsPage.tsx` - Species filter

### Database:
- `supabase/migrations/XXXXX_add_species_support.sql` - NEW

---

## ✅ Success Criteria

1. ✅ Existing poultry farms work exactly as before
2. ✅ Can create rabbit groups
3. ✅ Can create fish ponds
4. ✅ UI shows correct terminology per species
5. ✅ All features work for all species (where applicable)
6. ✅ Easy to add more species later

---

## 🎨 UI Mockups

### Species Selector
```
┌─────────────────────────────┐
│ Create New Group            │
│                             │
│ Species: [Poultry ▼]        │
│   • Poultry                 │
│   • Rabbits                 │
│   • Aquaculture             │
│                             │
│ Type: [Broiler ▼]           │
│ Name: [___________]         │
└─────────────────────────────┘
```

### Dashboard (Poultry)
```
┌─────────────────────────────┐
│ Flock: "Layer Flock 1"      │
│ Birds: 500                   │
│ [Egg Collection Widget]     │
└─────────────────────────────┘
```

### Dashboard (Rabbits)
```
┌─────────────────────────────┐
│ Rabbitry: "Breeder Does"    │
│ Rabbits: 50                  │
│ [Weight Tracking Widget]    │
└─────────────────────────────┘
```

### Dashboard (Fish)
```
┌─────────────────────────────┐
│ Pond: "Main Pond"           │
│ Fish: 1,000                 │
│ [Weight Tracking Widget]    │
└─────────────────────────────┘
```

---

Let's start implementing!











