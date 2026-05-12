import { useState, useEffect, useCallback, useMemo } from 'react';
import { Check, Crown, Sprout, Leaf, Building2, Globe, ChevronDown, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { supabase } from '../../lib/supabaseClient';
import {
  detectRegion, ALL_COUNTRIES, RegionConfig, COUNTRY_CONFIGS, FIXED_PRICES,
  getEffectivePrice as getPrice, getPriceCurrency, formatPrice,
} from '../../utils/regionalPayment';
import { openInAppBrowser } from '../../lib/capacitorNative';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';

/*
 * IN-APP SUBSCRIBE PAGE (May 2026 redesign)
 *
 * Visual parity with the landing page pricing section
 * (src/components/landing/LandingPage.tsx). Same black background
 * (#0a0a0a) and yellow accent (#ffdd00 = Y) so a Free user upgrading
 * from inside the app sees the same plan cards they originally signed
 * up against.
 *
 * What's different from landing:
 *   - This page is rendered to a SIGNED-IN user, so checkouts post
 *     auth-required edge functions (paystack-checkout, stripe-checkout,
 *     flutterwave-payment) instead of the guest endpoints.
 *   - The "current plan" card shows "Current plan" instead of a Subscribe
 *     button, and Stripe subscribers see a cancel / reactivate block.
 *   - The country picker is a modal (the landing page autoselects via
 *     timezone only).
 *   - On native (Capacitor iOS / Android), the entire pricing UI is
 *     replaced with a "Manage on web" screen for Apple Guideline 3.1.x
 *     compliance.
 *
 * Plan ID mapping (internal vs. landing):
 *   internal | landing
 *   free     -> starter
 *   pro      -> grower      (highlighted)
 *   enterprise -> farmboss
 *   industry -> industry
 */

const Y = '#ffdd00';

type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';

interface Plan {
  id: 'free' | 'pro' | 'enterprise' | 'industry';
  name: string;
  icon: React.ReactNode;
  badge: string | null;
  highlighted: boolean;
  audience: string;
  features: string[];
  ctaLabel: string;
}

function buildPlans(args: { groupTermPluralLower: string }): Plan[] {
  const { groupTermPluralLower } = args;
  return [
    {
      id: 'free', name: 'Starter',
      icon: <Leaf className="w-5 h-5" />,
      badge: null,
      highlighted: false,
      audience: 'Just getting started',
      ctaLabel: 'Stay on Starter',
      features: [
        `1 farm · 2 active ${groupTermPluralLower} · 1 user`,
        'Mortality, weight & expense tracking',
        'Daily task reminders',
        'WhatsApp daily summary',
        'Eden AI · 15 messages/week',
      ],
    },
    {
      id: 'pro', name: 'Grower',
      icon: <Sprout className="w-5 h-5" />,
      badge: 'Most Popular',
      highlighted: true,
      audience: 'Running a real farm — 50 to 500 animals',
      ctaLabel: 'Choose Grower',
      features: [
        `2 farms · 4 ${groupTermPluralLower} per farm · 4 team members`,
        'Eden AI · 100 messages/week',
        'Photo disease diagnosis · 3/month',
        'Voice messages to Eden',
        'Smart receipt & CSV import',
        'PDF & CSV reports',
        'Payroll & shift management',
        'WhatsApp receipts to buyers',
        'Custom onboarding session',
      ],
    },
    {
      id: 'enterprise', name: 'Farm Boss',
      icon: <Crown className="w-5 h-5" />,
      badge: null,
      highlighted: false,
      audience: 'Commercial farm with workers',
      ctaLabel: 'Choose Farm Boss',
      features: [
        'Everything in Grower, plus:',
        `4 farms · 10 ${groupTermPluralLower} per farm · unlimited team`,
        'Eden AI · 500 messages/week',
        'Photo disease diagnosis · 10/month',
        'Priority WhatsApp support',
      ],
    },
    {
      id: 'industry', name: 'Industry',
      icon: <Building2 className="w-5 h-5" />,
      badge: 'Co-ops & enterprise',
      highlighted: false,
      audience: 'Multiple farms or a cooperative',
      ctaLabel: 'Contact us',
      features: [
        'Everything in Farm Boss, plus:',
        `10 farms · 20 ${groupTermPluralLower} per farm`,
        'Eden AI · unlimited messages',
        'Photo disease diagnosis · unlimited',
        'Direct founder support line',
        'Cooperative dashboard (coming soon)',
      ],
    },
  ];
}

interface SubscribePageProps {
  onBack: () => void;
}

export function SubscribePage({ onBack }: SubscribePageProps) {
  const { profile, currentFarm, refreshSession } = useAuth();
  const farmSpecies = useFarmSpecies();
  const plans = useMemo(() => buildPlans({
    groupTermPluralLower: farmSpecies.groupTermPlural.toLowerCase(),
  }), [farmSpecies.id]);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('quarterly');
  const [region, setRegion] = useState<RegionConfig | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);

  const currentTier = profile?.subscription_tier || 'free';
  const isStripeSubscriber = !!(profile?.stripe_subscription_id);
  const isCancelPending = profile?.cancel_at_period_end === true || cancelDone;
  const expiryDate = profile?.subscription_expires_at
    ? new Date(profile.subscription_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  useEffect(() => {
    const detected = detectRegion();
    // If timezone detection fell back to USD/international, try farm's currency_code
    if (detected.currency === 'USD' && currentFarm?.currency_code && currentFarm.currency_code !== 'USD') {
      const farmCurrency = currentFarm.currency_code;
      if (FIXED_PRICES[farmCurrency]) {
        const match = Object.values(COUNTRY_CONFIGS).find(c => c.currency === farmCurrency);
        if (match) { setRegion(match); return; }
      }
    }
    setRegion(detected);
  }, [currentFarm?.currency_code]);

  // Handle payment gateway returns (Stripe + Flutterwave)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Stripe return
    const stripeSession = params.get('stripe_session');
    const ref = params.get('ref');
    if (stripeSession && ref) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      verifyStripe(stripeSession, ref);
      return;
    }

    // Flutterwave return
    const status = params.get('status');
    const txRef = params.get('tx_ref');
    const transactionId = params.get('transaction_id');
    if (status && txRef) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      if (status === 'successful' && transactionId) {
        verifyFlutterwave(transactionId, txRef);
      } else {
        setError(status === 'cancelled'
          ? 'Payment was cancelled. You can try again.'
          : 'Payment did not complete. Please try again.');
      }
    }
  }, []);

  const priceCurrency = region ? getPriceCurrency(region) : 'USD';

  // ── Price display helpers (mirror landing page's landingPrice/perMonthLine/savingsPct) ──

  const displayPrice = (planId: Plan['id']): string => {
    if (planId === 'free') return 'Free';
    const p = getPrice(planId, billingPeriod, priceCurrency);
    return p !== undefined ? formatPrice(p, priceCurrency) : 'Free';
  };

  const subLabel = (cycle: BillingPeriod): string => {
    if (cycle === 'monthly') return 'per month';
    if (cycle === 'quarterly') return 'per 3 months';
    return 'per year';
  };

  const perMonthLine = (planId: Plan['id']): string | null => {
    if (planId === 'free' || billingPeriod === 'monthly') return null;
    const p = getPrice(planId, billingPeriod, priceCurrency);
    if (!p) return null;
    const months = billingPeriod === 'quarterly' ? 3 : 12;
    return `≈ ${formatPrice(p / months, priceCurrency)}/mo`;
  };

  const savingsPct = (planId: Plan['id'], cycle: BillingPeriod): number | null => {
    if (cycle === 'monthly' || planId === 'free') return null;
    const monthly = getPrice(planId, 'monthly', 'USD');
    const actual = getPrice(planId, cycle, 'USD');
    if (!monthly || !actual) return null;
    const months = cycle === 'quarterly' ? 3 : 12;
    return Math.round((1 - actual / (monthly * months)) * 100);
  };

  const usdAmount = (planId: Plan['id']): number => getPrice(planId, billingPeriod, 'USD');

  // ── Paystack ──────────────────────────────────────────────────────────
  const startPaystack = useCallback(async (plan: string) => {
    setError(null);
    setLoading(plan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paystack-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initialize', plan, billing_period: billingPeriod, currency: priceCurrency, fx_rate: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create payment');

      await openPaystackPopup(data.access_code, data.reference, session.access_token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }, [billingPeriod, priceCurrency]);

  const openPaystackPopup = (accessCode: string, reference: string, token: string) =>
    new Promise<void>(resolve => {
      const doOpen = () => {
        const PS = (window as any).PaystackPop;
        if (!PS) { resolve(); return; }
        PS.setup({
          key: PAYSTACK_PUBLIC_KEY,
          accessCode,
          onClose: () => { setLoading(null); resolve(); },
          callback: async () => { await verifyPaystack(reference, token); resolve(); },
        }).openIframe();
      };
      if ((window as any).PaystackPop) { doOpen(); return; }
      const s = document.createElement('script');
      s.src = 'https://js.paystack.co/v1/inline.js';
      s.onload = doOpen;
      s.onerror = () => resolve(); // resolve so loading is cleared in finally
      document.head.appendChild(s);
    });

  const verifyPaystack = async (reference: string, token: string) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paystack-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', reference }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Verification failed');
      setSuccess(true);
      await refreshSession?.();
    } catch (err: any) {
      setError(`Payment received but could not verify. Contact support - ref: ${reference}`);
    }
  };

  // ── Stripe ────────────────────────────────────────────────────────────
  const startStripe = useCallback(async (plan: string) => {
    setError(null);
    setLoading(plan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_session', plan, billing_period: billingPeriod, currency: priceCurrency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create Stripe session');
      window.location.href = data.url;
      // page navigates away; loading clears on return
    } catch (err: any) {
      setError(err.message);
      setLoading(null);
    }
  }, [billingPeriod, priceCurrency]);

  const verifyStripe = async (sessionId: string, reference: string) => {
    setLoading('verifying');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', session_id: sessionId, reference }),
      });
      if (res.ok) { setSuccess(true); await refreshSession?.(); }
    } catch {} finally {
      setLoading(null);
    }
  };

  // ── Flutterwave — redirect-based (no inline CDN script) ───────────────
  const startFlutterwave = useCallback(async (plan: string) => {
    setError(null);
    setLoading(plan);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Not signed in'); setLoading(null); return; }
    try {
      const localAmount = getPrice(plan, billingPeriod, priceCurrency);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flutterwave-payment/create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          currency: priceCurrency,
          amount: localAmount,
          billing_period: billingPeriod,
          redirect_url: window.location.origin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create payment');
      if (!data.payment_link) throw new Error('No payment link received. Please try again.');

      // On Capacitor native: open Flutterwave inside a SFSafariViewController
      // (iOS) / Custom Tab (Android) so the user stays inside the Edentrack
      // app shell. When they finish payment and dismiss the in-app browser,
      // we listen for browserFinished and trigger a verify call optimistically.
      // On web: classic full-page redirect.
      if (Capacitor.isNativePlatform()) {
        const listener = await Browser.addListener('browserFinished', async () => {
          await listener.remove();
          await refreshSession?.();
          setLoading(null);
        });
        await openInAppBrowser(data.payment_link, { fullscreen: true });
        return;
      }
      window.location.href = data.payment_link;
    } catch (err: any) {
      setError(err.message);
      setLoading(null);
    }
  }, [billingPeriod, priceCurrency, refreshSession]);

  const verifyFlutterwave = async (transactionId: string, txRef: string) => {
    setLoading('verifying');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired. Please log in again.'); return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flutterwave-payment/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId, tx_ref: txRef }),
      });
      if (res.ok) {
        setSuccess(true);
        await refreshSession?.();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Payment received but verification failed. Contact support - ref: ${txRef}`);
      }
    } catch {
      setError(`Could not verify payment. Please contact support.`);
    } finally {
      setLoading(null);
    }
  };

  // ── Stripe cancel / reactivate ────────────────────────────────────────
  const cancelStripe = async () => {
    if (!confirm('Cancel your subscription? You keep access until the end of your billing period. No refund is issued.')) return;
    setCancelLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_subscription' }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to cancel');
      setCancelDone(true);
      await refreshSession?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelLoading(false);
    }
  };

  const reactivateStripe = async () => {
    setCancelLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reactivate_subscription' }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to reactivate');
      setCancelDone(false);
      await refreshSession?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelLoading(false);
    }
  };

  const handleSubscribe = (planId: string) => {
    if (!region) { setError('Detecting your location… please wait a moment and try again.'); return; }
    setError(null);
    if (region.processor === 'paystack') startPaystack(planId);
    else if (region.processor === 'stripe') startStripe(planId);
    else startFlutterwave(planId);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0a0a0a' }}>
        <div className="rounded-3xl p-10 max-w-md w-full text-center"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: Y, boxShadow: '0 0 30px rgba(255,221,0,0.3)' }}>
            <Check className="w-8 h-8 text-gray-900" />
          </div>
          <h1 className="text-2xl font-extrabold text-white mb-2 tracking-tight">You're subscribed!</h1>
          <p className="text-gray-400 mb-6">Your plan is now active. Welcome to EdenTrack Pro.</p>
          <button
            type="button"
            onClick={onBack}
            className="w-full py-3 rounded-2xl font-bold text-gray-900 transition-all hover:scale-[1.02] hover:brightness-110"
            style={{ background: Y, boxShadow: '0 0 30px rgba(255,221,0,0.3)' }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ─── iOS / Android native: hide payment UI ──────────────────────────────
  // Apple's App Store guidelines around in-app payment are strict for
  // anything that even resembles a digital subscription. To keep the
  // first review clean (and avoid Guideline 3.1.1 / 3.1.3 rejections),
  // we don't show pricing, payment buttons, or plan-comparison tables
  // inside the native shell at all. Users tap "Upgrade" anywhere in
  // the app and land on this screen, which just tells them to manage
  // their plan on edentrack.app and offers a button that opens the
  // billing page in an in-app Safari sheet.
  if (Capacitor.isNativePlatform()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0a0a0a' }}>
        <div className="rounded-3xl p-8 max-w-md w-full text-center"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: Y, boxShadow: '0 0 30px rgba(255,221,0,0.3)' }}>
            <Crown className="w-8 h-8 text-gray-900" />
          </div>
          <h1 className="text-xl font-extrabold text-white mb-2 tracking-tight">
            Manage your plan on edentrack.app
          </h1>
          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            To change your plan or update payment, visit Edentrack on the web. Your changes sync back to this app within a minute.
          </p>
          <button
            type="button"
            onClick={() => openInAppBrowser('https://edentrack.app/#/subscribe', { fullscreen: true })}
            className="w-full py-3 rounded-2xl font-bold text-gray-900 transition-all hover:scale-[1.02] hover:brightness-110 mb-3 flex items-center justify-center gap-2"
            style={{ background: Y, boxShadow: '0 0 30px rgba(255,221,0,0.3)' }}
          >
            <ExternalLink className="w-4 h-4" />
            Open Edentrack on the web
          </button>
          <button
            type="button"
            onClick={onBack}
            className="w-full text-gray-400 py-3 rounded-2xl font-semibold hover:text-white hover:bg-white/5 transition-colors"
          >
            Back
          </button>
          <p className="text-[11px] text-gray-500 mt-6 leading-relaxed">
            Your current plan: <span className="font-semibold text-white capitalize">{profile?.subscription_tier || 'Free'}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12" style={{ background: '#0a0a0a' }}>

      {/* Country picker modal */}
      {showCountryPicker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowCountryPicker(false)}>
          <div className="rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-white/10">
              <h3 className="font-bold text-white">Select your country</h3>
              <p className="text-xs text-gray-400 mt-0.5">Prices shown in local currency</p>
            </div>
            <div className="overflow-y-auto flex-1">
              {ALL_COUNTRIES.map(c => {
                const isSelected = region?.countryCode === c.countryCode;
                return (
                  <button key={c.countryCode} type="button"
                    onClick={() => { setRegion(c); setShowCountryPicker(false); }}
                    className={`w-full text-left px-4 py-3 hover:bg-white/5 flex justify-between items-center transition-colors ${
                      isSelected ? 'text-yellow-300 font-medium' : 'text-gray-200'
                    }`}
                    style={isSelected ? { background: 'rgba(255,221,0,0.08)' } : undefined}>
                    <span>{c.countryName}</span>
                    <span className="text-xs text-gray-500">{c.currency}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button type="button" onClick={onBack}
            className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            aria-label="Back">←</button>
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 border border-white/10 text-gray-400 text-[10px] font-bold px-3 py-1 rounded-full mb-2 uppercase tracking-wider">
              Pricing
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Choose your plan</h1>
            <p className="text-gray-400 text-sm mt-1">Cancel anytime · No hidden fees</p>
          </div>
        </div>

        {/* Region selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <button type="button" onClick={() => setShowCountryPicker(true)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-200 hover:bg-white/5 transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Globe className="w-4 h-4 text-gray-400" />
            {region ? `${region.countryName} · ${priceCurrency}` : 'Detecting location…'}
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>
          {region && (
            <span className="text-xs text-gray-500">
              Pay via <span className="font-medium text-gray-300">{region.processorLabel}</span>
            </span>
          )}
        </div>

        {/* Billing period toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-white/5 border border-white/10 rounded-2xl p-1 gap-1">
            {(['monthly', 'quarterly', 'yearly'] as BillingPeriod[]).map(p => {
              const isActive = billingPeriod === p;
              const save = p !== 'monthly' ? savingsPct('pro', p) : null;
              return (
                <button key={p} type="button" onClick={() => setBillingPeriod(p)}
                  className={`relative px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                    isActive ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-200'
                  }`}>
                  {p === 'monthly' ? 'Monthly' : p === 'quarterly' ? '3 Months' : 'Yearly'}
                  {save && !isActive && (
                    <span className="ml-1.5 text-[10px] font-bold text-yellow-400">Save {save}%</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-2xl flex gap-2 items-start"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {loading === 'verifying' && (
          <div className="mb-5 p-3 rounded-2xl flex gap-2 items-center"
            style={{ background: 'rgba(255,221,0,0.08)', border: '1px solid rgba(255,221,0,0.25)' }}>
            <Loader2 className="w-4 h-4 text-yellow-400 animate-spin flex-shrink-0" />
            <p className="text-yellow-200 text-sm">Verifying your payment…</p>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {plans.map(plan => {
            const isCurrent = plan.id === currentTier;
            const isIndustry = plan.id === 'industry';
            const isLoading = loading === plan.id;
            const isFree = plan.id === 'free';
            const save = savingsPct(plan.id, billingPeriod);
            const perMo = perMonthLine(plan.id);

            return (
              <div
                key={plan.id}
                className="rounded-2xl p-6 flex flex-col transition-all hover:-translate-y-1"
                style={{
                  background: plan.highlighted ? Y : 'rgba(255,255,255,0.05)',
                  border: plan.highlighted ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  boxShadow: plan.highlighted ? '0 0 40px rgba(255,221,0,0.15)' : undefined,
                }}
              >
                {plan.badge && (
                  <div className="text-center mb-3">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      plan.highlighted ? 'bg-black/20 text-gray-900' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${plan.highlighted ? 'bg-black/15' : 'bg-white/10'}`}
                    style={{ color: plan.highlighted ? '#1a1a1a' : '#e5e7eb' }}
                  >
                    {plan.icon}
                  </div>
                  <span className={`font-bold text-lg ${plan.highlighted ? 'text-gray-900' : 'text-white'}`}>
                    {plan.name}
                  </span>
                </div>

                <p className={`text-xs mb-4 ${plan.highlighted ? 'text-gray-700' : 'text-gray-400'}`}>
                  {plan.audience}
                </p>

                <div className="mb-5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`text-3xl font-extrabold ${plan.highlighted ? 'text-gray-900' : 'text-white'}`}>
                      {displayPrice(plan.id)}
                    </span>
                    {!isFree && (
                      <span className={`text-sm ${plan.highlighted ? 'text-gray-700' : 'text-gray-500'}`}>
                        / {subLabel(billingPeriod)}
                      </span>
                    )}
                    {save !== null && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        plan.highlighted ? 'bg-black/20 text-gray-900' : 'bg-yellow-400/20 text-yellow-300'
                      }`}>
                        Save {save}%
                      </span>
                    )}
                  </div>
                  {isFree && (
                    <p className={`text-xs mt-0.5 ${plan.highlighted ? 'text-gray-700' : 'text-gray-500'}`}>forever</p>
                  )}
                  {perMo && (
                    <p className={`text-xs mt-0.5 ${plan.highlighted ? 'text-gray-700' : 'text-gray-500'}`}>{perMo}</p>
                  )}
                  {!isFree && priceCurrency !== 'USD' && (
                    <p className={`text-[11px] mt-0.5 ${plan.highlighted ? 'text-gray-700' : 'text-gray-600'}`}>
                      ≈ ${usdAmount(plan.id)} USD
                    </p>
                  )}
                </div>

                <ul className="space-y-2 flex-1 mb-5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${plan.highlighted ? 'text-gray-800' : 'text-yellow-400'}`} />
                      <span className={plan.highlighted ? 'text-gray-800' : 'text-gray-300'}>{f}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div
                    className={`w-full py-3 text-center text-sm font-bold rounded-xl ${
                      plan.highlighted
                        ? 'bg-black/15 text-gray-900'
                        : 'border border-white/15 text-gray-300'
                    }`}
                  >
                    Current plan
                  </div>
                ) : isFree ? (
                  <div className="w-full py-3 text-center text-sm font-semibold rounded-xl border border-white/10 text-gray-500">
                    Free forever
                  </div>
                ) : isIndustry ? (
                  <a
                    href="mailto:support@edentrack.app?subject=Industry Plan"
                    className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 flex items-center justify-center gap-2 bg-blue-600 text-white"
                  >
                    Contact us <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={!!loading}
                    className={`w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 ${
                      plan.highlighted
                        ? 'bg-gray-900 text-white'
                        : plan.id === 'enterprise'
                        ? 'bg-amber-500 text-white'
                        : 'border border-white/20 text-white hover:bg-white/10'
                    }`}
                  >
                    {isLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                    ) : plan.ctaLabel}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Cancellation controls for Stripe subscribers */}
        {isStripeSubscriber && currentTier !== 'free' && (
          <div className="mt-8 rounded-2xl p-4 text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {isCancelPending ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-yellow-300">Subscription cancelled</p>
                  <p className="text-gray-400 mt-0.5">
                    Your {currentTier === 'pro' ? 'Grower' : currentTier === 'enterprise' ? 'Farm Boss' : 'Industry'} plan stays active
                    {expiryDate ? <> until <strong className="text-white">{expiryDate}</strong></> : ' until your billing period ends'}.
                  </p>
                </div>
                <button type="button" onClick={reactivateStripe} disabled={cancelLoading}
                  className="shrink-0 px-4 py-2 text-sm font-bold rounded-xl text-gray-900 transition-all hover:brightness-110 disabled:opacity-50 flex items-center gap-2"
                  style={{ background: Y }}>
                  {cancelLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Keep my plan
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="text-gray-400">
                    Auto-renews{expiryDate ? <> on <strong className="text-white">{expiryDate}</strong></> : ''}.
                    Cancel anytime - you keep access until the end of your billing period. No refunds issued.
                  </p>
                </div>
                <button type="button" onClick={cancelStripe} disabled={cancelLoading}
                  className="shrink-0 px-4 py-2 text-sm font-semibold rounded-xl text-red-300 hover:bg-red-500/10 disabled:opacity-50 flex items-center gap-2"
                  style={{ border: '1px solid rgba(239,68,68,0.3)' }}>
                  {cancelLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Cancel subscription
                </button>
              </div>
            )}
          </div>
        )}

        {region && (
          <p className="text-center text-xs text-gray-500 mt-6">
            Accepted: {region.paymentMethods.join(' · ')} · Prices in {priceCurrency}
            {priceCurrency !== 'USD' && ' · USD shown for reference'}
          </p>
        )}
        <p className="text-center text-xs text-gray-600 mt-2">
          Cancel anytime. Card, mobile money and bank transfer accepted.
        </p>
      </div>
    </div>
  );
}
