# Paid App Setup: Verification, Sign-up Alerts, Flutterwave & Trial

This guide walks you through:

1. **Email (and optional phone) verification** with Supabase  
2. **Getting an alert when someone signs up**  
3. **Adding Flutterwave** for payments  
4. **Starting a trial period** for new users  

---

## 1. Email & phone verification

### 1.1 Email verification (Supabase)

- In **Supabase Dashboard** → **Authentication** → **Providers** → **Email**:  
  - Turn **ON** “Confirm email”.
- In **Authentication** → **URL Configuration**:
  - Set **Site URL** to your production URL (e.g. `https://yourapp.com`).
  - Add **Redirect URLs** (one per line), e.g.:
    - `https://yourapp.com/#/auth/callback`
    - `http://localhost:5173/#/auth/callback` (for dev)
- The app passes `emailRedirectTo` to `signUp()` (e.g. `https://yourapp.com/#/auth/callback`). Add this exact URL (and your dev URL, e.g. `http://localhost:5173/#/auth/callback`) to **Redirect URLs** in Supabase. After the user clicks the link in the email, Supabase redirects there and the Supabase client will pick up the session from the URL hash. You can add a simple route `#/auth/callback` that shows “Email confirmed” and redirects to the dashboard after a couple of seconds if you like.
- Optional: **Authentication** → **Email Templates** → “Confirm signup” to edit the email body (you can use `{{ .RedirectTo }}` for the link).

Result: signup → Supabase sends confirmation email → user clicks link → email is verified and they are logged in (or redirected to login).

### 1.2 Phone verification (optional)

- Supabase supports **Phone** as a provider (SMS OTP).
- In **Authentication** → **Providers** → **Phone** enable it and add your Twilio (or other) credentials in the Supabase project settings.
- To require **both** email and phone you’d either:
  - Use phone as the main sign-in and keep email as metadata, or  
  - Add a post-signup step in your app: “Verify phone” that sends an OTP and checks it (e.g. via Edge Function calling Twilio).

For “email and/or phone” the simplest is: **email required** (as now) and **phone optional** (e.g. collect in profile and verify later with a separate flow).

---

## 2. Alert when someone signs up

A **database trigger** writes each new signup into a table; your super-admin UI (or an Edge Function) can read it and show alerts or send notifications.

### 2.1 What’s in place

- Migration `..._signup_alerts_and_trial.sql`:
  - Creates table `public.signup_alerts` (e.g. `id`, `user_id`, `email`, `full_name`, `created_at`).
  - Adds a trigger on `public.profiles` **AFTER INSERT** that inserts one row into `signup_alerts` (from `NEW.id`, `NEW.email`, `NEW.full_name`).
- So every new profile (created on signup via `handle_new_user` or by your app) gets one row in `signup_alerts`.

### 2.2 How to “get an alert”

**Option A – Super-admin page**

- In your super-admin dashboard, add a “Recent signups” (or “Alerts”) section that:
  - Reads from `signup_alerts` (e.g. last 50, order by `created_at desc`).
  - Optionally mark rows as “read” with an `admin_read_at` column if you add it later.
- You can poll every 30–60 seconds or use Supabase Realtime on `signup_alerts` to update the list live.

**Option B – Email/Slack**

- Add a Supabase **Edge Function** that is called when you want to “process” a signup (e.g. “send alert”).
- Either:
  - **Database webhook**: Supabase can call an Edge Function on insert (if you use Database Webhooks and point them to your function), or  
  - **Cron**: Edge Function runs on a schedule, reads unprocessed rows from `signup_alerts`, sends email/Slack, then marks them processed.
- In the function use a mailer (e.g. Resend, SendGrid) or Slack API to send “New signup: {email}”.

---

## 3. Flutterwave for payments

Your app is paid; Flutterwave can handle one-time and recurring (subscription) payments.

### 3.1 Steps (high level)

