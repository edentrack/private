# Super Admin Migrations Checklist

## ✅ For User/Farm Editing Features (What I Just Added)

The editing features I just implemented require these migrations:

### **Essential Migrations for Editing:**

1. **Super Admin System** (REQUIRED)
   - **File**: `supabase/migrations/20251215231649_create_super_admin_system.sql`
   - **What it creates:**
     - `is_super_admin` column in profiles
     - `account_status` column in profiles
     - `subscription_tier` column in profiles
     - `subscription_tiers` table
     - `admin_actions` table
     - RLS policies for super admin access
   - **Status**: ✅ Must be run for editing to work

2. **Super Admin Impersonation System** (REQUIRED)
   - **File**: `supabase/migrations/20251216045248_create_super_admin_impersonation_system.sql`
   - **What it creates:**
     - `admin_set_user_status()` RPC function
     - `admin_set_user_tier()` RPC function ← **Needed for tier editing**
     - `admin_start_impersonation()` RPC function
     - `super_admin_impersonation_logs` table
   - **Status**: ✅ Must be run for editing to work

### **Additional Migrations for Other Features:**

3. **Platform Settings** (Optional - for PlatformSettings panel)
   - **File**: `supabase/migrations/20251217000001_create_platform_settings_table.sql`

4. **Marketplace Suppliers** (Optional - for MarketplaceAdmin panel)
   - **File**: `supabase/migrations/20251217000002_create_marketplace_suppliers_table.sql`

5. **Platform Announcements** (Optional - for Announcements panel)
   - **File**: `supabase/migrations/20251217000003_create_platform_announcements_table.sql`

6. **Support Tickets** (Optional - for SupportTickets panel)
   - **File**: `supabase/migrations/20251217000004_create_support_tickets_table.sql`

---

## 🔍 How to Check If Migrations Are Already Run

Run this SQL in Supabase SQL Editor to check:

```sql
-- Check if super admin columns exist
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('is_super_admin', 'account_status', 'subscription_tier');

-- Check if admin RPC functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('admin_set_user_status', 'admin_set_user_tier');

-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('subscription_tiers', 'admin_actions', 'super_admin_impersonation_logs');
```

**Expected Results:**
- Should return 3 rows for profiles columns
- Should return 2 rows for RPC functions
- Should return 3 rows for tables

---

## ⚠️ If Migrations Are Missing

If any of the checks above return empty results, you need to run the migrations:

1. **Go to Supabase Dashboard → SQL Editor**
2. **Run these migrations in order:**
   - `20251215231649_create_super_admin_system.sql` (FIRST)
   - `20251216045248_create_super_admin_impersonation_system.sql` (SECOND)
   - Then the 4 optional ones if you want those features

---

## ✅ Quick Test After Running Migrations

After running migrations, test editing:

1. Go to `#/super-admin/users`
2. Click "Edit" on any user
3. Try changing name, phone, or subscription tier
4. Click "Save"
5. Verify changes are saved

If it works without errors, migrations are good! ✅

---

## 📝 Summary

**Minimum Required for Editing Features:**
- ✅ `20251215231649_create_super_admin_system.sql`
- ✅ `20251216045248_create_super_admin_impersonation_system.sql`

**For Full Super Admin Features:**
- Add the 4 optional migrations (#3-6) from `MIGRATION_STATUS_COMPLETE.md`
