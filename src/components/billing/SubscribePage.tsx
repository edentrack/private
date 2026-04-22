import { useState, useCallback } from 'react';
import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3';
import { Check, Crown, Sprout, Leaf, Clock, AlertCircle, Building2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

const FLW_PUBLIC_KEY = import.meta.env.VITE_FLW_PUBLIC_KEY || '';

interface Plan {
  id: 'free' | 'pro' | 'enterprise' | 'industry';
  name: string;
  price: number;
  period: string;
  icon: React.ReactNode;
  color: string;
  features: string[];
  limits: string;
  cta: string;
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Starter',
    price: 0,
    period: 'forever',
    icon: <Leaf className="w-6 h-6" />,
    color: 'border-gray-200',
    features: [
      '1 active flock',
      'Daily task management',
      'Mortality & weight tracking',
      'Expense recording',
      'Basic inventory management',
      'WhatsApp report sharing',
    ],
    limits: 'Great for getting started',
    cta: 'Current plan',
  },
  {
    id: 'pro',
    name: 'Grower',
    price: 15,
    period: '3 months',
    icon: <Sprout className="w-6 h-6" />,
    color: 'border-[#3D5F42]',
    features: [
      'Up to 5 active flocks',
      'Full analytics & KPIs',
      'Automated weekly email reports',
      'Eden AI farm advisor (30 msg/month)',
      'Smart receipt & document import',
      'Vaccination scheduling',
      'Sales tracking & invoices',
      '2 team members',
    ],
    limits: 'Perfect for growing farms',
    cta: 'Subscribe — $15',
  },
  {
    id: 'enterprise',
    name: 'Farm Boss',
    price: 33,
    period: '3 months',
    icon: <Crown className="w-6 h-6" />,
    color: 'border-amber-400',
    features: [
      'Unlimited flocks & team members',
      'Eden AI — 200 messages/month + 30 photo diagnoses',
      'Smart import with receipt photos',
      'Payroll & shift management',
      'Benchmarking vs similar farms',
      'Loan-readiness PDF report',
      'Priority WhatsApp support',
      'Early access to new features',
    ],
    limits: 'For serious commercial operations',
    cta: 'Subscribe — $33',
  },
  {
    id: 'industry',
    name: 'Industry',
    price: 99,
    period: '3 months',
    icon: <Building2 className="w-6 h-6" />,
    color: 'border-blue-500',
    features: [
      'Up to 10 farms under one account',
      'Multi-farm dashboard & analytics',
      'Eden AI — unlimited, always best model',
      'Unlimited team members & custom roles',
      'Custom-branded PDF reports (your logo)',
      'Excel/CSV data export anytime',
      'Webhook API for system integrations',
      'Dedicated WhatsApp support line',
      'Personal onboarding & setup call',
      'Quarterly business review call',
      'White-label option available',
    ],
    limits: 'For integrators, agribusiness & large commercial farms',
    cta: 'Contact us — $99',
  },
];

interface SubscribePageProps {
  onBack: () => void;
}

// Prices per plan (quarterly then yearly = quarterly × 10 / 3 ≈ 2 months free)
const QUARTERLY_PRICES: Record<string, number> = { pro: 15, enterprise: 33, industry: 99 };
const YEARLY_PRICES: Record<string, number> = { pro: 50, enterprise: 110, industry: 330 };

