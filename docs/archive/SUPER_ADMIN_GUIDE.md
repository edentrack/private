# EDENTRACK Super Admin System - Complete Guide

## Overview

A complete super admin system has been built for EDENTRACK to manage users, approve new farm owners, set pricing tiers, and monitor the platform.

## What Was Built

### 1. Database Schema
- **New columns in `profiles` table:**
  - `is_super_admin` - Flag to identify platform administrators
  - `account_status` - Tracks user state (pending/active/suspended/rejected)
  - `subscription_tier` - User's pricing plan (free/pro/enterprise)
  - `subscription_expires_at` - Subscription expiry tracking
  - `approved_by` and `approved_at` - Audit trail for approvals

- **New tables:**
  - `subscription_tiers` - Pricing plans with limits and features
  - `admin_actions` - Logs all admin actions for audit trail
  - `platform_stats` - Daily platform analytics

### 2. Super Admin Pages
All accessible via hash-based routes:

- **Dashboard** (`#/super-admin`)
  - Platform statistics (users, farms, flocks, revenue)
  - Quick action buttons
  - Recent activity feed

- **User Approvals** (`#/super-admin/approvals`)
  - Review pending user registrations
  - Approve or reject new users
  - View user details before approval

- **Users Management** (`#/super-admin/users`)
  - View all platform users
  - Filter by status (pending/active/suspended/rejected)
  - Search by email or name
  - Suspend or activate users

- **Pricing Management** (`#/super-admin/pricing`)
  - Manage subscription tiers
  - Edit pricing and limits
  - Configure features for each tier

### 3. User Flow Changes
- **New user registration:**
  1. User signs up → Status = PENDING
  2. Redirected to "Waiting Approval" page
  3. Super Admin approves → Status = ACTIVE
  4. User can now login and use app

- **Account status screens:**
  - Pending users see waiting approval page
  - Suspended users see account suspended message
  - Rejected users see account rejected message

## How to Access Super Admin

### Step 1: Make Yourself Super Admin

After the app is deployed, run this SQL in your Supabase SQL Editor:

```sql
-- Set edentrack.app@gmail.com as super admin
UPDATE profiles
SET is_super_admin = true,
    account_status = 'active'
WHERE email = 'edentrack.app@gmail.com';
```

### Step 2: Access Super Admin Dashboard

Navigate to your app and add `#/super-admin` to the URL:
- Example: `https://your-app.com/#/super-admin`

You'll see the super admin dashboard with all platform statistics.

## Using the Super Admin System

### Approving New Users

1. Go to `#/super-admin/approvals`
2. Review each pending user's details
3. Click "Approve" or "Reject"
4. Approved users can immediately log in
5. Rejected users will see a rejection message

### Managing Existing Users

1. Go to `#/super-admin/users`
2. Search for specific users
3. Filter by account status
4. Suspend or activate users as needed

### Managing Pricing Tiers

1. Go to `#/super-admin/pricing`
2. Click "Edit" on any tier
3. Update prices, flock limits, or team member limits
4. Click "Save" to apply changes

## Default Pricing Tiers

Three tiers are pre-configured:

**Free Tier**
- $0/month
- Max 2 flocks
- Max 1 team member
- Basic reports only

**Pro Tier**
- $10/month ($100/year)
- Max 999 flocks
- Max 5 team members
- Advanced reports
- WhatsApp reports
- Email support

**Enterprise Tier**
- $30/month ($300/year)
- Max 9999 flocks
- Max 999 team members
- All features
- Priority support
- API access

## Security Features

- Only super admins can access super admin pages
- All admin actions are logged in `admin_actions` table
- Row Level Security (RLS) enforces access control
- Approval workflow ensures quality control
- Audit trail for compliance

## Key Files Created

### Components
- `src/components/superadmin/SuperAdminGuard.tsx` - Access control
- `src/components/superadmin/SuperAdminDashboard.tsx` - Main dashboard
- `src/components/superadmin/UserApprovals.tsx` - Approval system
- `src/components/superadmin/UsersManagement.tsx` - User management
- `src/components/superadmin/PricingManagement.tsx` - Pricing control
- `src/components/auth/WaitingApprovalPage.tsx` - Pending user page

### Database
- Migration applied: `create_super_admin_system.sql`

### App Updates
- `src/App.tsx` - Added super admin routes and account status checks
- `src/contexts/AuthContext.tsx` - Sets new users as pending

## Admin Action Logging

All admin actions are automatically logged:
- User approvals/rejections
- User suspensions/activations
- Pricing tier updates
- Includes timestamp and admin ID

View logs in the `admin_actions` table or on the dashboard's Recent Activity section.

## Troubleshooting

### Can't access super admin?
- Verify you ran the SQL command to set `is_super_admin = true`
- Check you're using the correct email
- Refresh the page after updating the database

### Users stuck in pending?
- Go to Approvals page and approve them manually
- Check RLS policies are properly configured

### Need to bypass approval for testing?
Run this to approve all pending users:
```sql
UPDATE profiles
SET account_status = 'active'
WHERE account_status = 'pending';
```

## Next Steps

1. **Set yourself as super admin** using the SQL command above
2. **Access the dashboard** at `#/super-admin`
3. **Approve any pending users** who signed up during testing
4. **Configure pricing tiers** if needed
5. **Monitor platform activity** regularly

## Support

All super admin functionality is fully integrated and ready to use. The system provides complete control over:
- User lifecycle (registration → approval → active use)
- Platform access (suspend/activate users)
- Subscription management (tiers, pricing, limits)
- Activity monitoring (stats, logs, analytics)

Your EDENTRACK super admin system is now live!
