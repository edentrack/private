# Recurring Shifts System - Verification Checklist

## Overview
The Recurring Shifts system allows farm owners and managers to create shift templates that automatically generate shift instances for workers. This eliminates the need to manually create the same shift repeatedly.

## Features Implemented

### 1. Database Schema
- ✅ `shift_templates` table with full recurrence support
- ✅ Daily, Weekly, and Monthly frequency options
- ✅ Configurable intervals (every N days/weeks/months)
- ✅ Day-of-week selection for weekly schedules
- ✅ Day-of-month selection for monthly schedules
- ✅ Optional end dates
- ✅ Active/inactive toggle
- ✅ RLS policies (view for all farm members, create/edit/delete for owner/manager only)

### 2. Database Functions
- ✅ `generate_shifts_for_template(p_template_id, p_until)` - Generates shifts for a specific template
- ✅ `generate_shifts_for_farm(p_farm_id, p_until)` - Generates shifts for all active templates in a farm
- ✅ Duplicate prevention via unique constraint on `(template_id, shift_date)`

### 3. User Interface
- ✅ Recurring Schedule section in Shifts page (owner/manager only)
- ✅ Create/Edit recurring shift modal
- ✅ Template management list with:
  - Worker name and email
  - Shift times
  - Recurrence pattern display
  - Start/end dates
  - Active status indicator
  - Action buttons (Edit, Pause/Resume, Regenerate, Delete)

## Step-by-Step Verification Checklist

### ✅ Test 1: Create a Weekly Recurring Shift
1. Log in as a farm owner or manager
2. Navigate to the Shifts page
3. In the "Recurring Schedule" section, click "Create Recurring Shift"
4. Fill in the form:
   - Select a worker
   - Optional: Add a title (e.g., "Morning Shift")
   - Set start time: 8:00 AM
   - Set end time: 4:00 PM
   - Frequency: Weekly
   - Repeat every: 1 week
   - Select days: Monday and Friday
   - Start date: Today's date
   - Leave end date empty (ongoing)
   - Ensure "Active" is checked
5. Click "Create Template"
6. **Expected Result**: Template appears in the list, and shifts are visible for the next 60 days on Mon/Fri

### ✅ Test 2: Verify Generated Shifts
1. Scroll down to the "Shifts" list
2. Filter by the worker you selected in Test 1
3. **Expected Result**: Multiple shifts appear on Mondays and Fridays for the next 60 days
4. Verify times match (8:00 AM - 4:00 PM)
5. Verify status is "scheduled"

### ✅ Test 3: Page Refresh Persistence
1. Refresh the page (F5 or Ctrl+R)
2. **Expected Result**:
   - Recurring template is still visible
   - Generated shifts remain in the list
   - No duplicate shifts created

### ✅ Test 4: Pause Template
1. Find the recurring template in the list
2. Click the "Pause" button (pause icon)
3. **Expected Result**:
   - Status changes to "Paused"
   - Existing shifts remain
   - No new shifts will be generated for this template

### ✅ Test 5: Resume Template
1. Click the "Resume" button (play icon) on the paused template
2. **Expected Result**:
   - Status changes to "Active"
   - Template will generate shifts again when needed

### ✅ Test 6: Edit Template Time
1. Click the "Edit" button (pencil icon) on a template
2. Change the start time to 9:00 AM and end time to 5:00 PM
3. Click "Update Template"
4. **Expected Result**:
   - Template is updated
   - Existing shifts keep their original times
   - Future regeneration will use new times (9:00 AM - 5:00 PM)

### ✅ Test 7: Regenerate Shifts
1. Click the "Regenerate" (refresh icon) button on a template
2. **Expected Result**:
   - Alert shows number of new shifts created
   - No duplicates created (due to unique constraint)
   - If clicked twice, second time shows 0 shifts created

### ✅ Test 8: Daily Recurring Shift
1. Create a new recurring shift:
   - Frequency: Daily
   - Repeat every: 1 day
   - Start time: 6:00 AM
   - End time: 2:00 PM
2. **Expected Result**: Shifts appear for every day for the next 60 days

### ✅ Test 9: Monthly Recurring Shift
1. Create a new recurring shift:
   - Frequency: Monthly
   - Repeat every: 1 month
   - Day of month: 15
   - Start time: 10:00 AM
   - End time: 6:00 PM
2. **Expected Result**: Shifts appear on the 15th of each month

### ✅ Test 10: Delete Template
1. Click the "Delete" button (trash icon) on a template
2. Confirm the deletion dialog
3. **Expected Result**:
   - Template is removed from the list
   - Existing generated shifts remain (not deleted)
   - No new shifts will be generated from this template

### ✅ Test 11: Worker Permissions
1. Log out and log in as a worker (not owner/manager)
2. Navigate to the Shifts page
3. **Expected Result**:
   - "Recurring Schedule" section is NOT visible
   - Can only see their own assigned shifts
   - Cannot create or edit templates

### ✅ Test 12: End Date Functionality
1. Create a recurring shift with:
   - Frequency: Weekly
   - Days: Monday, Wednesday, Friday
   - Start date: Today
   - End date: 2 weeks from today
2. **Expected Result**:
   - Only 6 shifts are created (Mon/Wed/Fri for 2 weeks)
   - No shifts created beyond the end date

## Architecture Details

### Database Schema
- **shift_templates**: Stores recurring shift definitions
- **worker_shifts**: Stores individual shift instances
- **template_id**: Links shifts to their generating template
- **Unique constraint**: Prevents duplicate shifts for same template and date

### Generation Logic
- Shifts are generated 60 days into the future by default
- Daily: Creates shift every N days
- Weekly: Creates shifts on specified days of week, every N weeks
- Monthly: Creates shift on specified day of month, every N months
- ON CONFLICT DO NOTHING prevents duplicates

### Security
- RLS policies enforce farm membership
- Only owner/manager roles can create/edit/delete templates
- All farm members can view templates
- Workers see only their assigned shifts

## Troubleshooting

### No Shifts Generated
- Check that template is marked as "Active"
- Verify start date is not in the future
- For weekly, ensure at least one day is selected
- Check browser console for errors

### Duplicate Shifts
- Should not happen due to unique constraint
- If occurs, check database logs
- Verify unique constraint exists on worker_shifts table

### Template Not Visible
- Verify user role (must be owner or manager)
- Check farm membership is active
- Verify RLS policies are correct

## Performance Considerations

- Generation limited to 60 days to avoid large batch operations
- Indexes on farm_id and is_active for fast template queries
- Indexes on template_id for fast shift lookups
- Use "Regenerate" button to extend shifts as needed

## Success Criteria

All items in the verification checklist should pass without errors. The system should:
1. ✅ Create recurring templates successfully
2. ✅ Generate shifts automatically up to 60 days
3. ✅ Persist across page refreshes
4. ✅ Prevent duplicate shift creation
5. ✅ Allow pausing/resuming templates
6. ✅ Allow editing template settings
7. ✅ Respect end dates when specified
8. ✅ Enforce proper permissions (owner/manager only)
9. ✅ Handle all three frequency types (daily/weekly/monthly)
10. ✅ Delete templates without affecting existing shifts
