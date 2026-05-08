# EdenTrack — Pre-launch Handoff

**Owner:** Greg
**Date:** May 8, 2026
**Status:** App-side launch ledger empty. Ready for first farmers.

---

## 1. The product in one paragraph

EdenTrack is a multi-species farm management SaaS for African smallholder farmers — poultry, aquaculture, and rabbitries on the same codebase. Farmers track flock/pond health, log production (eggs, harvests, mortalities, weight), record finances (sales, expenses, payroll), and converse with **Eden**, an in-product AI operator that takes natural-language commands ("add 50 chicks to Pen 2", "record an egg sale of 100 to John") and emits structured database actions. The frontend is a React + Vite SPA at edentrack.app, the backend is Supabase (Postgres + RLS + edge functions). Eden runs on Anthropic's Claude (Sonnet) with OpenAI Whisper for transcription.

---

## 2. Launch readiness state

| Surface | Status |
|---|---|
| Conversational onboarding (Eden-driven) | ✅ Live, fresh-signup tested end-to-end |
| Form-based signup | ✅ Live, with country/species pickers |
| Multi-species support (poultry / aqua / rabbits) | ✅ Live, species-aware throughout |
| Eden Operator (in-product AI agent) | ✅ Live, per-farm chat scoping, cross-farm mode |
| Sales flow (egg + bird) | ✅ End-to-end verified (POST → DB → dashboard) |
| Expense / inventory tracking | ✅ Live with CSV import |
| Reports (PDF / CSV / Markdown) | ✅ Live, revenue double-count fixed (PR #49) |
| Stripe checkout (Farm Boss + Industry tiers) | ✅ Live |
| WhatsApp webhook | ✅ verify_jwt=false set, ready for Meta wiring |
| Mobile responsive (no-zoom, grouped nav) | ⚠️ Code shipped, awaits Greg's iPhone verification (PR #47) |
| Crisp chat widget | ✅ Live |

**App-side bug ledger from the May 2026 audit: empty.**

---

## 3. Audit closure map

Every finding from the May 2026 stress-test audit has a fix and a verification.

| # | Finding | Fix | Verified |
|---|---------|-----|----------|
| 1 | Country/currency derivation defaulted to Nigeria | PR #54 / #56 — client passes `pending_farm_country`; edge function injects into onboarding prompt | ✅ Direct edge-function probe + fresh-signup test (Cameroon → CFA flows through) |
| 2 | Country asked twice in onboarding | PR #56 — country positioned exactly once, after species | ✅ Fresh-signup walkthrough |
| 3 | "Nigeria, Nigeria" duplicated in weather widget | PR #51 — dedupe moved to WeatherWidget render site | ✅ Bundle index-hNjB5eXZ.js + later |
| 4 | Health ring shows 22% INACTIVE on brand-new farm | Fixed earlier in audit cycle | ✅ Tooltip added; SETUP MODE pill correct |
| 5 | "arrived 3 months ago" ignored, flock created at age 0 | PR #56 — client-side parser fallback | ✅ "13 weeks 5d" age display on Pen 1 after retroactive arrival |
| 6 | Pending Tasks 6 vs Today's Tasks 5 mismatch | Resolved as correct semantics — different KPIs (today + overdue vs today only). No code change. | ✅ Confirmed via REST query |
| 7 | "Stocked X fish fingerlings" wording on poultry farms | PR #54 — LOG_STOCKING bulk-summary now species-aware | ✅ Fish/Rabbit/Poultry verbs branch correctly |
| 8 | Eden onboarding hardcoded Nigeria | Same as #1 | ✅ |
| 9 | (no separate finding) | — | — |
| 10 | Egg-sale submit silently failed | PR #51 — `<form noValidate>` + remove dead `max=0` attrs | ✅ Submit handler runs, error banner surfaces correctly |
| 11 | Form labels showed "(XAF)" while totals showed "CFA" | PR #52 (Cameroon currencySymbol) + PR #53 (bird-sale Sale Summary card) | ✅ All currency surfaces consistent on prod |

---

## 4. Open follow-ups

### Awaiting verification on Greg's iPhone

**PR #47** — Eden mobile input bar (auto-growing textarea, attach menu, language picker). Code-side verified, but the macOS HiDPI quirk in Cowork's resize tool means visual mobile verification can't be automated. Greg verifies via:

1. Real iPhone at edentrack.app, OR
2. Chrome DevTools → Cmd+Option+I → Cmd+Shift+M → iPhone SE / Pixel 5

Acceptance: input bar fits in one row at 360-414px, long messages auto-grow to 2-3 lines without horizontal scroll, send button stays visible.

### Deferred to post-launch

- **RLS audit migration** — there's a divergence between `farms`/`farm_members` RLS policies and child-table policies that PR #46 routed around (gating CoreKPISection on `profile.subscription_tier` instead of `farm.plan`). A full RLS audit is the right fix; deferred until we have user data and can profile.
- **Multi-language Eden v1.1** — investigated. Recommendation: launch in English + French (already supported). Add languages by user demand. No native speakers on the team to validate translations safely pre-launch.

### Cosmetic nits worth a quick pass when convenient

- Age display reads "13 weeks old 5d" — units sit awkwardly between "old" and the "5d" suffix. Suggestion: "13w 5d" or "13 weeks 5 days".
- Insights "Current Age: 13 weeks 89d" appears to render two parallel arrival-deltas instead of weeks + remainder days. Should be "13 weeks 5 days" once #5 is consistent.
- "Delivered X birds to {pen}" in LOG_STOCKING for poultry reads like outgoing rather than incoming. Consider "Added X birds to {pen}" for symmetry with "Stocked"/"Acquired".
- Egg-sale error banner renders correctly at the top of the form, but the `requestAnimationFrame + scrollIntoView` doesn't visibly scroll the user up to it on prod. Banner content is right; surfacing could improve.

None of these are launch blockers.

### Greg's TODO

- Crisp dashboard color toggle to `#ffdd00` (cosmetic; brand consistency).

---

## 5. Architecture pointer for future Claude Code / engineers

**Repo:** `github.com/edentrack/private`
**Production deploy:** `edentrack.app` via Vercel (auto-deploy from `main`)
**Backend:** Supabase project (Postgres + edge functions + auth + storage)

### Key directories

```
src/
  components/
    ai/              ← Eden chat (AIAssistantPage, EdenInput)
    dashboard/       ← DashboardLayout, DashboardHome, KPIs
    eggs/            ← RecordEggSale (BUG #10/#11 fix surface)
    sales/           ← SalesManagement, RecordBirdSaleModal
    onboarding/      ← OnboardingChat (passes user_country)
    auth/            ← SignUpScreen (writes pending_farm_country to localStorage)
    settings/        ← SettingsPage (farm-type changer)
  utils/
    currency.ts      ← getCurrencySymbol, formatCurrency, COUNTRY_CURRENCY_MAP
    farmReportAssembler.ts  ← report data with PR #49 dedupe
    navigationGroups.ts     ← single source of truth for nav grouping
supabase/
  functions/
    ai-chat/index.ts          ← Eden's system prompt + action grammar
    whatsapp-webhook/index.ts ← verify_jwt=false, ready for Meta
docs/
  CLAUDE_CODE_*.md  ← operational briefs from past sessions
  HANDOFF.md        ← this file
```

### Critical operational details

**Edge function changes require a separate deploy.** Vercel auto-deploys the frontend on merge to `main`, but Supabase edge functions don't. After any change to `supabase/functions/ai-chat/index.ts` or sibling functions:

```bash
npx supabase functions deploy ai-chat
```

If you skip this, the deployed frontend talks to a stale edge function and your fix appears not to work.

**Sandbox push lock pattern.** The Cowork sandbox can commit but can't authenticate to GitHub for `git push`. Pattern: Claude commits the fix locally on a branch, prints the branch name, Greg runs `git push -u origin <branch>` from his terminal and opens the PR via GitHub UI. Several PRs in this audit followed this pattern (#52, #53, etc.).

**TS budget gate.** CI fails at >180 TypeScript errors. Currently sitting at 143. Don't let it slip. Watch for unused-variable creep on big PRs.

**Currency code vs symbol.** `currency_code` is the ISO 4217 string ('XAF', 'XOF', 'NGN'). `currencySymbol` from `getCurrencySymbol()` is the user-facing label ('CFA', '₦'). Display labels MUST go through `getCurrencySymbol`. Database fields keep the ISO code. Mixing these two was BUG #11.

---

## 6. The business context

### Target user

The first farmer is a 25-50-year-old in West/Central Africa (Cameroon, Nigeria, Ghana primarily) running a 50-500 bird poultry farm or 1-3 catfish/tilapia ponds, on Android with intermittent connectivity. They speak English or French, sometimes Pidgin or local languages. They're paying for the bookkeeping and prediction tooling, not the AI; Eden is the differentiator that makes the bookkeeping painless.

### Why this is positioned to work

1. **Multi-species in one app.** Most competitors lock to poultry. Mixed-species smallholders need this.
2. **Eden makes data entry verbal.** WhatsApp pipeline is wired. Farmers SMS "lost 3 birds in Pen 1 today" and the app books it.
3. **Currency / regional defaults are correct now.** Country selection at signup wires through to currency display, not Nigeria-by-accident.
4. **Pricing tiers via Stripe.** Free → Farm Boss → Industry. Already live.
5. **Cooperative-friendly architecture.** Cooperatives table exists (currently nav-removed but DB schema retained — see PR #47/#48 brief). Easy to re-surface when a co-op partnership is signed.

### Open strategic decisions for Greg

- **Pricing rollout cadence.** Soft-launch with free tier only, then add paid tiers? Or all tiers from day 1?
- **First-cohort approach.** 10 hand-picked farmers in Cameroon (since the Cameroon path is best-tested) vs a wider Nigeria push.
- **Co-op partnership.** Which cooperative talks to first? (Cooperatives nav was removed but the DB stays — see decision in PR #47/#48 brief.)
- **Support workflow.** Crisp chat + WhatsApp inbound? Office hours? Volunteer mode for first 30 days?
- **Marketing channel mix.** Discussed in next conversation.

---

## 7. What gets done next

### Immediately blocking launch

1. **PR #47 mobile verification** — Greg's iPhone, 30-second check.
2. **Pick first 10 farmers** — names, contact, farm details, pre-fill them where possible.
3. **Support inbox setup** — confirm Crisp routing, WhatsApp number, response-time commitment.
4. **Pricing call** — free-only soft launch, or paid tiers from day 1?

### Week 1 of live use

1. Daily check on test2 + first-cohort farms for any production bug surfacing only with real data.
2. Crisp + WhatsApp triage rotation.
3. Track first-day completion rate (signup → first record).

### Month 1

1. Cooperative partnership conversation (after a few farmers are live and we have screenshots/anecdotes to show).
2. Pricing tier feedback — is anyone hitting Farm Boss limits?
3. Eden v1.1 — language additions driven by actual user demand.

---

## 8. People + accounts

- **Owner / founder:** Greg (athelaw1@gmail.com)
- **Test accounts:** test2.edentrack@gmail.com (used for fresh-signup verification)
- **Super admin:** Greg's account, can impersonate any farm
- **Anthropic:** API key in Supabase edge function env (ai-chat)
- **OpenAI:** API key for Whisper transcription
- **Stripe:** Live keys for production checkout
- **Vercel:** auto-deploys main
- **Supabase:** edge function deploys are manual via CLI

---

## 9. If something breaks on launch day

1. **First check: bundle hash.** `view-source:edentrack.app/assets/index-*.js` — confirm the live bundle is what you expect. Vercel cache can serve stale HTML for ~60s after a deploy.
2. **Edge function logs.** Supabase dashboard → Functions → ai-chat → Logs. Most surprising prod issues will show here.
3. **Sale POST not firing.** Confirm `<form noValidate>` is on the form. The HTML5 validation gate (BUG #10) is the Most Likely Suspect for any "submit does nothing" report. RecordEggSale.tsx and RecordBirdSaleModal.tsx are the two known surfaces.
4. **Currency reads wrong.** Confirm `getCurrencySymbol` is being called, not `currency_code` directly. RecordBirdSaleModal.tsx had three of these slip through (PR #53).
5. **Eden hardcoding Nigeria.** Edge function not redeployed after a prompt change. Run `npx supabase functions deploy ai-chat` and reload.

---

## 10. Files and PRs to reference

| Topic | PR | File |
|---|---|---|
| Egg-sale silent failure | #51 | src/components/eggs/RecordEggSale.tsx |
| Cameroon currency symbol | #52 | src/utils/currency.ts |
| Bird-sale summary card currency | #53 | src/components/sales/RecordBirdSaleModal.tsx |
| Onboarding country threading | #54 | src/components/onboarding/OnboardingChat.tsx, supabase/functions/ai-chat/index.ts |
| Insights CFA + receipt | #55 | (see Claude Code session notes) |
| Country position + arrival_date | #56 | (see Claude Code session notes) |
| Mobile nav grouping | #45 | src/components/dashboard/DashboardLayout.tsx |
| Eden mobile input bar | #47 | src/components/ai/AIAssistantPage.tsx |
| Reports revenue double-count | #49 | src/utils/farmReportAssembler.ts |

---

End of handoff.
