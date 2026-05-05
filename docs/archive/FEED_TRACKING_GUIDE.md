# Feed Tracking System Guide

## 📍 Where to Find the New Features

### 1. **Daily Inventory Usage Widget** (Dashboard)
- **Location**: Main Dashboard → "Daily Inventory Usage" widget
- **What you'll see**:
  - For each feed item, you'll see estimated daily usage (e.g., "~2.5 bags/day")
  - Days until empty prediction
  - Low stock warnings

### 2. **Feed Recording Modal**
- **Location**: Click "Record Usage" on any feed item in the Daily Inventory Usage widget
- **New Feature**: Toggle checkbox for "Feed Given to Buckets"
  - ✅ **Checked**: Records when feed is given to buckets (doesn't reduce inventory)
  - ❌ **Unchecked**: Records daily usage (reduces inventory)

### 3. **Feed Predictions Display**
When you open the record modal for a feed item, you'll see:
- **Current Stock**: How much feed you have
- **Estimated Daily Usage**: Calculated from your feeding history
- **Days Until Empty**: Prediction based on current stock and usage rate
- **Next Feeding Estimate**: Suggested date to reload buckets

## 🔄 How It Works

### For New Feed Tracking:
1. **First Time**: When you add feed to buckets, check "Feed Given to Buckets" and record the quantity
2. **Next Time**: When you add feed again, record it the same way
3. **Automatic Calculation**: The system calculates:
   - Days between feedings
   - Average daily consumption
   - When stock will run out

### For Historical Data:
The system has automatically backfilled your historical feed purchases from expenses into feed_givings records. This means:
- ✅ Your past feed purchases are now tracked
- ✅ Daily usage can be calculated from your history
- ✅ Predictions are available immediately

## 📊 Migration Files

### 1. `20250120000000_create_feed_givings_tracking.sql`
- Creates the `feed_givings` table
- Sets up security policies
- **Location**: `supabase/migrations/`

### 2. `20250120000001_backfill_feed_givings_from_expenses.sql`
- Backfills historical feed givings from your expense records
- Uses feed purchase dates as "given_at" dates
- **Location**: `supabase/migrations/`

## 🚀 How to Run the Migrations

### Option 1: Via Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of each migration file
4. Run them in order (00000 first, then 00001)

### Option 2: Via Supabase CLI
```bash
# If you have Supabase CLI installed
supabase db push
```

## 📈 Understanding the Predictions

### Daily Usage Calculation
- The system looks at your last 5 feed givings
- Calculates the time between each feeding
- Determines average daily consumption

### Days Until Empty
- Formula: `Current Stock ÷ Daily Usage = Days Until Empty`
- Color coding:
  - 🔴 Red: ≤3 days (urgent)
  - 🟠 Orange: ≤7 days (soon)
  - 🟢 Green: >7 days (good)

### Next Feeding Estimate
- Based on average days between your feedings
- Suggests when you should reload buckets

## 💡 Tips

1. **Be Consistent**: Always use "Feed Given to Buckets" when adding feed to buckets
2. **Check Predictions**: Review the predictions regularly to plan purchases
3. **Historical Data**: Your past expenses are already included, so predictions work immediately
4. **Multiple Feed Types**: Each feed type is tracked separately

## ❓ Troubleshooting

### Predictions Not Showing?
- Make sure you have at least 2 feed givings recorded
- Check that feed purchases are linked to inventory in expenses

### Daily Usage Seems Wrong?
- The system needs at least 2 feedings to calculate
- More data = more accurate predictions
- Check that you're using "Feed Given" consistently

### Want to Recalculate?
- The backfill function can be run manually
- Or delete old feed_givings and re-run the backfill migration
