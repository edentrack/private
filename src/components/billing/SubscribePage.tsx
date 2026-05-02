import { useState, useEffect, useCallback } from 'react';
import { Check, Crown, Sprout, Leaf, Building2, Globe, ChevronDown, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  detectRegion, ALL_COUNTRIES, RegionConfig, COUNTRY_CONFIGS, FIXED_PRICES,
  getPrice, getPriceCurrency, formatPrice,
} from '../../utils/regionalPayment';

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';

interface Plan {
  id: 'free' | 'pro' | 'enterprise' | 'industry';
  name: string;
  icon: React.ReactNode;
  borderColor: string;
  ringColor: string;
  badge?: string;
  features: string[];
  limits: string;
}

const PLANS: Plan[] = [
  {
    id: 'free', name: 'Starter',
    icon: <Leaf className="w-6 h-6" />,
    borderColor: 'border-agri-brown-200',
    ringColor: '',
    features: ['1 active flock', 'Daily task management', 'Mortality & weight tracking', 'Expense recording', 'Basic inventory', 'WhatsApp report sharing'],
    limits: 'For farmers just getting started',
  },
  {
    id: 'pro', name: 'Grower', badge: 'Most Popular',
    icon: <Sprout className="w-6 h-6" />,
    borderColor: 'border-[#3D5F42]',
    ringColor: 'ring-2 ring-[#3D5F42] ring-offset-2',
    features: ['Up to 5 active flocks', 'Full analytics & KPIs', 'Automated weekly email reports', 'Eden AI advisor (30 msg/mo)', 'Smart receipt import', 'Vaccination scheduling', 'Sales & invoices', '2 team members'],
    limits: 'For growing farms that want full control',
  },
  {
    id: 'enterprise', name: 'Farm Boss',
    icon: <Crown className="w-6 h-6" />,
    borderColor: 'border-amber-300',
    ringColor: '',
    features: ['Unlimited flocks & team members', 'Eden AI — 200 msg/mo + 30 photo diagnoses', 'Smart import with receipt photos', 'Payroll & shift management', 'Benchmarking vs similar farms', 'Loan-readiness PDF report', 'Priority WhatsApp support'],
    limits: 'For serious commercial operations',
  },
  {
    id: 'industry', name: 'Industry',
    icon: <Building2 className="w-6 h-6" />,
    borderColor: 'border-blue-400',
    ringColor: '',
    features: ['Up to 10 farms', 'Multi-farm dashboard', 'Eden AI — unlimited', 'Custom-branded PDF reports', 'Excel/CSV export', 'Webhook API', 'Dedicated support line', 'Onboarding call', 'White-label option'],
    limits: 'For agribusiness & integrators',
  },
];

interface SubscribePageProps {
  onBack: () => void;
}

