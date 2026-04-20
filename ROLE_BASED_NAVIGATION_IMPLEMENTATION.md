# Role-Based Navigation & Permissions Implementation

## Overview

This document describes the comprehensive role-based access control system implemented for Ebenezer Farm, including dynamic navigation, owner-controlled manager permissions, and financial data hiding for workers.

---

## Features Implemented

### 1. Database Layer

**New Table: `farm_permissions`**
- Stores owner-controlled permission toggles for managers
- One record per farm
- Default permissions set automatically on farm creation
- RLS policies ensure only owners can modify, managers can read

**Permission Fields:**
- `managers_can_view_financials` - Access to expenses, sales, analytics (default: true)
- `managers_can_create_expenses` - Create/edit expense records (default: true)
- `managers_can_create_sales` - Create/edit sales, receipts, invoices (default: true)
- `managers_can_manage_inventory` - Add/adjust inventory (default: true)
- `managers_can_manage_payroll` - Process payroll runs (default: false)
- `managers_can_manage_team` - Invite/manage team members (default: false)
- `managers_can_edit_flock_costs` - Edit purchase prices (default: false)
- `managers_can_delete_records` - Delete any records (default: false)
- `managers_can_edit_shift_templates` - Manage recurring shifts (default: true)
- `managers_can_mark_vaccinations` - Mark vaccinations complete (default: true)

**Helper Functions:**
- `is_farm_owner(farm_id)` - Check if current user is farm owner
- `is_farm_owner_or_manager(farm_id)` - Check if user is owner or manager
- `get_farm_permissions(farm_id)` - Get or create farm permissions

---

### 2. Frontend Permissions System

**New Utilities:**

#### `src/utils/navigationPermissions.ts`
Centralized permissions logic for:
- Module visibility by role and farm permissions
- Action permissions (create, edit, delete)
- Financial data visibility
- Module access control

**Key Functions:**
- `canViewModule(role, moduleName, farmPermissions)` - Check if role can view module
- `canPerformAction(role, action, context, farmPermissions)` - Check if role can perform action
- `shouldHideFinancialData(role)` - Check if financial data should be hidden (workers)
- `getVisibleModules(role, farmPermissions)` - Get list of visible modules

#### `src/contexts/PermissionsContext.tsx`
React context that:
- Loads farm permissions from database
- Provides permissions to all components
- Refreshes permissions when needed
- Handles loading states

---

### 3. Navigation System

**Updated Components:**

#### `DashboardLayout.tsx`
- Uses `canViewModule` to filter navigation items
- Dynamically shows/hides tabs based on role and permissions
- Shows "My Work" tab for workers
- Hides settings from non-owners

#### `RequireRole.tsx`
- Updated to use new permission system
- Checks module visibility with farm permissions
- Shows access denied message for unauthorized access
- Redirects to dashboard after 2 seconds

---

### 4. Role-Specific Navigation

**Owner (Full Access)**
- Sees all modules
- Can access Settings and all permission controls
- Full create/edit/delete permissions everywhere

**Manager (Configurable)**
- Default visible modules:
  - Dashboard, Smart Dashboard
  - Flocks, Tasks, Shifts
  - Vaccinations, Mortality, Weight
  - Inventory (if enabled)
  - Expenses, Sales, Analytics (if view financials enabled)
  - Payroll (if enabled)
  - Team (if enabled)

- Hidden modules:
  - Settings (owner only)
  - Billing (owner only)
  - My Work (worker only)

**Worker (Simplified)**
- Visible modules ONLY:
  - Dashboard (simplified)
  - My Work
  - Tasks (can mark complete)
  - Shifts (view only)
  - Vaccinations (view only)
  - Flocks (view only, no costs)

- Hidden modules:
  - Everything else
  - All financial data throughout the app

**Viewer (Read-Only)**
- Sees most modules
- Cannot perform any create/edit/delete actions
- Cannot see Team, Payroll, Settings, Billing
- All action buttons hidden

---

### 5. Financial Data Hiding for Workers

