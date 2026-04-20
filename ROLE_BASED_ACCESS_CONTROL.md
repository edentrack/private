# Role-Based Access Control (RBAC) Implementation

## Overview

The poultry farm management system now includes comprehensive role-based access control that governs navigation visibility, route access, and action permissions across all modules.

## Roles & Permissions

### 1. Owner (Full Access)
**Visible Modules:**
- Dashboard (Home & Smart Dashboard with AI insights)
- Flocks Management
- Analytics
- Tasks
- Inventory (Feed & Other Items)
- Vaccinations
- Expenses
- Sales (Receipts, Invoices, Customers)
- Shifts
- Team Management
- Payroll
- Settings

**Actions:** Create, Edit, Delete, View on all modules

**Special Permissions:**
- Can promote members to Owner role
- Full billing and subscription access
- Can manage all team members
- Access to all financial data

---

### 2. Manager (Almost Full Access)
**Visible Modules:**
- Dashboard (Home & Smart Dashboard)
- Flocks Management
- Analytics
- Tasks
- Inventory
- Vaccinations
- Expenses
- Sales
- Shifts
- Team Management (View Only)
- Payroll
- Settings

**Actions:** Create, Edit, Delete, View on most modules

**Restrictions:**
- Cannot promote members to Owner role
- No billing/subscription access
- Can view but not edit team member roles (except workers)
- Cannot remove owner from team

---

### 3. Worker (Limited Task-Focused Access)
**Visible Modules:**
- My Workspace (Custom Worker Dashboard)
- Dashboard (Read-only)
- Flocks (Read-only, basic info only)
- Tasks (Can view and complete)
- Shifts (Can view own shifts)
- Vaccinations (View only)

**Hidden Modules:**
- Expenses
- Sales
- Analytics
- Team
- Payroll
- Inventory
- Settings
- Mortality
- Weight

**Actions:**
- Can complete assigned tasks
- Can view but not edit flock information
- Can view vaccination schedules
- Can view own shift schedule

**Special Features:**
- Simplified "My Workspace" dashboard showing:
  - Today's pending tasks
  - Completed tasks count
  - Today and tomorrow shift schedule
  - Quick task completion
- NO access to financial data (costs, prices, salaries)
- NO access to team management
- Task completion based on role permissions

---

### 4. Viewer (Read-Only Access)
**Visible Modules:**
- Dashboard
- Smart Dashboard
- Flocks (Read-only)
- Analytics (Read-only)
- Tasks (Read-only)
- Inventory (Read-only)
- Vaccinations (Read-only)
- Expenses (Read-only)
- Sales (Read-only)
- Mortality (Read-only)
- Weight (Read-only)
- Shifts (Read-only)

**Hidden Modules:**
- Team
- Payroll
- Settings

**Actions:** View only - NO create, edit, or delete actions

**Use Cases:**
- Accountants reviewing financial data
- External auditors
- Consultants
- Farm advisors

---

## Implementation Details

### 1. Single Source of Truth
**File:** `/src/utils/rolePermissions.ts`

This file contains:
- Role type definitions
- Module ID definitions
- Permission mappings for each role
- Helper functions for permission checks

```typescript
// Check if user has permission for specific action
hasPermission(role, 'expenses', 'create')

// Check if module is visible to role
isModuleVisible(role, 'payroll')

// Check if module is read-only for role
isModuleReadOnly(role, 'flocks')
```

### 2. Role Storage & Fetching
**File:** `/src/contexts/AuthContext.tsx`

The AuthContext automatically:
- Fetches user's role from `farm_members` table on login
- Updates role when user switches farms
- Stores role in `currentRole` state
- Makes role available throughout the app

```typescript
const { currentRole } = useAuth();
// Returns: 'owner' | 'manager' | 'worker' | 'viewer' | null
```

### 3. Route Guards
**File:** `/src/components/common/RequireRole.tsx`

The `RequireRole` component:
- Wraps protected views/routes
- Checks user's role against module permissions
- Shows loading state while checking
- Displays "Access Restricted" message if unauthorized
- Redirects to dashboard after 2 seconds
- Prevents route access via direct URL manipulation

Usage:
```typescript
<RequireRole moduleId="payroll" onUnauthorized={handleUnauthorized}>
  <PayrollPage />
</RequireRole>
```

### 4. Navigation Filtering
**File:** `/src/components/dashboard/DashboardLayout.tsx`

The navigation automatically:
- Filters menu items based on role permissions
- Hides unauthorized modules completely (not just disabled)
- Shows appropriate items in sidebar and mobile nav
- Hides Settings menu for workers

Navigation items are completely removed from the DOM if not visible, preventing:
- Accidental navigation attempts
- UI clutter
- Confusion about available features

### 5. Enhanced Worker Dashboard
**File:** `/src/components/worker/WorkerDashboard.tsx`

Features:
- Custom "My Workspace" view
- Summary cards:
  - Pending tasks count
  - Completed tasks count
  - Today's shifts
  - Active flocks count
- Shift schedule display (today & tomorrow)
- Task filtering (All, Pending, Completed)
- Quick task completion
- Time-based task status indicators
- No financial information visible

---

## Security Considerations