export function SubscribePage({ onBack }: SubscribePageProps) {
  const { profile, currentFarm, refreshSession } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('quarterly');
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

  const displayPrice = (planId: string) => {
    if (planId === 'free') return 'Free';
    const amount = getPrice(planId, billingPeriod, priceCurrency);
    return formatPrice(amount, priceCurrency);
  };

  const usdAmount = (planId: string): number => getPrice(planId, billingPeriod, 'USD');

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
      setError(`Payment received but could not verify. Contact support — ref: ${reference}`);
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
      // Redirect to Flutterwave hosted checkout — same pattern as Stripe.
      // When done, Flutterwave redirects back to origin and our useEffect verifies.
      window.location.href = data.payment_link;
    } catch (err: any) {
      setError(err.message);
      setLoading(null);
    }
  }, [billingPeriod, priceCurrency]);

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
        setError(body.error || `Payment received but verification failed. Contact support — ref: ${txRef}`);
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
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-10 shadow-lg max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-agri-brown-900 mb-2">You're subscribed!</h1>
          <p className="text-agri-brown-500 mb-6">Your plan is now active. Welcome to EdenTrack Pro.</p>
          <button type="button" onClick={onBack} className="w-full bg-[#3D5F42] text-white py-3 rounded-2xl font-semibold hover:bg-[#2F4A34] transition-colors">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8] p-4 pb-12">

      {/* Country picker modal */}
      {showCountryPicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowCountryPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-agri-brown-100">
              <h3 className="font-semibold text-agri-brown-900">Select your country</h3>
              <p className="text-xs text-agri-brown-400 mt-0.5">Prices shown in local currency</p>
            </div>
            <div className="overflow-y-auto flex-1">
              {ALL_COUNTRIES.map(c => (
                <button key={c.countryCode} type="button"
                  onClick={() => { setRegion(c); setShowCountryPicker(false); }}
                  className={`w-full text-left px-4 py-3 hover:bg-agri-brown-50 flex justify-between items-center ${region?.countryCode === c.countryCode ? 'bg-green-50 text-[#3D5F42] font-medium' : 'text-agri-brown-700'}`}>
                  <span>{c.countryName}</span>
                  <span className="text-xs text-agri-brown-400">{c.currency}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6 pt-4">
          <button type="button" onClick={onBack} className="p-2 rounded-xl bg-white shadow-sm hover:bg-agri-brown-50 text-agri-brown-700">←</button>
          <div>
            <h1 className="text-2xl font-bold text-agri-brown-900">Choose your plan</h1>
            <p className="text-agri-brown-500 text-sm">Cancel anytime · No hidden fees</p>
          </div>
        </div>

        {/* Region selector */}
        <div className="flex items-center justify-between mb-5">
          <button type="button" onClick={() => setShowCountryPicker(true)}
            className="flex items-center gap-2 bg-white border border-agri-brown-200 rounded-xl px-3 py-2 text-sm text-agri-brown-700 hover:bg-agri-brown-50 shadow-sm">
            <Globe className="w-4 h-4 text-agri-brown-400" />
            {region ? `${region.countryName} · ${priceCurrency}` : 'Detecting location…'}
            <ChevronDown className="w-3 h-3 text-agri-brown-400" />
          </button>
          {region && (
            <span className="text-xs text-agri-brown-400">
              Pay via <span className="font-medium text-agri-brown-600">{region.processorLabel}</span>
            </span>
          )}
        </div>

        {/* Billing period toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-agri-brown-50 border border-agri-brown-200 rounded-2xl p-1.5 gap-1">
            {(['monthly', 'quarterly', 'yearly'] as const).map(p => (
              <button key={p} type="button" onClick={() => setBillingPeriod(p)}
                className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${billingPeriod === p
                  ? 'bg-white shadow text-agri-brown-900 border border-agri-brown-200'
                  : 'text-agri-brown-500 hover:text-agri-brown-700'
                }`}>
                {p === 'monthly' ? 'Monthly' : p === 'quarterly' ? '3 Months' : (
                  <span className="flex items-center gap-1.5">
                    Yearly
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">Save 2 months</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-2xl flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {loading === 'verifying' && (
          <div className="mb-5 p-3 bg-green-50 border border-green-200 rounded-2xl flex gap-2 items-center">
            <Loader2 className="w-4 h-4 text-green-600 animate-spin flex-shrink-0" />
            <p className="text-green-700 text-sm">Verifying your payment…</p>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map(plan => {
            const isCurrent = plan.id === currentTier;
            const isPaid = plan.id !== 'free';
            const isIndustry = plan.id === 'industry';
            const isLoading = loading === plan.id;

            const iconBg =
              plan.id === 'pro' ? 'bg-green-100 text-[#3D5F42]' :
              plan.id === 'enterprise' ? 'bg-amber-100 text-amber-600' :
              plan.id === 'industry' ? 'bg-blue-100 text-blue-600' :
              'bg-agri-brown-100 text-agri-brown-500';

            const subscribeBtn =
              plan.id === 'pro'
                ? 'bg-[#3D5F42] text-white hover:bg-[#2F4A34]'
                : plan.id === 'enterprise'
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : plan.id === 'industry'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : '';

            return (
              <div key={plan.id}
                className={`bg-white rounded-3xl border-2 ${plan.borderColor} ${plan.ringColor} p-7 flex flex-col relative`}>
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-[#3D5F42] text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow whitespace-nowrap">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4 mt-1">
                  <div className={`p-2.5 rounded-xl ${iconBg}`}>{plan.icon}</div>
                  <div>
                    <h3 className="font-bold text-agri-brown-900 text-lg leading-tight">{plan.name}</h3>
                    <p className="text-xs text-agri-brown-400 leading-snug">{plan.limits}</p>
                  </div>
                </div>

                {isPaid ? (
                  <div className="mb-5">
                    <div className="flex items-baseline gap-1 flex-wrap">
                      <span className="text-4xl font-bold text-agri-brown-900">{displayPrice(plan.id)}</span>
                    </div>
                    <div className="text-xs text-agri-brown-400 mt-0.5">
                      {priceCurrency !== 'USD' && `≈ $${usdAmount(plan.id)} USD · `}
                      per {billingPeriod === 'yearly' ? '12 months' : billingPeriod === 'monthly' ? 'month' : '3 months'}
                    </div>
                  </div>
                ) : (
                  <div className="mb-5">
                    <span className="text-4xl font-bold text-agri-brown-900">Free</span>
                    <div className="text-xs text-agri-brown-400 mt-0.5">forever</div>
                  </div>
                )}

                <ul className="space-y-2 flex-1 mb-5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-agri-brown-700">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />{f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="w-full py-2.5 text-center text-sm text-agri-brown-500 border-2 border-agri-brown-200 rounded-2xl">
                    Current plan
                  </div>
                ) : plan.id === 'free' ? (
                  <div className="w-full py-2.5 text-center text-sm text-agri-brown-400 border border-agri-brown-100 rounded-2xl">
                    Free forever
                  </div>
                ) : isIndustry ? (
                  <a href="mailto:support@edentrack.app?subject=Industry Plan"
                    className={`w-full py-2.5 text-center text-sm font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5 ${subscribeBtn}`}>
                    Contact us <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <button type="button"
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={!!loading}
                    className={`w-full py-2.5 text-sm font-semibold rounded-2xl transition-all hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 ${subscribeBtn}`}>
                    {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : 'Subscribe'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Cancellation controls for Stripe subscribers */}
        {isStripeSubscriber && currentTier !== 'free' && (
          <div className="mt-6 border border-agri-brown-200 bg-white rounded-2xl p-4 text-sm">
            {isCancelPending ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="font-medium text-amber-700">Subscription cancelled</p>
                  <p className="text-agri-brown-500 mt-0.5">
                    Your {currentTier === 'pro' ? 'Grower' : currentTier === 'enterprise' ? 'Farm Boss' : 'Industry'} plan stays active
                    {expiryDate ? <> until <strong>{expiryDate}</strong></> : ' until your billing period ends'}.
                  </p>
                </div>
                <button type="button" onClick={reactivateStripe} disabled={cancelLoading}
                  className="shrink-0 px-4 py-2 bg-[#3D5F42] text-white text-sm font-medium rounded-xl hover:bg-[#2F4A34] disabled:opacity-50 flex items-center gap-2">
                  {cancelLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Keep my plan
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="text-agri-brown-500">
                    Auto-renews{expiryDate ? <> on <strong>{expiryDate}</strong></> : ''}.
                    Cancel anytime — you keep access until the end of your billing period. No refunds issued.
                  </p>
                </div>
                <button type="button" onClick={cancelStripe} disabled={cancelLoading}
                  className="shrink-0 px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-xl hover:bg-red-50 disabled:opacity-50 flex items-center gap-2">
                  {cancelLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Cancel subscription
                </button>
              </div>
            )}
          </div>
        )}

        {region && (
          <p className="text-center text-xs text-agri-brown-400 mt-5">
            Accepted: {region.paymentMethods.join(' · ')} · Prices in {priceCurrency}
            {priceCurrency !== 'USD' && ' · USD shown for reference'}
          </p>
        )}
      </div>
    </div>
  );
}