**Components Updated:**
- `FlockManagement.tsx` - Hidden purchase prices and sale prices
- `ExpenseTracking.tsx` - Hidden all expense amounts and totals
- `SalesManagement.tsx` - Hidden revenue totals
- `AnalyticsDashboard.tsx` - Hidden all financial metrics
- `DashboardHome.tsx` - Hidden spending overview
- `SpendingOverviewCard.tsx` - Hidden spending amounts
- `PayrollPage.tsx` - Hidden salary/wage amounts
- `ReceiptsList.tsx` - Hidden receipt totals and prices

**Implementation Pattern:**
```typescript
import { shouldHideFinancialData } from '../../utils/navigationPermissions';
import { useAuth } from '../../contexts/AuthContext';

const { currentRole } = useAuth();
const hideFinancials = shouldHideFinancialData(currentRole);

{hideFinancials ? (
  <span className="text-gray-400 italic">Hidden</span>
) : (
  <span>{formatCurrency(amount)}</span>
)}
```

---

### 6. Owner Settings UI

**New Component: `FarmPermissionsSettings.tsx`**
- Beautiful, organized settings panel
- Grouped by category (Financial, Operations, Team & Payroll, Data Management)
- Toggle switches for each permission
- Clear descriptions for each permission
- Save button with loading state
- Success/error messages
- Info banner explaining permission scope

**Integrated into Settings Page:**
- Only visible to farm owners
- Appears as separate section in Settings
- Independent save functionality
- Real-time permission updates

---

## Verification Checklist

### ✅ Worker Access
- [x] Only sees: Dashboard, My Work, Tasks, Shifts, Vaccinations, Flocks
- [x] Does NOT see: Inventory, Expenses, Sales, Analytics, Payroll, Team, Settings
- [x] Cannot see any financial data (costs, prices, revenue, profit)
- [x] Cannot create/edit/delete anything (except mark tasks complete)

### ✅ Viewer Access
- [x] Can see most modules (Dashboard, Flocks, Tasks, etc.)
- [x] Cannot perform any create/edit/delete actions
- [x] All action buttons hidden throughout app
- [x] Cannot access Team, Payroll, Settings, Billing

### ✅ Manager Access (Default)
- [x] Cannot access Team tab (toggle is OFF by default)
- [x] Cannot access Billing/Subscription
- [x] CAN see Expenses/Sales if financials enabled
- [x] Respects all permission toggles

### ✅ Manager Access (Toggles Enabled)
- [x] Owner can toggle "Managers can view financials" - Manager sees/hides financial modules
- [x] Owner can toggle "Managers can manage team" - Team tab appears/disappears
- [x] Owner can toggle "Managers can manage payroll" - Payroll tab appears/disappears
- [x] Owner can toggle "Managers can delete records" - Delete buttons appear/disappear

### ✅ Owner Access
- [x] Sees all modules
- [x] Full create/edit/delete access
- [x] Can access Settings and configure all permissions
- [x] Permissions persist after refresh

### ✅ Technical
- [x] Build passes without errors
- [x] No TypeScript errors
- [x] RLS policies prevent unauthorized access
- [x] Navigation updates dynamically
- [x] Permissions load correctly
- [x] Routes are protected

---

## Files Created

1. **Database Migration:**
   - `supabase/migrations/[timestamp]_create_farm_permissions_table.sql`

2. **Type Definitions:**
   - Updated `src/types/database.ts` with `FarmPermissions` interface

3. **Utilities:**
   - `src/utils/navigationPermissions.ts` - Core permissions logic

4. **Contexts:**
   - `src/contexts/PermissionsContext.tsx` - Permissions state management

5. **Components:**
   - `src/components/settings/FarmPermissionsSettings.tsx` - Owner settings UI

## Files Modified

1. **Core App:**
   - `src/App.tsx` - Added PermissionsProvider

2. **Layout:**
   - `src/components/dashboard/DashboardLayout.tsx` - Dynamic navigation

3. **Access Control:**
   - `src/components/common/RequireRole.tsx` - Updated permission checks

4. **Settings:**
   - `src/components/settings/SettingsPage.tsx` - Added permissions UI

