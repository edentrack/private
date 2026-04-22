import { useState, useEffect, useCallback, useRef } from 'react';
import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3';
import { Check, Crown, Sprout, Leaf, Building2, Globe, ChevronDown, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  detectRegion, ALL_COUNTRIES, RegionConfig,
  getPrice, getPriceCurrency, formatPrice,
} from '../../utils/regionalPayment';

const FLW_PUBLIC_KEY = import.meta.env.VITE_FLW_PUBLIC_KEY || '';
const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';

interface Plan {
  id: 'free' | 'pro' | 'enterprise' | 'industry';
  name: string;
  icon: React.ReactNode;
  color: string;
  badge?: string;
  features: string[];
  limits: string;
}

const PLANS: Plan[] = [
  {
    id: 'free', name: 'Starter',
    icon: <Leaf className="w-6 h-6" />, color: 'border-gray-200',
    features: ['1 active flock', 'Daily task management', 'Mortality & weight tracking', 'Expense recording', 'Basic inventory', 'WhatsApp report sharing'],
    limits: 'Great for getting started',
  },
  {
    id: 'pro', name: 'Grower', badge: 'Most Popular',
    icon: <Sprout className="w-6 h-6" />, color: 'border-[#3D5F42]',
    features: ['Up to 5 active flocks', 'Full analytics & KPIs', 'Automated weekly email reports', 'Eden AI advisor (30 msg/mo)', 'Smart receipt import', 'Vaccination scheduling', 'Sales & invoices', '2 team members'],
    limits: 'Perfect for growing farms',
  },
  {
    id: 'enterprise', name: 'Farm Boss',
    icon: <Crown className="w-6 h-6" />, color: 'border-amber-400',
    features: ['Unlimited flocks & team members', 'Eden AI — 200 msg/mo + 30 photo diagnoses', 'Smart import with receipt photos', 'Payroll & shift management', 'Benchmarking vs similar farms', 'Loan-readiness PDF report', 'Priority WhatsApp support'],
    limits: 'For serious commercial operations',
  },
  {
    id: 'industry', name: 'Industry',
    icon: <Building2 className="w-6 h-6" />, color: 'border-blue-500',
    features: ['Up to 10 farms', 'Multi-farm dashboard', 'Eden AI — unlimited', 'Custom-branded PDF reports', 'Excel/CSV export', 'Webhook API', 'Dedicated support line', 'Onboarding call', 'White-label option'],
    limits: 'For agribusiness & integrators',
  },
];

interface SubscribePageProps {
  onBack: () => void;
}

type CampayStatus = 'idle' | 'initiating' | 'pending' | 'success' | 'failed';

