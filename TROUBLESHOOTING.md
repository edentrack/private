# Troubleshooting Guide

## Issue: "Failed to load users" Error

### Solution 1: Check RLS Policies
The profiles table might have RLS policies blocking the query. Run this in Supabase SQL Editor to verify:

```sql
-- Check if you can view profiles
SELECT id, email, full_name, account_status 
FROM profiles 
LIMIT 5;
```

If this fails, you need to update RLS policies.

### Solution 2: Use Admin RPC Function
The app now tries to use the `admin_list_users` RPC function first. If that doesn't work, it falls back to direct query.

### Solution 3: Verify Super Admin Status
Make sure you're actually a super admin:

```sql
SELECT id, email, is_super_admin, account_status
FROM profiles
WHERE email = 'your-email@example.com';
```

Should show `is_super_admin = true`

## Issue: Not Seeing All Features

### All 10 Features Should Be Visible:
1. ✅ Approve Users
2. 👥 Manage Users  
3. 🏢 Farms Management
4. 💰 Pricing Tiers
5. 💳 Billing & Subscriptions
6. 🏪 Marketplace Admin
7. 🔔 Announcements
8. 💬 Support Tickets
9. ⚙️ Platform Settings
10. 📊 Activity Logs

### If you only see 4 buttons:
- **Scroll down** - The buttons are in a grid that wraps
- **Check browser console** for errors
- **Hard refresh** the page (Cmd/Ctrl + Shift + R)
- **Clear browser cache**

### Grid Layout:
- On mobile: 1 column
- On tablet: 2 columns  
- On desktop: 3-4 columns (depending on screen size)

All 10 buttons should be visible, you may need to scroll to see them all.

## Issue: Empty Tables/No Data

### This is Normal For:
- **Marketplace Admin** - Empty until suppliers register
- **Support Tickets** - Empty until users create tickets
- **Announcements** - Empty until you create announcements
- **Activity Logs** - Will show admin actions once you perform actions

### Should Have Data:
- **Farms Management** - Should show all farms
- **Users Management** - Should show all users
- **Billing & Subscriptions** - Should show subscription data

## Quick Fixes

### Refresh the App:
1. Stop the dev server (Ctrl+C)
2. Restart: `npm run dev`
3. Hard refresh browser (Cmd/Ctrl + Shift + R)

### Check Browser Console:
1. Open Developer Tools (F12)
2. Check Console tab for errors
3. Check Network tab for failed requests

### Verify Database:
```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'platform_settings',
  'marketplace_suppliers',
  'platform_announcements',
  'support_tickets'
);
```

All 4 should exist.

## Still Having Issues?

1. Check browser console for specific error messages
2. Check Supabase logs for database errors
3. Verify all 4 migrations ran successfully
4. Make sure you're logged in as super admin












