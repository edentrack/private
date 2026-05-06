# EdenTrack — External Services & API Costs

Last updated: 2026-05-06 (updated with video pipeline + Kling + ElevenLabs + CamPay)

This document lists every third-party service wired into EdenTrack, what it does,
where the key is stored, and what it costs. Keep this updated when you add or remove
a service. Any AI assistant working on this codebase should read this file first.

---

## Infrastructure

| Service | Purpose | Env var | Cost |
|---------|---------|---------|------|
| **Supabase** | Database (Postgres), Auth, Edge Functions, Storage, Realtime | `VITE_SUPABASE_URL` `VITE_SUPABASE_ANON_KEY` | Free tier: 500 MB DB, 500K edge invocations/mo. Pro: $25/mo |
| **Vercel** | Frontend hosting, CDN, auto-deploy from GitHub | Set in Vercel dashboard | Free (Hobby). Pro: $20/mo if needed |

---

## AI & Machine Learning

| Service | Purpose | Env var | Cost |
|---------|---------|---------|------|
| **Anthropic Claude** | Eden AI brain — all chat, action extraction, species routing | Set in Supabase secrets as `ANTHROPIC_API_KEY` | Claude Sonnet 4.6: $3/M input tokens, $15/M output tokens |
| **OpenAI Whisper** | Voice-to-text transcription (5 languages: English, Pidgin, Hausa, Yoruba, Swahili) | `OPENAI_API_KEY` (`.env.local` + Supabase secret) | $0.006/min audio |
| **Replicate** | AI image generation — two active use-cases: (1) **Eden AI character** (`eden-face` portrait, FLUX 1.1 Pro), (2) **Species picker images** (`gen_species.py` — 8 editorial livestock portraits saved to `public/species/`). Also available for future ML predictions. | `REPLICATE_API_KEY` (`.env.local`) · `REPLICATE_API_TOKEN` (video pipeline `.env`) — same key, two variable names | Pay per prediction. FLUX 1.1 Pro: ~$0.04/image. 8 species images ≈ $0.32 total, one-time. |
| **Kling AI** | AI video generation — used in the `edentrack-video-pipeline` for cinematic farm walkthrough clips and marketing video B-roll. Kling 1.6 Pro model. | `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` (video pipeline `.env`) | Pay per video second. Kling Pro: ~$0.14/s. Check kling.ai/pricing |
| **ElevenLabs** | Text-to-speech narration for video pipeline — converts script copy into voiceover audio for Remotion compositions (AIPayRun, FarmSetupScorecard). Voice ID `zGjIP4SZlMnY9m93k97r` is the locked Eden AI narrator voice. | `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (video pipeline `.env`) | Free: 10K chars/mo. Creator: $22/mo for 100K chars |

---

## Payments

| Service | Purpose | Env var | Cost |
|---------|---------|---------|------|
| **Flutterwave** | Primary payment processor (subscriptions, marketplace split payments) | `VITE_FLW_PUBLIC_KEY` (frontend) + `FLW_SECRET_KEY` (Supabase secret) | 1.4% local cards, 3.8% international. No monthly fee |
| **Paystack** | Secondary payment option | `VITE_PAYSTACK_PUBLIC_KEY` (frontend) + `PAYSTACK_SECRET_KEY` (Supabase secret) | 1.5% per transaction |
| **CamPay** | Cameroon mobile money payments (Orange Money, MTN MoMo) via `campay-checkout` Edge Function — primary payment rail for Cameroonian farmers | `CAMPAY_USERNAME` + `CAMPAY_PASSWORD` (Supabase secrets) | ~1–3% per transaction. See campay.net |
| **Stripe** | Global card payments (non-Africa markets) | `STRIPE_PUBLISHABLE_KEY` (`.env.local`) + `STRIPE_SECRET_KEY` (Supabase secret) | 2.9% + $0.30 per transaction |

---

## Messaging & Notifications

| Service | Purpose | Env var | Cost |
|---------|---------|---------|------|
| **Meta WhatsApp Cloud API** | Outbound daily farm reports to farmers via WhatsApp | `WHATSAPP_ACCESS_TOKEN` `WHATSAPP_PHONE_NUMBER_ID` `WHATSAPP_APP_SECRET` `WHATSAPP_VERIFY_TOKEN` (all Supabase secrets) | Free: 1,000 service conversations/mo. After that: ~$0.02–$0.06 per conversation (varies by country) |
| **Resend** | Transactional email (signup confirmations, reports, alerts) | `RESEND_API_KEY` (`.env.local` + Supabase secret) | Free: 3,000 emails/mo. Pro: $20/mo for 50K |
| **Web Push (VAPID)** | Browser push notifications for task reminders, alerts | `VAPID_PUBLIC_KEY` (frontend) + `VAPID_PRIVATE_KEY` (Supabase secret) | Free — no third-party cost, just your own keys |

---

## Analytics & Support

| Service | Purpose | Env var | Cost |
|---------|---------|---------|------|
| **PostHog** | Product analytics — page views, feature usage, funnels | `VITE_POSTHOG_KEY` (`.env.local`) | Free: 1M events/mo. Scale: $0.000225/event after |
| **Crisp** | In-app customer support chat widget | `VITE_CRISP_WEBSITE_ID` (`.env.local`) | Free tier. Pro: ~$25/mo for advanced features |

---

## Edge Functions (Supabase) — what each one does

| Function | Trigger | Purpose |
|----------|---------|---------|
| `ai-chat` | HTTP POST from frontend | Eden AI — routes messages, extracts log actions, species-aware |
| `send-whatsapp-daily-report` | pg_cron every 5 min | Sends daily farm summary via WhatsApp to subscribed farmers |
| `whatsapp-webhook` | HTTP GET/POST from Meta | Webhook verification + inbound message receiver |
| `pond-alerts-evaluator` | pg_cron every 15 min | Evaluates pond water quality thresholds, fires alerts |
| `send-daily-report` | pg_cron or manual | Email-based daily report (Resend) |
| `smart-import` | HTTP POST | Processes bulk CSV/photo imports |
| `mortality-alerts` | pg_cron or DB trigger | Fires alerts when mortality exceeds threshold |
| `weather` | HTTP GET | Fetches weather data for farm location |
| `campay-checkout` | HTTP POST | CamPay payment integration |
| `flutterwave-payment` | HTTP POST | Flutterwave payment processing |
| `paystack-checkout` | HTTP POST | Paystack payment processing |
| `stripe-checkout` | HTTP POST | Stripe checkout session creation |
| `stripe-webhook` | HTTP POST from Stripe | Stripe payment confirmation + subscription updates |
| `subscription-renewal` | pg_cron daily | Checks and renews expiring subscriptions |
| `guest-checkout` | HTTP POST | Guest (no-auth) checkout flow |

---

## Video Pipeline (`edentrack-video-pipeline/`)

A separate Remotion-based video rendering project living inside the monorepo. Used to produce marketing and onboarding videos programmatically.

| Composition | File | Purpose |
|-------------|------|---------|
| `AIPayRun` | `src/AIPayRun.tsx` | Animated demo of Eden AI chat + payroll processing — used for social content |
| `FarmSetupScorecard` | `src/FarmSetupScorecard.tsx` | Farm health scorecard reveal — used for onboarding / marketing |
| `EdenFace` | `src/EdenFace.tsx` | Animated SVG Eden AI character — reusable in all compositions |

**Stack:** Remotion (React → MP4/WebM), ElevenLabs (narration audio), Kling (B-roll video clips), Replicate FLUX 1.1 Pro (character/asset stills)

**Run locally:**
```bash
cd edentrack-video-pipeline
npm run dev        # Remotion Studio preview
npm run render     # Render to /Movies/
```

**Env vars needed** (in `edentrack-video-pipeline/.env`):
- `REPLICATE_API_TOKEN` — character image generation
- `KLING_ACCESS_KEY` / `KLING_SECRET_KEY` — B-roll video generation
- `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` — narration TTS

---

## One-off Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `gen_species.py` | `/gen_species.py` (project root) | Generates all 8 species picker images via Replicate FLUX 1.1 Pro. Run once (or re-run to regenerate). Saves to `public/species/`. Requires `REPLICATE_API_TOKEN` env var. |

---

## Pending / Not Yet Set Up

| Service | Purpose | Status |
|---------|---------|--------|
| WhatsApp Access Token | Needed to actually send messages | Waiting for phone number registration |
| WhatsApp Phone Number ID | The number messages are sent from | Waiting for dedicated business number |
| VAPID keys | Push notification signing keys | Not yet generated |

---

## Monthly Cost Estimate (at launch, low volume)

| Service | Est. cost |
|---------|-----------|
| Supabase Pro | $25 |
| Vercel Hobby | $0 |
| Anthropic (Claude) | ~$10–50 depending on usage |
| OpenAI Whisper | ~$5 (at ~800 min/mo voice) |
| Resend | $0 (under 3K emails) |
| PostHog | $0 (under 1M events) |
| Crisp | $0 (free tier) |
| WhatsApp API | $0 (under 1K conversations) |
| Replicate | ~$0 (species images are one-time ~$0.32; Eden AI character is one-time) |
| Kling AI | Pay per video second — only when rendering new videos |
| ElevenLabs | $0 (under 10K chars/mo free tier) |
| CamPay | % per transaction — no monthly fee |
| **Total baseline** | **~$40–80/mo** |

---

## Where keys live

- **Frontend** (`.env.local`, prefix `VITE_`): public keys only — PostHog, Crisp, Supabase anon key, payment public keys
- **Supabase secrets** (`npx supabase secrets set KEY=value`): all private keys — Anthropic, OpenAI, WhatsApp tokens, payment secret keys, Resend, VAPID private
- **Vercel env vars** (Vercel dashboard → Settings → Environment Variables): mirror of `.env.local` for production builds

- **Video pipeline** (`edentrack-video-pipeline/.env`): Replicate, Kling, ElevenLabs keys — this folder is server-side only, never shipped to browser

Never put a secret key in a `VITE_` variable — it gets bundled into the public JS.