1. **Flutterwave account**  
   - Sign up at [flutterwave.com](https://flutterwave.com), get **Public Key** and **Secret Key** from the dashboard.

2. **Backend (recommended)**  
   - Never put the **Secret Key** in the frontend. Use a Supabase **Edge Function** (or your own backend) to:
     - Create payment plans / subscriptions.
     - Initialize transactions (return `tx_ref` and optional link to Flutterwave checkout).
     - Verify transactions and update your DB (e.g. set `subscription_expires_at`, `subscription_tier` on `profiles`).

3. **Frontend**  
   - Install: `npm install flutterwave-react-v3`.  
   - Use the **useFlutterwave** hook with the **Public Key** only.  
   - When user clicks “Subscribe” or “Pay”:
     - Call your Edge Function to create the transaction and get `tx_ref` (and amount, customer info).
     - Open Flutterwave checkout (e.g. `useFlutterwave` with that config).
     - On success callback, call another Edge Function to “verify payment” with Flutterwave and then update `profiles` / `subscription_tiers` (or your payments table).

4. **Trial**  
   - New users get a trial (see Section 4). When trial ends, your app checks `subscription_expires_at`; if past, show “Subscribe” and direct to Flutterwave flow.

### 3.2 Where to plug it into your app

- **Billing / upgrade UI**  
  - e.g. in **Settings** or a “Subscription” page: show current plan, trial end date, and “Upgrade” / “Subscribe” button that opens Flutterwave (via Edge Function + `useFlutterwave`).
- **After login**  
  - If `subscription_expires_at` is in the past and tier is not “free”, redirect to the subscription/checkout page (or show a banner).
- **Super-admin**  
  - You already have Billing & Subscriptions; there you can show who is on trial vs paid and link to Flutterwave dashboard for refunds/support.

### 3.3 Flutterwave docs (for implementation)

- Payment flow: [Flutterwave Docs – Accept Payments](https://developer.flutterwave.com/docs/integration-guides/accept-payments).  
- Subscriptions: [Payment Plans](https://developer.flutterwave.com/v2.0/reference/create-payment-plan), [Recurring payments](https://flutterwave.com/us/support/payments/how-recurring-payments-work).  
- React: [flutterwave-react-v3](https://www.npmjs.com/package/flutterwave-react-v3) and [React v3 GitHub](https://github.com/Flutterwave/React-v3).

---

## 4. Trial period

### 4.1 What’s in place

- Migration `..._signup_alerts_and_trial.sql` updates `handle_new_user()` so that when a new user is created it:
  - Sets `subscription_tier` to `'pro'` (or keep `'free'` if you prefer trial to be “free tier with time limit”).
  - Sets `subscription_expires_at = NOW() + interval '14 days'` (14-day trial). You can change the interval in the migration (e.g. `7 days` or `30 days`).

So “trial” = new signups get a fixed period (e.g. 14 days) after which `subscription_expires_at` is in the past and you can prompt for payment (Flutterwave).

### 4.2 How to enforce “trial ended”

- In the app, when loading the user (e.g. in `AuthContext` or a layout component):
  - If `profile.subscription_expires_at` is in the past and `profile.subscription_tier` is not `'free'` (or not “lifetime”), show:
    - A “Trial ended” or “Subscription expired” screen, or  
    - Redirect to a “Subscribe” page that uses Flutterwave.
- Optionally allow a “free” tier with limited features and no expiry, and “pro”/“enterprise” with expiry (and trial for new users).

### 4.3 Changing trial length

- Edit the migration (before applying) or add a new migration that alters `handle_new_user()` and change the interval, e.g.:
  - `NOW() + interval '7 days'`
  - `NOW() + interval '30 days'`
- Re-run migrations (or run the new one) so new signups get the updated trial.

---

## 5. Checklist

| Step | Action |
|------|--------|
| Email verification | Supabase Dashboard → Auth → Email → Confirm email ON; set Site URL and Redirect URLs. |
| Sign-up alert | Use `signup_alerts` table (+ optional super-admin UI or Edge Function to send email/Slack). |
| Flutterwave | Create account; add Edge Function to create/verify payments; frontend with `flutterwave-react-v3` and Public Key only. |
| Trial | Rely on `handle_new_user` setting `subscription_expires_at`; in app, check expiry and show “Subscribe” (Flutterwave) when trial ends. |

If you want, next we can add a small “Recent signups” widget for super-admin and a minimal “Subscribe / Upgrade” page that calls an Edge Function and opens Flutterwave.
