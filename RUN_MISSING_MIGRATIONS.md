# ⚠️ IMPORTANT: Run These Migrations!

You're seeing "table not found" errors because these migrations haven't been run yet.

## Quick Fix

Go to **Supabase SQL Editor** and run these 3 migrations:

### 1. Marketplace Suppliers Table
Copy and paste from: `supabase/migrations/20251217000002_create_marketplace_suppliers_table.sql`

### 2. Platform Announcements Table  
Copy and paste from: `supabase/migrations/20251217000003_create_platform_announcements_table.sql`

### 3. Support Tickets Table
Copy and paste from: `supabase/migrations/20251217000004_create_support_tickets_table.sql`

## How to Run

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" → "New query"
4. Copy the entire contents of each migration file
5. Paste into SQL Editor
6. Click "Run"
7. Repeat for all 3 files

After running all 3, refresh your browser and the errors will be gone!












