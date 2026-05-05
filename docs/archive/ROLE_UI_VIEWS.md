# Role-Based UI Views

This document shows what each role sees in the navigation and interface.

## Owner View

### Navigation Bar
```
[Dashboard] [AI Insights] [Flocks] [Analytics] [Tasks] [Inventory]
[Vaccinations] [Expenses] [Sales] [Shifts] [Team] [Payroll]
```

### Account Menu
```
- Settings ✓
- Sign Out
```

### Features
- All modules accessible
- Create/Edit/Delete buttons visible
- Full financial data access
- Team management with all role options
- Billing and settings access
- Can promote to Owner role

---

## Manager View

### Navigation Bar
```
[Dashboard] [AI Insights] [Flocks] [Analytics] [Tasks] [Inventory]
[Vaccinations] [Expenses] [Sales] [Shifts] [Team] [Payroll]
```

### Account Menu
```
- Settings ✓
- Sign Out
```

### Features
- Almost all modules accessible
- Create/Edit/Delete buttons visible
- Full financial data access
- Team management (view team, but cannot promote to Owner)
- NO billing access
- Payroll management
- Can manage workers

### Differences from Owner
- Cannot promote users to Owner role
- Cannot access billing/subscription settings
- Team role changes restricted

---

## Worker View

### Navigation Bar
```
[My Workspace] [Dashboard] [Flocks] [Tasks] [Shifts] [Vaccinations]
```

### Account Menu
```
- Sign Out (NO Settings option)
```

### Features
- **Custom "My Workspace" Dashboard** showing:
  - Pending tasks count
  - Completed tasks count
  - Today's shifts
  - Tomorrow's shifts
  - Active flocks count
  - Task list with completion buttons
  - Time-based task indicators (Overdue, Due Now, Later)

- **Dashboard**: Basic overview (read-only)
- **Flocks**: View flock names and basic info only (NO costs)
- **Tasks**: View and complete assigned tasks
- **Shifts**: View own shift schedule
- **Vaccinations**: View vaccination schedule (read-only)

### Hidden from Workers
- ❌ Expenses
- ❌ Sales
- ❌ Analytics
- ❌ Team
- ❌ Payroll
- ❌ Inventory
- ❌ Mortality
- ❌ Weight
- ❌ Settings
- ❌ AI Insights

### Data Restrictions
- NO cost information visible
- NO price information visible
- NO salary information visible
- NO financial analytics
- NO team member management
- Cannot see other workers' data

### Worker Dashboard Layout
```
┌─────────────────────────────────────────────────┐
│  My Workspace                                    │
│  Today, December 12, 2024                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐│
│  │ 5       │ │ 3       │ │ 2       │ │ 3      ││
│  │ Pending │ │Complete │ │ Shifts  │ │ Flocks ││
│  └─────────┘ └─────────┘ └─────────┘ └────────┘│
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  📅 Upcoming Shifts                              │
│  Today                                           │
│  08:00 - 16:00                    [scheduled]   │
│  Tomorrow                                        │
│  08:00 - 16:00                    [scheduled]   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  [All Tasks (8)] [Pending (5)] [Completed (3)] │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  [Due Now] [Flock A]                            │
│  Morning Feeding                                 │
│  Feed the birds with starter feed               │
│  🕐 Due by 09:00                                │
│  [Mark Complete]                                 │
└─────────────────────────────────────────────────┘
```

---

## Viewer View

### Navigation Bar
```
[Dashboard] [AI Insights] [Flocks] [Analytics] [Tasks] [Inventory]
[Vaccinations] [Expenses] [Sales] [Shifts] [Mortality] [Weight]
```

### Account Menu
```
- Sign Out (NO Settings option)
```

### Features
- Most modules visible
- **All modules are READ-ONLY**
- Can view financial data
- Can view analytics
- Can view all operational data
- NO Create/Add buttons
- NO Edit buttons
- NO Delete buttons

### Hidden from Viewers
- ❌ Team
- ❌ Payroll
- ❌ Settings