5. **Components with Action Buttons:**
   - `src/components/tasks/TasksPage.tsx` - Hide add button from viewers
   - `src/components/flocks/FlockManagement.tsx` - Hide create/edit/delete from viewers
   - `src/components/expenses/ExpenseTracking.tsx` - Hide add/edit from viewers
   - `src/components/inventory/InventoryPage.tsx` - Hide add/adjust from viewers
   - `src/components/eggs/EggInventory.tsx` - Hide log buttons from viewers
   - `src/components/mortality/MortalityTracking.tsx` - Hide controls from viewers
   - `src/components/weight/WeightTracking.tsx` - Hide save from viewers
   - `src/components/vaccinations/VaccinationSchedule.tsx` - Hide add/complete from viewers

6. **Components with Financial Data:**
   - `src/components/flocks/FlockManagement.tsx` - Hide costs from workers
   - `src/components/expenses/ExpenseTracking.tsx` - Hide amounts from workers
   - `src/components/sales/SalesManagement.tsx` - Hide revenue from workers
   - `src/components/sales/ReceiptsList.tsx` - Hide prices from workers
   - `src/components/analytics/AnalyticsDashboard.tsx` - Hide financials from workers
   - `src/components/dashboard/DashboardHome.tsx` - Hide spending from workers
   - `src/components/dashboard/SpendingOverviewCard.tsx` - Hide amounts from workers
   - `src/components/payroll/PayrollPage.tsx` - Hide salaries from workers

---

## Usage Guide

### For Farm Owners

1. **To Configure Manager Permissions:**
   - Navigate to Settings
   - Scroll to "Manager Permissions" section
   - Toggle permissions as needed
   - Click "Save Permissions"

2. **Default Recommendations:**
   - Keep "View Financials" ON if managers handle sales/expenses
   - Keep "Manage Team" OFF unless you have co-administrators
   - Keep "Delete Records" OFF to prevent accidental data loss
   - Keep "Manage Payroll" OFF unless managers handle salaries

### For Developers

1. **To Check Module Visibility:**
```typescript
import { canViewModule } from '../../utils/navigationPermissions';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';

const { currentRole } = useAuth();
const { farmPermissions } = usePermissions();

const canView = canViewModule(currentRole, 'expenses', farmPermissions);
```

2. **To Check Action Permission:**
```typescript
import { canPerformAction } from '../../utils/navigationPermissions';

const canCreate = canPerformAction(currentRole, 'create', 'expense', farmPermissions);
```

3. **To Hide Financial Data:**
```typescript
import { shouldHideFinancialData } from '../../utils/navigationPermissions';

const hideFinancials = shouldHideFinancialData(currentRole);

{!hideFinancials && <div>Financial content</div>}
```

---

## Security Notes

1. **Frontend permissions are for UX only** - All security is enforced at the database level via RLS
2. **Permissions are checked on every navigation** - Cannot bypass by manually changing URL
3. **Farm permissions table has strict RLS** - Only owners can modify, managers can read
4. **Helper functions use SECURITY DEFINER** - Safely check user roles
5. **All financial queries respect role** - Database enforces access control

---

## Future Enhancements

Potential additions:
1. Time-based permissions (temporary manager access)
2. Granular permissions per flock
3. Audit log for permission changes
4. Permission templates (e.g., "Full Manager", "Limited Manager")
5. Worker-specific task assignments with permissions
6. Read-only fields for managers (can view but not edit)

---

## Troubleshooting

**Issue: Navigation not updating after permission change**
- Solution: Check PermissionsContext is wrapping the app
- Verify refreshPermissions() is called after save

**Issue: Manager can't see modules they should see**
- Solution: Check farm_permissions table for the farm
- Verify RLS policies allow manager to read permissions
- Check canViewModule logic in navigationPermissions.ts

**Issue: Worker sees financial data**
- Solution: Verify shouldHideFinancialData is imported and used
- Check currentRole is correctly set
- Ensure component has conditional rendering

**Issue: Viewer can perform actions**
- Solution: Check all action buttons have permission checks
- Verify currentRole !== 'viewer' conditions are in place
- Review RequireRole wrapper on the page

---

## Conclusion

The role-based navigation and permissions system provides:
- ✅ Dynamic, role-appropriate navigation
- ✅ Owner-controlled manager permissions
- ✅ Financial data protection for workers
- ✅ Read-only access for viewers
- ✅ Simplified UI for workers
- ✅ Comprehensive access control
- ✅ Production-ready implementation

All features are working correctly and the build passes all checks.
