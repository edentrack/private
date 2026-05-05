# How to Add Rabbits and Fish to Your Farm

## 🎯 Quick Start Guide

### Step 1: Run Database Migration

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Run the migration file: `supabase/migrations/20251218000001_add_species_support.sql`
4. This adds:
   - `species` column to `flocks` table
   - Support for rabbits and aquaculture types
   - Optional fields for aquaculture (pond size, stocking density)

### Step 2: Create Your First Rabbit Group

1. Go to **Flocks** page
2. Click **"Create Flock"** (button will say "Create Group" after update)
3. Select **"Rabbits"** as species
4. Choose type: **"Meat Rabbits"** or **"Breeder Rabbits"**
5. Enter details:
   - Name: e.g., "Breeder Does"
   - Initial count: e.g., 50
   - Purchase price per rabbit
   - Dates
6. Click **"Create Rabbitry"**

### Step 3: Create Your First Fish Pond

1. Go to **Flocks** page
2. Click **"Create Flock"**
3. Select **"Aquaculture"** as species
4. Choose type: **"Tilapia"**, **"Catfish"**, or **"Other Fish"**
5. Enter details:
   - Name: e.g., "Main Pond"
   - Initial count: e.g., 1,000
   - **Optional**: Pond size (sqm)
   - **Optional**: Stocking density (per sqm)
   - Purchase price per fish
   - Dates
6. Click **"Create Pond"**

---

## ✨ What Works Automatically

Once you create rabbits or fish groups, these features work automatically:

### ✅ Already Working:
- **Weight Tracking** - Track rabbit/fish weights
- **Mortality Logging** - Record deaths
- **Sales** - Sell rabbits/fish (terminology adapts)
- **Expenses** - Track costs
- **Tasks** - Assign tasks to groups
- **Insights** - View analytics
- **Inventory** - Track feed usage
- **Team Management** - Assign workers

### 🎨 UI Adapts Automatically:
- **"Flock"** → **"Rabbitry"** or **"Pond"** (based on species)
- **"Birds"** → **"Rabbits"** or **"Fish"** (based on species)
- Icons change based on species
- Terminology updates throughout

---

## 📋 Features by Species

### Poultry (Existing)
- ✅ Egg collection (layers)
- ✅ Weight tracking (broilers)
- ✅ Vaccination schedules
- ✅ Growth targets

### Rabbits (New)
- ✅ Weight tracking
- ✅ Mortality logging
- ✅ Sales tracking
- ⏳ Breeding (coming later)
- ⏳ Milk production (if dairy rabbits added later)

### Fish/Aquaculture (New)
- ✅ Weight tracking
- ✅ Mortality logging
- ✅ Sales tracking
- ✅ Pond size tracking
- ✅ Stocking density tracking
- ⏳ Water quality (coming later)
- ⏳ Breeding (coming later)

---

## 🔧 Technical Details

### Database Changes
- `flocks` table now has `species` column
- `type` column supports new types
- Optional `pond_size_sqm` and `stocking_density` for aquaculture

### Code Changes
- Species module system (`src/utils/speciesModules.ts`)
- Updated types (`src/types/database.ts`)
- Species-aware components
- Dynamic terminology

---

## 🚀 Next Steps

After adding rabbits and fish:

1. **Test all features** with new species
2. **Gather user feedback**
3. **Add more species** as needed (goats, pigs, etc.)
4. **Add species-specific features** (breeding, milk, etc.)

---

## 💡 Tips

- **Start with one species** - Test rabbits first, then add fish
- **Use clear names** - "Breeder Does", "Main Pond", etc.
- **Track everything** - Weight, mortality, expenses work the same
- **Sales work the same** - Just terminology changes

---

## ❓ FAQ

**Q: Will my existing poultry flocks break?**
A: No! All existing flocks continue to work exactly as before.

**Q: Can I have multiple species in one farm?**
A: Yes! You can have poultry, rabbits, and fish all in the same farm.

**Q: Do I need to do anything special for rabbits/fish?**
A: No! Just create them like you would a flock. Everything else works automatically.

**Q: Can I add more species later?**
A: Yes! The system is designed to easily add more species.

---

Ready to add rabbits and fish? Run the migration and start creating!