### Use Cases
- Accountants reviewing books
- External auditors
- Farm consultants
- Advisors
- Investors

---

## Route Protection Behavior

### Unauthorized Access Attempt
When a user tries to access a restricted page:

```
┌─────────────────────────────────────────────────┐
│             ⚠️                                   │
│      Access Restricted                          │
│                                                  │
│  You do not have permission to access           │
│  this module.                                    │
│                                                  │
│  Redirecting to dashboard...                    │
└─────────────────────────────────────────────────┘
```

**What happens:**
1. Page shows "Access Restricted" message
2. After 2 seconds, auto-redirects to dashboard
3. User sees their dashboard view

### Examples:
- Worker tries to access `/payroll` → Redirected to dashboard
- Worker tries to access `/expenses` → Redirected to dashboard
- Viewer tries to access `/team` → Redirected to dashboard
- Manager tries to access non-existent route → Redirected to dashboard

---

## Permission Enforcement Layers

### 1. Navigation Layer
- Unauthorized menu items completely removed from DOM
- User doesn't see options they can't access
- Clean, uncluttered interface

### 2. Route Layer
- RequireRole guard checks permissions
- Unauthorized routes show "Access Restricted"
- Auto-redirect to safe route

### 3. Component Layer
- Action buttons hidden based on permissions
- Read-only mode for viewers
- Form submissions blocked

### 4. Database Layer (Existing)
- Row-Level Security (RLS) enforces permissions
- Server-side protection
- Cannot be bypassed from frontend

---

## Visual Comparison

### Owner/Manager See:
```
Navigation: [14 items]
Actions: ✓ Create  ✓ Edit  ✓ Delete  ✓ View
Financial Data: ✓ Visible
Settings: ✓ Accessible
```

### Worker Sees:
```
Navigation: [6 items]
Actions: ✓ Complete Tasks  ✓ View Basic Info
Financial Data: ❌ Hidden
Settings: ❌ Not Accessible
Custom Dashboard: ✓ "My Workspace"
```

### Viewer Sees:
```
Navigation: [12 items]
Actions: ✓ View Only (No Create/Edit/Delete)
Financial Data: ✓ Visible
Settings: ❌ Not Accessible
```

---

## Testing Checklist

### As Owner
- [ ] See all 14+ navigation items
- [ ] Access Team management
- [ ] Access Payroll
- [ ] Access Settings
- [ ] See Create/Edit/Delete buttons
- [ ] View all financial data

### As Manager
- [ ] See all 14+ navigation items
- [ ] Access Team (view mode)
- [ ] Access Payroll
- [ ] Access Settings
- [ ] Cannot promote to Owner
- [ ] See Create/Edit/Delete buttons

### As Worker
- [ ] See only 6 navigation items
- [ ] See "My Workspace" dashboard
- [ ] See today/tomorrow shifts
- [ ] Can complete tasks
- [ ] Cannot see Expenses, Sales, Team, Payroll
- [ ] Cannot access Settings
- [ ] NO financial data visible
- [ ] Direct URL to /payroll redirects
- [ ] Direct URL to /expenses redirects

### As Viewer
- [ ] See 12 navigation items
- [ ] All modules are read-only
- [ ] NO Create buttons anywhere
- [ ] NO Edit buttons anywhere
- [ ] NO Delete buttons anywhere
- [ ] Can view financial data
- [ ] Cannot access Team, Payroll, Settings

---

## Screenshots Notes

For actual testing, use the following test accounts:

```sql
-- Create test users with different roles
UPDATE farm_members SET role = 'owner' WHERE user_id = 'test-owner-id';
UPDATE farm_members SET role = 'manager' WHERE user_id = 'test-manager-id';
UPDATE farm_members SET role = 'worker' WHERE user_id = 'test-worker-id';
UPDATE farm_members SET role = 'viewer' WHERE user_id = 'test-viewer-id';
```

Then log in with each account and verify:
1. Navigation items match this document
2. Access restrictions work
3. UI elements show/hide correctly
4. Route guards redirect properly

---

Last Updated: December 2024
