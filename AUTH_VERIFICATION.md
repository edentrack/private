# Authentication & Onboarding Verification Checklist

This document provides a comprehensive checklist to verify the authentication and team invitation system for Ebenezer Farm.

---

## Overview

The authentication system includes:
- Email/password signup with confirm password
- Password recovery flow
- Token-based team invitation system
- Role-based access control integration

---

## Verification Tests

### Test 1: Signup - Confirm Password Enforced
**Steps:**
1. Navigate to Sign Up page
2. Enter email and name
3. Enter password: `Test1234`
4. Enter different confirm password: `Test5678`
5. Click "Create Account"

**Expected Result:**
- Error message: "Passwords do not match"
- Account NOT created

**Status:** [ ] Pass [ ] Fail

---

### Test 2: Signup - Password Validation
**Steps:**
1. Navigate to Sign Up page
2. Try passwords:
   - `test` (too short)
   - `testtest` (no uppercase)
   - `TESTTEST1` (no lowercase)
   - `TestTest` (no number)

**Expected Result:**
- Appropriate error message for each case
- Password requirements shown below field

**Status:** [ ] Pass [ ] Fail

---

### Test 3: Password Reset Works End-to-End
**Steps:**
1. Navigate to Login page
2. Click "Forgot password?"
3. Enter registered email
4. Check email for reset link
5. Click link in email
6. Enter new password with confirm password
7. Submit new password

**Expected Result:**
- Reset email received
- New password set successfully
- Can login with new password

**Status:** [ ] Pass [ ] Fail

---

