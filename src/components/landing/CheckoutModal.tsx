import { useState } from 'react';
import { X, Loader2, Sprout, Crown, ArrowRight } from 'lucide-react';

interface CheckoutModalProps {
  plan: 'grower' | 'farmboss';
  billingPeriod?: 'monthly' | 'quarterly' | 'yearly';
  onClose: () => void;
}

const PLAN_DETAILS = {
  grower: {
    name: 'Grower', planId: 'pro',
    icon: Sprout, color: '#3D5F42', btnClass: 'bg-[#3D5F42] hover:bg-[#2F4A34]',
    description: 'Full analytics, Eden AI advisor, up to 5 flocks',
  },
  farmboss: {
    name: 'Farm Boss', planId: 'enterprise',
    icon: Crown, color: '#F59E0B', btnClass: 'bg-amber-500 hover:bg-amber-600',
    description: 'Unlimited flocks, payroll, benchmarking',
  },
};

const CYCLE_PRICE: Record<string, Record<string, number>> = {
  monthly:   { pro: 6.99,  enterprise: 14.99 },
  quarterly: { pro: 14.99, enterprise: 34.99 },
  yearly:    { pro: 49.99, enterprise: 114.99 },
};
const CYCLE_LABELS: Record<string, string> = { monthly: 'month', quarterly: '3 months', yearly: 'year' };

export function CheckoutModal({ plan, billingPeriod = 'quarterly', onClose }: CheckoutModalProps) {
  const details = PLAN_DETAILS[plan];
  const Icon = details.icon;
  const price = CYCLE_PRICE[billingPeriod]?.[details.planId] ?? CYCLE_PRICE.quarterly[details.planId];

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-checkout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_session',
            email,
            plan: details.planId,
            billing_period: billingPeriod,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Could not start checkout. Please try again.');
      }
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl" style={{ background: `${details.color}20`, color: details.color }}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-agri-brown-900">Get started with {details.name}</h2>
              <p className="text-sm text-agri-brown-400">{details.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-agri-brown-300 hover:text-agri-brown-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-agri-brown-50 border border-agri-brown-100 rounded-2xl px-4 py-3 mb-5 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-agri-brown-900">${price}</span>
          <span className="text-agri-brown-500 text-sm">per {CYCLE_LABELS[billingPeriod]} · cancel anytime</span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Your email address"
            required
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-agri-brown-200 text-agri-brown-900 placeholder-agri-brown-300 focus:outline-none focus:ring-2 focus:ring-[#3D5F42] text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-2xl font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-60 disabled:scale-100 flex items-center justify-center gap-2 mt-1 ${details.btnClass}`}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to payment…</>
              : <>Go to payment <ArrowRight className="w-4 h-4" /></>}
          </button>
          <p className="text-center text-xs text-agri-brown-400 mt-2">
            You'll receive an email to set your password after payment.
          </p>
        </form>

        <p className="text-center text-xs text-agri-brown-400 mt-4">
          <button
            onClick={() => { onClose(); window.location.hash = '#/login'; }}
            className="text-[#3D5F42] font-medium hover:underline"
          >
            Already subscribed? Sign in
          </button>
          {' '}· Secured by Stripe
        </p>
      </div>
    </div>
  );
}