### Frontend Protection
1. **Navigation Hiding**: Unauthorized modules don't appear in menu
2. **Route Guards**: Direct URL access redirected to dashboard
3. **Component-Level Checks**: Permission checks in components
4. **Action Buttons**: Create/Edit/Delete buttons hidden based on role

### Backend Protection (Existing RLS)
The app already has Row-Level Security (RLS) on all database tables, providing:
- Server-side enforcement of permissions
- Protection against direct database access
- Role-based data filtering at query time

**Important:** Frontend role checks are UX enhancements only. Backend RLS is the actual security enforcement.

---

## Testing Guide

### Test as Owner
1. Log in as an owner account
2. Verify all modules visible in navigation
3. Verify access to Team, Payroll, Settings
4. Verify ability to create/edit/delete in all modules

### Test as Manager
1. Change role to manager in database:
   ```sql
   UPDATE farm_members SET role = 'manager' WHERE user_id = 'USER_ID';
   ```
2. Refresh page
3. Verify all modules visible except billing
4. Verify Team module shows but is read-only for role changes
5. Verify cannot promote users to owner

### Test as Worker
1. Change role to worker in database:
   ```sql
   UPDATE farm_members SET role = 'worker' WHERE user_id = 'USER_ID';
   ```
2. Refresh page
3. Verify only "My Workspace", Dashboard, Flocks, Tasks, Shifts, Vaccinations visible
4. Verify Expenses, Sales, Analytics, Team, Payroll hidden
5. Verify Settings not in account menu
6. Try accessing `/expenses` directly via URL manipulation
7. Verify redirect to dashboard with "Access Restricted" message
8. Verify "My Workspace" shows shifts and tasks
9. Verify no cost/price information visible anywhere

### Test as Viewer
1. Change role to viewer in database:
   ```sql
   UPDATE farm_members SET role = 'viewer' WHERE user_id = 'USER_ID';
   ```
2. Refresh page
3. Verify most modules visible but all are read-only
4. Verify no Create/Add buttons appear
5. Verify no Edit/Delete actions available
6. Verify Team, Payroll, Settings hidden

### Test Route Protection
1. As worker, try these URLs directly:
   - `/payroll` - Should redirect to dashboard
   - `/expenses` - Should redirect to dashboard
   - `/team` - Should redirect to dashboard
   - `/analytics` - Should redirect to dashboard
2. Verify "Access Restricted" message displays briefly
3. Verify redirect happens after 2 seconds

---

## Role Permission Matrix

| Module | Owner | Manager | Worker | Viewer |
|--------|-------|---------|--------|--------|
| Dashboard | Full | Full | View | View |
| Smart Dashboard | Full | Full | Hidden | View |
| Flocks | Full | Full | View | View |
| Tasks | Full | Full | Complete | View |
| Inventory | Full | Full | Hidden | View |
| Expenses | Full | Full | Hidden | View |
| Sales | Full | Full | Hidden | View |
| Analytics | View | View | Hidden | View |
| Vaccinations | Full | Full | View | View |
| Mortality | Full | Full | Hidden | View |
| Weight | Full | Full | Hidden | View |
| Shifts | Full | Full | View Own | View |
| Team | Full | View | Hidden | Hidden |
| Payroll | Full | Full | Hidden | Hidden |
| Settings | Full | Full | Hidden | Hidden |

**Legend:**
- Full: Create, Edit, Delete, View
- View: Read-only access
- View Own: Can only see own data
- Complete: Can mark tasks as completed
- Hidden: Module not visible at all

---

## Future Enhancements

1. **Custom Role Builder**: Allow owners to create custom roles with specific permissions
2. **Granular Permissions**: Per-module action permissions (e.g., can view payroll but not edit)
3. **Temporary Permissions**: Grant elevated permissions for specific time periods
4. **Permission Audit Log**: Track when permissions are changed and by whom
5. **Module-Level Settings**: Hide specific modules even for owners
6. **Worker Task Assignment**: Only show workers tasks assigned to them
7. **Flock-Level Permissions**: Restrict access to specific flocks

---

## Troubleshooting

### User can't access expected modules
1. Check user's role in database: `SELECT role FROM farm_members WHERE user_id = 'USER_ID'`
2. Verify user is active: `SELECT is_active FROM farm_members WHERE user_id = 'USER_ID'`
3. Check if role is correctly loaded in AuthContext
4. Clear browser cache and reload

### Navigation items not showing
1. Verify rolePermissions.ts has module listed for that role
2. Check DashboardLayout is using isModuleVisible correctly
3. Verify currentRole is not null in AuthContext

### Route guard not working
1. Check RequireRole component is wrapping the route
2. Verify moduleId matches the ID in rolePermissions.ts
3. Check onUnauthorized handler is set

### Worker sees financial data
1. Verify role is actually 'worker' in database
2. Check if component is checking role before displaying costs
3. Review RLS policies on financial tables

---

## API Changes

No API or database schema changes were required for this implementation. The system uses existing `farm_members.role` column.

---

## Performance Considerations

- Permission checks are in-memory and very fast
- No additional API calls for permission checking
- Role is loaded once on login and cached
- Navigation filtering happens on every render but is negligible

---

Last Updated: December 2024
Version: 1.0.0