### Test 4: Invite Existing User - Accept - Appears in Farm Members
**Steps:**
1. Login as Farm Owner
2. Go to Team Management
3. Click "Invite Member"
4. Enter email of existing user
5. Select role (e.g., "Worker")
6. Click "Send Invitation"
7. Copy invite link
8. Login as the invited user
9. Navigate to invite link (/#/invite/{token})
10. Accept invitation

**Expected Result:**
- Invitation created with token
- Invite link works
- User sees farm name and role
- After accept, user appears in farm members list

**Status:** [ ] Pass [ ] Fail

---

### Test 5: Invite New User - Signup from Invite - Auto-Join Farm
**Steps:**
1. Login as Farm Owner
2. Go to Team Management
3. Click "Invite Member"
4. Enter email of non-existing user
5. Click "Send Invitation"
6. Copy invite link
7. Open invite link in incognito/new browser
8. Click "Create Account"
9. Complete signup with same email as invitation
10. Return to invite link (or auto-redirect)

**Expected Result:**
- New user created
- After signup/login, user automatically joins farm
- User has correct role assigned

**Status:** [ ] Pass [ ] Fail

---

### Test 6: Expired Invite Handled Cleanly
**Steps:**
1. Create an invitation
2. Manually expire it in database (or wait for expiration)
3. Try to access the invite link

**Expected Result:**
- Clear error message: "This invitation has expired"
- Link to request new invitation
- No crash or confusing error

**Status:** [ ] Pass [ ] Fail

---

### Test 7: Activity Log Shows Correct Actor + Action Text
**Steps:**
1. Perform various team actions:
   - Create invitation
   - Accept invitation
   - Revoke invitation
   - Change member role
2. Check Team Activity Log

**Expected Result:**
- Each action shows:
  - Actor name (not "Unknown")
  - Clear action description
  - Target user/email where applicable
  - Timestamp

**Status:** [ ] Pass [ ] Fail

---

### Test 8: Worker Invited Cannot See Hidden Modules
**Steps:**
1. Invite a new user as "Worker"
2. Have them accept and login
3. Check their navigation

**Expected Result:**
- Worker sees ONLY: Dashboard, My Work, Tasks, Shifts, Vaccinations, Flocks (view-only)
- Worker does NOT see: Inventory, Expenses, Sales, Analytics, Payroll, Team, Settings

**Status:** [ ] Pass [ ] Fail

---

### Test 9: Revoke Invitation Works
**Steps:**
1. Create an invitation
2. Before acceptance, click Revoke button
3. Try to use the invite link

**Expected Result:**
- Invitation status changes to "Revoked"
- Invite link shows "This invitation has been revoked"

**Status:** [ ] Pass [ ] Fail

---

### Test 10: Resend Invitation Generates New Token
**Steps:**
1. Create an invitation
2. Copy the invite link
3. Click Resend button
4. Copy new invite link

**Expected Result:**
- Old link no longer works (or redirects)
- New link works
- Expiration date extended

**Status:** [ ] Pass [ ] Fail

---

## Database Security Checks

### RLS Policies

| Table | Policy | Status |
|-------|--------|--------|
| team_invitations | Only owner/manager can create | [ ] |
| team_invitations | Only owner can revoke | [ ] |
| team_invitations | Token lookup returns limited info | [ ] |
| farm_members | Created via RPC with proper checks | [ ] |
| team_activity_log | Proper actor/target tracking | [ ] |

### Rate Limiting

| Check | Status |
|-------|--------|
| Max 5 invites per email per day | [ ] |
| Duplicate pending invite rejected | [ ] |
| Already member invite rejected | [ ] |

---

## How to Test

### Quick Test Flow

1. **Create Owner Account:**
   ```
   - Sign up at the app
   - A farm will be created automatically
   ```

2. **Invite a Worker:**
   ```
   - Go to Team tab
   - Click "Invite Member"
   - Enter email, select "Worker" role
   - Copy the invite link shown
   ```

3. **Accept as Worker:**
   ```
   - Open invite link in different browser/incognito
   - Create account with same email OR login if existing
   - Verify you join the farm with Worker role
   ```

4. **Verify Worker Permissions:**
   ```
   - As Worker, check navigation - should only see limited tabs
   - Cannot see financial data
   - Cannot access Team/Payroll/Settings
   ```

---

## Files Changed

### Database Migrations
- `supabase/migrations/*_create_comprehensive_auth_invite_system.sql`
  - Added token, status, expires_at, accepted_by to team_invitations
  - Created RPC functions: create_team_invitation, get_invitation_by_token, accept_team_invitation, revoke_team_invitation, resend_team_invitation
  - Rate limiting built into create_team_invitation

### New Components
- `src/components/auth/InviteAcceptPage.tsx` - Invite landing/acceptance page
- `src/components/team/InviteMemberModal.tsx` - Modal for creating invitations

### Modified Components
- `src/App.tsx` - Added invite route handling (/#/invite/{token})
- `src/contexts/AuthContext.tsx` - Added refreshSession function
- `src/components/team/TeamManagement.tsx` - Updated invite UI with new modal and actions

### Existing Components (Already Had)
- `src/components/auth/SignUpScreen.tsx` - Confirm password + validation
- `src/components/auth/ResetPasswordScreen.tsx` - Confirm password + validation
- `src/components/auth/ForgotPasswordScreen.tsx` - Request reset flow

---

## Summary

The authentication system provides:

1. **Secure Signup:** Password requirements (8+ chars, uppercase, lowercase, number), confirm password matching
2. **Password Recovery:** Email-based reset with secure token
3. **Team Invitations:**
   - Token-based invite links (64-char random tokens)
   - 7-day expiration
   - Rate limiting (5 per email per day)
   - Revoke/Resend capabilities
   - Auto-join on acceptance
4. **Activity Logging:** All team actions logged with actor/target
5. **Role Integration:** Invited users get correct role and permissions

---

## Troubleshooting

**Issue: Invite link shows "Invalid Invitation"**
- Check if invitation was revoked
- Check if token was regenerated (resend)
- Verify token matches database

**Issue: User cannot accept invite**
- Verify user is logged in with correct email
- Check invitation status is "pending"
- Check invitation has not expired

**Issue: Activity log shows "Unknown" for actor**
- Ensure profile exists for user
- Check team_activity_log foreign keys

**Issue: Worker sees financial data**
- Verify role is set correctly in farm_members
- Check shouldHideFinancialData function
- Verify components use hideFinancials check

---

## Build Verification

```bash
npm run build
```

Expected: Build completes successfully with no errors.
