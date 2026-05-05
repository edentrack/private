# Security Audit Report – Farm Management App

**Date:** February 2025  
**Scope:** Frontend (React/Vite), Supabase (auth, RLS, Edge Functions)

---

## 1. Summary

The app uses Supabase for auth and data, with Row Level Security (RLS) on tables. Several improvements were applied; remaining items are documented below with remediation steps.

---

## 2. Fixes Applied

### 2.1 XSS in receipt print (fixed)

- **Risk:** Receipt content (customer name, phone, notes) was written into a print window via `document.write()` without escaping. Malicious input could run script in the print window.
- **Fix:** Introduced `src/utils/escapeHtml.ts` and use it when building receipt HTML in:
  - `RecordEggSale.tsx` (egg sale receipt)
  - `RecordBirdSaleModal.tsx` (bird sale receipt)
- **Action:** None; already fixed.

### 2.2 Missing translation keys (fixed)

- **Risk:** Missing i18n keys caused raw keys (e.g. `errors.reload_page`, `sales.current_stock`) to appear in the UI and could confuse users or expose internal key structure.
- **Fix:** Added missing keys to `en.json` and `fr.json` (e.g. `errors.unexpected_error`, `errors.reload_page`, `voice.*`, `status.*`, `sales.current_stock`, `sales.small`, etc.).
- **Action:** None; already fixed.

### 2.3 Stray punctuation (fixed)

- **Risk:** Literal ` - ` in date ranges was hardcoded; minor consistency/i18n issue.
- **Fix:** Added `common.date_range_separator` and use `t('common.date_range_separator')` in ShiftsPage, PayrollPage, PayrollDashboard, PayStubs.
- **Action:** None; already fixed.

---

## 3. Environment & Secrets

| Item | Status | Notes |
|------|--------|--------|
| `.env*.local` in `.gitignore` | OK | Env files are ignored. |
| Supabase URL/anon key | OK | Read from `import.meta.env.VITE_*`; anon key is intended for client use. |
| Service role key | Critical | Must **never** be in frontend or in repo. Use only in server/Edge Functions. |
| API keys in repo | OK | No hardcoded secrets found in `src/`. |

**Recommendations:**

- Do not add `VITE_SUPABASE_SERVICE_ROLE_KEY` or any secret to the client.
- In production, ensure only needed env vars are set and that Supabase anon key has the correct RLS so that all data access is policy-bound.

---

## 4. Authentication & Authorization

| Item | Status | Notes |
|------|--------|--------|
| Supabase Auth | OK | Email/password; session handled by Supabase. |
| RLS on tables | OK | Migrations enable RLS on farms, profiles, farm_members, etc. |
| Role checks | OK | UI uses `currentRole` and `farmPermissions`; sensitive actions should also be enforced by RLS. |
| Impersonation | Caution | Stored in `localStorage`; only super admins should have access. Ensure impersonation is gated by `is_super_admin` and that RLS/backend do not rely solely on client. |

**Recommendations:**

- Ensure every table that holds tenant or user-specific data has RLS enabled and policies that restrict by `auth.uid()` and/or `farm_id`/`owner_id`.
- Run: `SELECT tablename FROM pg_tables WHERE schemaname = 'public';` and for each table confirm RLS is ON and policies are correct.
- Keep impersonation logic only in the backend (e.g. Edge Function or RPC that checks `is_super_admin` and then uses service role to act as the target user).

---

## 5. Data Validation & Injection

| Item | Status | Notes |
|------|--------|--------|
| SQL injection | OK | Supabase client uses parameterized queries; no raw SQL from user input in frontend. |
| Receipt XSS | Fixed | User content in receipt print is now escaped (see §2.1). |
| React default escaping | OK | Normal UI is React-rendered; no `dangerouslySetInnerHTML` with user input. |

**Recommendations:**

- In Edge Functions or RPCs that build SQL dynamically, always use parameterized queries or Supabase client methods.
- Validate and sanitize any user input used in emails, PDFs, or external APIs.

---

## 6. LocalStorage & Session Storage

| Item | Status | Notes |
|------|--------|--------|
| `preferred_language` | OK | Non-sensitive. |
| `impersonation_state` | Caution | Contains target user/farm; ensure only super-admin flow can set it and that backend enforces super-admin. |
| `notification-permission-dismissed` | OK | Non-sensitive. |
| Dashboard/nav/UI prefs | OK | Non-sensitive. |

**Recommendations:**

- Do not store tokens or passwords in localStorage/sessionStorage (Supabase stores session in its own way).
- Consider clearing or validating `impersonation_state` on app load (e.g. re-check that current user is still super admin).

---

## 7. Supabase Configuration Checklist

- **RLS:** Enable RLS on all public tables that hold user/farm data. Prefer “deny by default” and allow only what’s needed (e.g. SELECT/INSERT/UPDATE/DELETE per role).
- **Policies:** Base policies on `auth.uid()`, `farm_members`, and `farm_permissions` so users only see/edit data for farms they belong to and within their role.
- **Service role:** Never expose in client; use only in server-side or Edge Functions for admin/impersonation.
- **API keys:** Rotate anon (and service) key if ever exposed; use different keys per environment (e.g. dev/staging/prod).
- **Auth settings:** In Supabase Dashboard → Authentication → Settings, enforce email confirmation and strong password rules if required.

---

## 8. Optional Hardening

1. **CSP:** Add a Content-Security-Policy header (e.g. in hosting or Supabase) to limit script and connection sources.
2. **Rate limiting:** Use Supabase or a proxy to rate-limit auth and sensitive endpoints.
3. **Audit logging:** You already have `admin_actions`; consider logging sensitive operations (e.g. role changes, farm delete) in a dedicated audit table.
4. **HTTPS:** Ensure the app and Supabase are only served over HTTPS in production.

---

## 9. Quick Verification Commands

- **RLS status (Supabase SQL):**
  ```sql
  SELECT relname, relrowsecurity
  FROM pg_class
  WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND relkind = 'r';
  ```
- **Policies per table:**
  ```sql
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
  FROM pg_policies
  WHERE schemaname = 'public';
  ```

---

**Conclusion:** Critical client-side XSS in receipt print has been fixed, and env/secrets handling is sound. Continue to enforce authorization on the backend (RLS and, where used, Edge Functions) and restrict impersonation and admin actions to verified super admins.