export function SubscribePage({ onBack }: SubscribePageProps) {
  const { profile, refreshSession } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'enterprise' | 'industry' | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'quarterly' | 'yearly'>('quarterly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const currentTier = profile?.subscription_tier || 'free';
  const expiresAt = profile?.subscription_expires_at ? new Date(profile.subscription_expires_at) : null;
  const isTrialActive = expiresAt && expiresAt > new Date() && currentTier !== 'free';
  const isExpired = expiresAt && expiresAt < new Date();
  const trialDaysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const getPrice = (planId: string) =>
    billingPeriod === 'yearly' ? (YEARLY_PRICES[planId] ?? 0) : (QUARTERLY_PRICES[planId] ?? 0);

  const flutterwaveConfig = {
    public_key: FLW_PUBLIC_KEY,
    tx_ref: `edentrack-${profile?.id}-${Date.now()}`,
    amount: selectedPlan ? getPrice(selectedPlan) : 0,
    currency: 'USD',
    payment_options: 'card,mobilemoney,banktransfer',
    customer: {
      email: profile?.email || '',
      name: profile?.full_name || 'Edentrack User',
    },
    customizations: {
      title: 'Edentrack',
      description: `${selectedPlan === 'enterprise' ? 'Farm Boss' : selectedPlan === 'industry' ? 'Industry' : 'Grower'} Plan — ${billingPeriod === 'yearly' ? '12 months' : '3 months'}`,
      logo: 'https://edentrack.app/logo.png',
    },
    meta: {
      user_id: profile?.id,
      plan: selectedPlan,
    },
  };

  const handleFlutterPayment = useFlutterwave(flutterwaveConfig);

  const startPayment = useCallback(async (plan: 'pro' | 'enterprise') => {
    if (!FLW_PUBLIC_KEY) {
      setError('Payment system not configured. Please contact support.');
      return;
    }
    setSelectedPlan(plan);
    setError(null);
    setLoading(true);

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');

      // Create transaction record on server
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flutterwave-payment/create`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plan, currency: 'USD', billing_period: billingPeriod }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create payment');

      // Open Flutterwave modal with the tx_ref from server
      const config = {
        ...flutterwaveConfig,
        tx_ref: data.tx_ref,
        amount: getPrice(plan),
        payment_options: 'card,mobilemoney,banktransfer',
        callback: async (response: any) => {
          closePaymentModal();
          await verifyPayment(response.transaction_id, data.tx_ref, session.access_token);
        },
        onClose: () => {
          setLoading(false);
          setSelectedPlan(null);
        },
      };

      handleFlutterPayment(config);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setLoading(false);
      setSelectedPlan(null);
    }
  }, [handleFlutterPayment, profile, flutterwaveConfig]);

  const verifyPayment = async (transaction_id: string, tx_ref: string, accessToken: string) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flutterwave-payment/verify`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transaction_id, tx_ref }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');

      setSuccess(true);
      setLoading(false);
      // Refresh session to pick up new subscription_tier + expires_at
      await refreshSession?.();
    } catch (err: any) {
      setError(`Payment verification failed: ${err.message}. Contact support with your receipt.`);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">You're subscribed!</h1>
          <p className="text-gray-600 mb-6">
            Your {currentTier === 'enterprise' ? 'Farm Boss' : 'Grower'} plan is now active for 3 months.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-semibold hover:bg-[#2F4A34] transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8] p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-white shadow-sm hover:bg-gray-50 transition-colors"
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Choose your plan</h1>
            <p className="text-gray-600 text-sm">Cancel anytime</p>
          </div>
        </div>

        {/* Billing period toggle */}
        <div className="flex items-center justify-center mb-6">
          <div className="bg-white rounded-xl p-1 flex gap-1 shadow-sm border border-gray-200">
            <button
              type="button"
              onClick={() => setBillingPeriod('quarterly')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${billingPeriod === 'quarterly' ? 'bg-[#3D5F42] text-white shadow' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Quarterly
            </button>
            <button
              type="button"
              onClick={() => setBillingPeriod('yearly')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${billingPeriod === 'yearly' ? 'bg-[#3D5F42] text-white shadow' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Yearly
              <span className="bg-amber-400 text-amber-900 text-xs px-1.5 py-0.5 rounded-full font-bold leading-tight">
                Save 2 months
              </span>
            </button>
          </div>
        </div>

        {/* Trial / Expiry Banner */}
        {isTrialActive && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-amber-800 font-medium">
                Free trial: {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left
              </p>
              <p className="text-amber-700 text-sm">Subscribe now to keep your data and access</p>
            </div>
          </div>
        )}

        {isExpired && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-red-800 font-medium">Your subscription has expired</p>
              <p className="text-red-700 text-sm">Subscribe to restore full access to your farm data</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {!FLW_PUBLIC_KEY && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-yellow-800 text-sm font-medium">
              Payment system setup required — add VITE_FLW_PUBLIC_KEY to your environment variables.
            </p>
          </div>
        )}

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {PLANS.map((plan) => {
            const isCurrent = currentTier === plan.id;
            const isPaid = plan.id !== 'free';

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl p-6 border-2 shadow-sm flex flex-col ${plan.color} ${
                  plan.id === 'pro' ? 'ring-2 ring-[#3D5F42] ring-offset-2' : ''
                }`}
              >
                {plan.id === 'pro' && (
                  <div className="text-center mb-3">
                    <span className="bg-[#3D5F42] text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-xl ${
                    plan.id === 'free'     ? 'bg-gray-100 text-gray-600' :
                    plan.id === 'pro'      ? 'bg-green-100 text-[#3D5F42]' :
                    plan.id === 'enterprise' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {plan.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{plan.name}</h3>
                    <p className="text-xs text-gray-500">{plan.limits}</p>
                  </div>
                </div>

                <div className="mb-4">
                  {plan.id === 'free' ? (
                    <span className="text-3xl font-bold text-gray-900">Free</span>
                  ) : plan.id === 'industry' ? (
                    <span className="text-3xl font-bold text-gray-900">${billingPeriod === 'yearly' ? YEARLY_PRICES.industry : QUARTERLY_PRICES.industry}</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-gray-900">
                        ${billingPeriod === 'yearly' ? YEARLY_PRICES[plan.id] : QUARTERLY_PRICES[plan.id]}
                      </span>
                      <span className="text-gray-500 text-sm"> / {billingPeriod === 'yearly' ? 'year' : '3 months'}</span>
                      <p className="text-gray-400 text-xs mt-0.5">
                        ≈ ${billingPeriod === 'yearly'
                          ? (YEARLY_PRICES[plan.id] / 12).toFixed(0)
                          : (QUARTERLY_PRICES[plan.id] / 3).toFixed(0)}/month
                        {billingPeriod === 'yearly' && <span className="text-amber-500 font-semibold ml-1.5">2 months free!</span>}
                      </p>
                    </>
                  )}
                </div>

                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent && !isExpired ? (
                  <div className="w-full bg-gray-100 text-gray-500 py-2.5 rounded-xl text-center text-sm font-medium">
                    Current plan
                  </div>
                ) : plan.id === 'industry' ? (
                  <a
                    href="mailto:hello@edentrack.app?subject=Industry Plan Enquiry"
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors bg-blue-600 text-white hover:bg-blue-700 text-center block"
                  >
                    Contact us
                  </a>
                ) : isPaid ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => startPayment(plan.id as 'pro' | 'enterprise')}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      plan.id === 'pro'
                        ? 'bg-[#3D5F42] text-white hover:bg-[#2F4A34]'
                        : 'bg-amber-500 text-white hover:bg-amber-600'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {loading && selectedPlan === plan.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </span>
                    ) : (
                      `Subscribe — $${getPrice(plan.id)}`
                    )}
                  </button>
                ) : (
                  <div className="w-full bg-gray-50 text-gray-400 py-2.5 rounded-xl text-center text-sm">
                    Always free
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer notes */}
        <div className="text-center space-y-1 pb-8">
          <p className="text-gray-500 text-sm">Payments via Flutterwave — card & mobile money accepted</p>
          <p className="text-gray-400 text-xs">Your data is always yours, even on the free plan</p>
        </div>
      </div>
    </div>
  );
}