export function SubscribePage({ onBack }: SubscribePageProps) {
  const { profile, refreshSession } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState<'quarterly' | 'yearly'>('quarterly');
  const [region, setRegion] = useState<RegionConfig | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Campay mobile money
  const [campayPlan, setCampayPlan] = useState<string | null>(null);
  const [campayPhone, setCampayPhone] = useState('');
  const [campayStatus, setCampayStatus] = useState<CampayStatus>('idle');
  const campayPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentTier = profile?.subscription_tier || 'free';

  useEffect(() => { setRegion(detectRegion()); }, []);

  // Clean up campay polling on unmount
  useEffect(() => () => { if (campayPollRef.current) clearInterval(campayPollRef.current); }, []);

  // Check for Stripe redirect back (?stripe_session=xxx&ref=xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeSession = params.get('stripe_session');
    const ref = params.get('ref');
    if (stripeSession && ref) {
      window.history.replaceState({}, '', window.location.pathname);
      verifyStripe(stripeSession, ref);
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
    } finally {
      setLoading(null);
    }
  };

  // ── Campay ────────────────────────────────────────────────────────────
  const startCampay = async () => {
    if (!campayPlan || !campayPhone.trim()) return;
    setCampayStatus('initiating');
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const xafAmount = getPrice(campayPlan, billingPeriod, 'XAF');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/campay-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initiate', plan: campayPlan, billing_period: billingPeriod, phone: campayPhone, amount_xaf: xafAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initiate payment');
      setCampayStatus('pending');
      let polls = 0;
      campayPollRef.current = setInterval(async () => {
        polls++;
        if (polls > 22) {
          clearInterval(campayPollRef.current!);
          setCampayStatus('failed');
          setError('Payment timed out. Please try again.');
          return;
        }
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s) return;
        const sr = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/campay-checkout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check', reference: data.reference }),
        });
        const sd = await sr.json();
        if (sd.status === 'SUCCESSFUL') {
          clearInterval(campayPollRef.current!);
          setCampayStatus('success');
          setSuccess(true);
          await refreshSession?.();
        } else if (sd.status === 'FAILED') {
          clearInterval(campayPollRef.current!);
          setCampayStatus('failed');
          setError('Payment was declined. Please try again.');
        }
      }, 4000);
    } catch (err: any) {
      setCampayStatus('failed');
      setError(err.message);
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
      // Redirect to Stripe hosted checkout
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message);
      setLoading(null);
    }
  }, [billingPeriod, priceCurrency]);

  const verifyStripe = async (sessionId: string, reference: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', session_id: sessionId, reference }),
      });
      if (res.ok) { setSuccess(true); await refreshSession?.(); }
    } catch {}
  };

  // ── Flutterwave (fallback for unrecognised regions) ───────────────────
  const flwConfig = {
    public_key: FLW_PUBLIC_KEY,
    tx_ref: `edentrack-flw-${profile?.id}-${Date.now()}`,
    amount: 0, currency: 'USD',
    payment_options: 'card,mobilemoney,banktransfer',
    customer: { email: profile?.email || '', name: profile?.full_name || 'Edentrack User' },
    customizations: { title: 'Edentrack', description: 'Subscription', logo: '' },
  };
  const handleFLW = useFlutterwave(flwConfig);

  const startFlutterwave = useCallback(async (plan: string) => {
    if (!FLW_PUBLIC_KEY) { setError('Payment not configured. Contact support.'); return; }
    setLoading(plan);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Not signed in'); setLoading(null); return; }
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flutterwave-payment/create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, currency: 'USD', billing_period: billingPeriod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create payment');
      handleFLW({
        ...flwConfig,
        tx_ref: data.tx_ref,
        amount: usdAmount(plan),
        callback: async (response: any) => {
          closePaymentModal();
          const vr = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flutterwave-payment/verify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_id: response.transaction_id, tx_ref: data.tx_ref }),
          });
          if (vr.ok) { setSuccess(true); await refreshSession?.(); }
          else setError('Verification failed. Contact support with your receipt.');
          setLoading(null);
        },
        onClose: () => setLoading(null),
      });
    } catch (err: any) { setError(err.message); setLoading(null); }
  }, [handleFLW, billingPeriod]);

  const handleSubscribe = (planId: string) => {
    if (!region) return;
    setError(null);
    if (region.processor === 'campay') {
      setCampayPlan(planId);
      setCampayStatus('idle');
      setCampayPhone(region.phonePrefix);
    } else if (region.processor === 'paystack') {
      startPaystack(planId);
    } else if (region.processor === 'stripe') {
      startStripe(planId);
    } else {
      startFlutterwave(planId);
    }
  };

  // ── Campay phone entry modal ──────────────────────────────────────────
  if (campayPlan && campayStatus !== 'success') {
    const localAmt = formatPrice(getPrice(campayPlan, billingPeriod, 'XAF'), 'XAF');
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 shadow-lg max-w-sm w-full">
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            {campayPlan === 'pro' ? 'Grower' : campayPlan === 'enterprise' ? 'Farm Boss' : 'Industry'} — Mobile Money
          </h2>
          <p className="text-gray-500 text-sm mb-5">{localAmt} / {billingPeriod === 'yearly' ? '12 months' : '3 months'}</p>

          {(campayStatus === 'idle' || campayStatus === 'initiating') && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your MTN or Orange number</label>
              <input
                type="tel"
                value={campayPhone}
                onChange={e => setCampayPhone(e.target.value)}
                placeholder="+237 6XX XXX XXX"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
                disabled={campayStatus === 'initiating'}
              />
              {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
              <button type="button" onClick={startCampay} disabled={campayStatus === 'initiating' || !campayPhone.trim()}
                className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                {campayStatus === 'initiating' ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send payment request'}
              </button>
              <button type="button" onClick={() => { setCampayPlan(null); setCampayStatus('idle'); setError(null); }}
                className="w-full text-gray-400 text-sm mt-3 py-2">Cancel</button>
            </>
          )}

          {campayStatus === 'pending' && (
            <div className="text-center py-6">
              <Loader2 className="w-10 h-10 animate-spin text-[#3D5F42] mx-auto mb-3" />
              <p className="font-semibold text-gray-800">Check your phone</p>
              <p className="text-gray-500 text-sm mt-1">A payment request was sent to <strong>{campayPhone}</strong>. Approve it in your MoMo or Orange Money app.</p>
              <p className="text-gray-400 text-xs mt-4">Waiting for confirmation…</p>
            </div>
          )}

          {campayStatus === 'failed' && (
            <div className="text-center py-4">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <p className="font-semibold text-gray-800">Payment failed</p>
              <p className="text-gray-500 text-sm mt-1">{error || 'The payment was declined or timed out.'}</p>
              <button type="button" onClick={() => { setCampayStatus('idle'); setError(null); }}
                className="mt-4 w-full bg-[#3D5F42] text-white py-3 rounded-xl font-semibold">Try again</button>
              <button type="button" onClick={() => { setCampayPlan(null); setCampayStatus('idle'); setError(null); }}
                className="w-full text-gray-400 text-sm mt-2 py-2">Cancel</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">You're subscribed!</h1>
          <p className="text-gray-600 mb-6">Your plan is now active. Welcome to Edentrack Pro.</p>
          <button type="button" onClick={onBack} className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-semibold">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8] p-4">
      {/* Country picker modal */}
      {showCountryPicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowCountryPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Select your country</h3>
              <p className="text-xs text-gray-400 mt-0.5">Prices shown in local currency</p>
            </div>
            <div className="overflow-y-auto flex-1">
              {ALL_COUNTRIES.map(c => (
                <button key={c.countryCode} type="button"
                  onClick={() => { setRegion(c); setShowCountryPicker(false); }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex justify-between items-center ${region?.countryCode === c.countryCode ? 'bg-green-50 text-[#3D5F42] font-medium' : 'text-gray-700'}`}>
                  <span>{c.countryName}</span>
                  <span className="text-xs text-gray-400">{c.currency}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 pt-4">
          <button type="button" onClick={onBack} className="p-2 rounded-xl bg-white shadow-sm hover:bg-gray-50">←</button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Choose your plan</h1>
            <p className="text-gray-500 text-sm">Cancel anytime · No hidden fees</p>
          </div>
        </div>

        {/* Region selector + payment method */}
        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={() => setShowCountryPicker(true)}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 shadow-sm">
            <Globe className="w-4 h-4 text-gray-400" />
            {region ? `${region.countryName} · ${priceCurrency}` : 'Detecting location…'}
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>
          {region && (
            <span className="text-xs text-gray-400">
              Pay via <span className="font-medium text-gray-600">{region.processorLabel}</span>
            </span>
          )}
        </div>

        {/* Billing period toggle */}
        <div className="flex justify-center mb-6">
          <div className="bg-white rounded-xl p-1 flex gap-1 shadow-sm border border-gray-200">
            {(['quarterly', 'yearly'] as const).map(p => (
              <button key={p} type="button" onClick={() => setBillingPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${billingPeriod === p ? 'bg-[#3D5F42] text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                {p === 'quarterly' ? 'Quarterly' : (
                  <><span>Yearly</span><span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${billingPeriod === 'yearly' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'}`}>Save 2 months</span></>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map(plan => {
            const isCurrent = plan.id === currentTier;
            const isPaid = plan.id !== 'free';
            const isIndustry = plan.id === 'industry';
            const isLoading = loading === plan.id;

            return (
              <div key={plan.id} className={`bg-white rounded-2xl border-2 ${plan.color} p-5 flex flex-col relative`}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#3D5F42] text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                    {plan.badge}
                  </div>
                )}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${plan.id === 'pro' ? 'bg-green-100 text-[#3D5F42]' : plan.id === 'enterprise' ? 'bg-amber-100 text-amber-600' : plan.id === 'industry' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  {plan.icon}
                </div>
                <h3 className="font-bold text-gray-900 text-lg">{plan.name}</h3>
                <p className="text-xs text-gray-500 mb-3">{plan.limits}</p>

                {isPaid ? (
                  <div className="mb-4">
                    <div className="text-2xl font-bold text-gray-900">{displayPrice(plan.id)}</div>
                    <div className="text-xs text-gray-400">
                      {priceCurrency !== 'USD' && `≈ $${usdAmount(plan.id)} USD · `}
                      per {billingPeriod === 'yearly' ? '12 months' : '3 months'}
                    </div>
                  </div>
                ) : (
                  <div className="text-2xl font-bold text-gray-900 mb-4">Free</div>
                )}

                <ul className="space-y-1.5 flex-1 mb-4">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />{f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="w-full py-2 text-center text-sm text-gray-500 border border-gray-200 rounded-xl">Current plan</div>
                ) : plan.id === 'free' ? (
                  <div className="w-full py-2 text-center text-sm text-gray-400">Free forever</div>
                ) : isIndustry ? (
                  <a href="mailto:support@edentrack.app?subject=Industry Plan"
                    className="w-full py-2.5 text-center text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5">
                    Contact us <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <button type="button" onClick={() => handleSubscribe(plan.id)} disabled={!!loading}
                    className="w-full py-2.5 text-sm font-semibold bg-[#3D5F42] text-white rounded-xl hover:bg-[#2F4A34] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : 'Subscribe'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {region && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Accepted: {region.paymentMethods.join(' · ')} · Prices in {priceCurrency}
            {priceCurrency !== 'USD' && ' · USD shown for reference'}
          </p>
        )}
      </div>
    </div>
  );
}
