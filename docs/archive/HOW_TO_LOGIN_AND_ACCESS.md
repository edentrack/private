# How to Login and Access Super Admin

## Step 1: Make Yourself Super Admin

### In Supabase SQL Editor:

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" in left sidebar
4. Click "New query"
5. Paste this SQL (replace with YOUR email):

```sql
-- Make yourself super admin
UPDATE profiles
SET 
  is_super_admin = true,
  account_status = 'active'
WHERE email = 'YOUR-EMAIL@example.com';

-- Verify it worked
SELECT 
  id,
  email,
  full_name,
  is_super_admin,
  account_status
FROM profiles
WHERE email = 'YOUR-EMAIL@example.com';
```

6. Click "Run" (or Cmd/Ctrl + Enter)
7. You should see `is_super_admin = true` in the results

## Step 2: Start Your Dev Server

### In Terminal:

```bash
cd "/Users/great/Downloads/project 4"
npm run dev
```

Wait for it to say: `Local: http://localhost:5173`

## Step 3: Open in Browser

1. Open your browser
2. Go to: `http://localhost:5173`
3. You should see the login page

## Step 4: Login

1. Enter your email (the one you made super admin)
2. Enter your password
3. Click "Login" or press Enter

## Step 5: Access Super Admin

After login, you should be **automatically redirected** to:
- `http://localhost:5173/#/super-admin`

If not, manually navigate to:
- `http://localhost:5173/#/super-admin`

## What You Should See

### Super Admin Dashboard:
- **Header**: "Super Admin" with "SUPER ADMIN" badge
- **6 Stat Cards**: Total Users, Active Users, Pending Approvals, Revenue, Farms, Flocks
- **10 Quick Action Buttons** (scroll down to see all):
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
- **Recent Activity** section at bottom

## Troubleshooting

### "Access denied" or redirected to dashboard?
- Make sure you ran the SQL to set `is_super_admin = true`
- Verify in Supabase: `SELECT email, is_super_admin FROM profiles WHERE email = 'your-email';`
- Should show `is_super_admin = true`

### Can't see all 10 buttons?
- **Scroll down** - they're in a grid that wraps
- Try making browser window wider
- All 10 should be visible, just scroll

### "Failed to load users" error?
- **Hard refresh** your browser: `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)
- The code fix is already in your files, just needs browser refresh

### Dev server not starting?
- Make sure Node.js is installed: `node --version`
- Install dependencies: `npm install`
- Check if port 5173 is already in use

### Forgot password?
- Click "Forgot Password" on login page
- Or reset in Supabase Dashboard → Authentication → Users

## Quick Checklist

- [ ] Ran SQL to make yourself super admin
- [ ] Verified `is_super_admin = true` in Supabase
- [ ] Started dev server (`npm run dev`)
- [ ] Opened browser to `http://localhost:5173`
- [ ] Logged in with your email
- [ ] Navigated to `#/super-admin`
- [ ] See Super Admin Dashboard with all features

## Need Help?

If you're still having issues:
1. Check browser console (F12) for errors
2. Check terminal for dev server errors
3. Verify you're logged in as super admin in Supabase
4. Try logging out and back in












