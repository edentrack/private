# 🐛 Debug: Rabbit & Fish Flocks Not Showing

## Issues Found

1. **503 Error for image.png** - Dev server issue serving static files
2. **Rabbit/Fish flocks not visible** - Need to check if they exist in database

## ✅ Fixes Applied

1. **Added `species` field** to flock creation (was missing!)
2. **Added debug logging** to see what flocks are loaded
3. **Added aquaculture fields** (pond_size_sqm, stocking_density) when creating fish

## 🔍 How to Debug

### Step 1: Check Browser Console

After refreshing, look for:
```
=== FLOCKS LOADED ===
Total flocks: X
Flocks by species: { poultry: X, rabbits: Y, aquaculture: Z }
Flock types: [...]
```

This will show:
- How many flocks exist
- What species they are
- If rabbit/fish flocks exist but aren't showing

### Step 2: Check Database

Run this in Supabase SQL Editor:
```sql
SELECT 
  id, 
  name, 
  type, 
  species, 
  status,
  created_at
FROM flocks
WHERE farm_id = 'your-farm-id'
ORDER BY created_at DESC;
```

This will show:
- All flocks in your farm
- Their species
- Their status (should be 'active' to show)

### Step 3: Verify Flock Creation

When creating rabbit/fish flocks:
1. Select species (Rabbits or Aquaculture)
2. Select type (Meat Rabbits, Tilapia, etc.)
3. Fill in details
4. Create

**Check console** - should see the new flock in the debug logs.

## 🐛 Common Issues

### Issue 1: Flocks Created Before Species Field
**Problem**: Old flocks don't have `species` field set.

**Fix**: Update existing flocks:
```sql
-- For rabbit flocks
UPDATE flocks 
SET species = 'rabbits' 
WHERE type IN ('Meat Rabbits', 'Breeder Rabbits') 
  AND species IS NULL;

-- For fish flocks  
UPDATE flocks 
SET species = 'aquaculture' 
WHERE type IN ('Tilapia', 'Catfish', 'Other Fish') 
  AND species IS NULL;
```

### Issue 2: Flocks Have Wrong Status
**Problem**: Flocks might be archived or have wrong status.

**Fix**: Check status:
```sql
SELECT name, type, status FROM flocks WHERE type LIKE '%Rabbit%' OR type LIKE '%Tilapia%' OR type LIKE '%Catfish%';
```

If status is not 'active', update it:
```sql
UPDATE flocks 
SET status = 'active' 
WHERE id = 'flock-id-here';
```

### Issue 3: 503 Error for Images
**Problem**: Dev server can't serve static files.

**Fix**:
1. Stop dev server (Ctrl+C)
2. Clear cache: `rm -rf node_modules/.vite`
3. Restart: `npm run dev`
4. Hard refresh browser: `Ctrl+Shift+R`

## ✅ Verification Steps

1. **Create a new rabbit flock**:
   - Go to Flocks → Add New
   - Select "Rabbits" species
   - Select "Meat Rabbits" type
   - Fill details and create
   - Check console for debug logs

2. **Create a new fish flock**:
   - Go to Flocks → Add New
   - Select "Aquaculture" species
   - Select "Tilapia" or "Catfish" type
   - Fill details and create
   - Check console for debug logs

3. **Check if they appear**:
   - Should see in flocks list
   - Check console logs to verify they're loaded

## 📝 What Was Fixed

1. ✅ **Added `species` field** when creating flocks (was missing!)
2. ✅ **Added debug logging** to track what's loaded
3. ✅ **Added aquaculture fields** (pond_size_sqm, stocking_density)

## 🚨 Next Steps

1. **Refresh the page** and check console
2. **Create a new rabbit/fish flock** to test
3. **Check database** if existing flocks don't show
4. **Update old flocks** if they're missing species field

---

**After these fixes, rabbit and fish flocks should appear!** 🎉











