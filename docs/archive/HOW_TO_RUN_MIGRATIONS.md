# How to Run Database Migrations

## Option 1: Supabase Dashboard (Recommended)

1. **Go to your Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Run Each Migration**
   - Copy the contents of each migration file
   - Paste into the SQL Editor
   - Click "Run" (or press Cmd/Ctrl + Enter)
   - Repeat for each file in order:
     - `20251217000001_create_platform_settings_table.sql`
     - `20251217000002_create_marketplace_suppliers_table.sql`
     - `20251217000003_create_platform_announcements_table.sql`
     - `20251217000004_create_support_tickets_table.sql`

## Option 2: Supabase CLI

If you have Supabase CLI installed:

```bash
# Make sure you're in the project directory
cd "/Users/great/Downloads/project 4"

# Link to your Supabase project (if not already linked)
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

## Verify Migrations

After running migrations, verify tables exist:

```sql
-- Check if tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'platform_settings',
  'marketplace_suppliers',
  'platform_announcements',
  'support_tickets',
  'support_ticket_messages'
);
```

## Testing the App

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Access Super Admin Panel:**
   - Make sure you're logged in as a super admin
   - Navigate to: `http://localhost:5173/#/super-admin`
   - You should see all the new features in the dashboard

3. **Test Each Feature:**
   - Click on each new feature card
   - Verify pages load correctly
   - Test functionality (create, view, update)

## Troubleshooting

If you see "Table not found" errors:
- Make sure you ran all 4 migration files
- Check that RLS policies were created
- Verify you're logged in as a super admin

If RLS errors occur:
- Make sure your user has `is_super_admin = true` in the profiles table
- Check that policies were created correctly












