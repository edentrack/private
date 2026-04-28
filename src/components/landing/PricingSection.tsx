import { useState } from 'react';
import { Check, ArrowRight, Leaf, Sprout, Crown } from 'lucide-react';
import { CheckoutModal } from './CheckoutModal';

interface PricingSectionProps {
  onGetStarted: () => void;
}

type Cycle = 'monthly' | 'quarterly' | 'yearly';

const CYCLE_LABELS: Record<Cycle, string> = {
  monthly: 'Monthly',
  quarterly: '3 Months',
  yearly: 'Yearly',
};

interface PlanPricing {
  monthly: number;
  quarterly: number; // total charge
  yearly: number;    // total charge
}

const PRICING: Record<'grower' | 'farmboss', PlanPricing> = {
  grower:   { monthly: 12, quarterly: 30,  yearly: 108 },
  farmboss: { monthly: 35, quarterly: 87,  yearly: 300 },
};

function savings(plan: 'grower' | 'farmboss', cycle: Cycle): number | null {
  if (cycle === 'monthly') return null;
  const { monthly, quarterly, yearly } = PRICING[plan];
  if (cycle === 'quarterly') {
    const equivalent = monthly * 3;
    return Math.round((1 - quarterly / equivalent) * 100);
  }
  const equivalent = monthly * 12;
  return Math.round((1 - yearly / equivalent) * 100);
}

function cycleLabel(plan: 'grower' | 'farmboss', cycle: Cycle): string {
  if (cycle === 'monthly') return '/month';
  if (cycle === 'quarterly') return `/ 3 months`;
  return '/year';
}

function displayPrice(plan: 'grower' | 'farmboss', cycle: Cycle): string {
  const { monthly, quarterly, yearly } = PRICING[plan];
  if (cycle === 'monthly') return `$${monthly}`;
  if (cycle === 'quarterly') return `$${quarterly}`;
  return `$${yearly}`;
}

function perMonthEquiv(plan: 'grower' | 'farmboss', cycle: Cycle): string {
  const { monthly, quarterly, yearly } = PRICING[plan];
  if (cycle === 'monthly') return `$${monthly}/mo`;
  if (cycle === 'quarterly') return `≈ $${Math.round(quarterly / 3)}/mo`;
  return `≈ $${Math.round(yearly / 12)}/mo`;
}

export default function PricingSection({ onGetStarted }: PricingSectionProps) {
  const [cycle, setCycle] = useState<Cycle>('quarterly');
  const [checkoutPlan, setCheckoutPlan] = useState<'grower' | 'farmboss' | null>(null);

  const goSignup = () => {
    onGetStarted();
    window.location.href = (window.location.pathname || '/') + '#/signup';
  };

  const growerSave = savings('grower', cycle);
  const farmbossSave = savings('farmboss', cycle);

  return (
    <>
    {checkoutPlan && <CheckoutModal plan={checkoutPlan} onClose={() => setCheckoutPlan(null)} />}
    <section id="pricing" className="py-20 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Heading */}
        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold text-agri-brown-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-agri-brown-600 max-w-2xl mx-auto">
            Start free. Upgrade when you need analytics, AI, and team tools.
          </p>
        </div>

        {/* Billing cycle toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex bg-agri-brown-50 border border-agri-brown-200 rounded-2xl p-1.5 gap-1">
            {(['monthly', 'quarterly', 'yearly'] as Cycle[]).map(c => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                  cycle === c
                    ? 'bg-white shadow text-agri-brown-900 border border-agri-brown-200'
                    : 'text-agri-brown-500 hover:text-agri-brown-700'
                }`}
              >
                {CYCLE_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">

          {/* Starter — free, no cycle change */}
          <div className="bg-white rounded-3xl p-8 border-2 border-agri-brown-200 shadow-sm flex flex-col relative">
            <div className="flex items-center gap-3 mb-4 mt-2">
              <div className="p-2.5 rounded-xl bg-gray-100 text-gray-600">
                <Leaf className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-agri-brown-900">Starter</h3>
                <p className="text-xs text-agri-brown-500">For farmers just getting started</p>
              </div>
            </div>
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-bold text-agri-brown-900">Free</span>
              </div>
              <p className="text-agri-brown-400 text-xs mt-1">forever</p>
            </div>
            <ul className="space-y-2.5 flex-1 mb-6">
              {['1 active flock', 'Mortality & weight tracking', 'Expense recording', 'Task management', 'WhatsApp daily share'].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-agri-brown-700">
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
              {['Analytics & KPIs', 'Email reports', 'Eden AI advisor', 'Team members'].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-agri-brown-300 line-through">
                  <span className="w-4 h-4 flex-shrink-0 mt-0.5 text-center">–</span>
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={goSignup}
              className="w-full py-3 rounded-2xl font-semibold text-sm border-2 border-agri-brown-300 text-agri-brown-700 hover:bg-agri-brown-50 transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
              Get started free <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Grower */}
          <div className="bg-white rounded-3xl p-8 border-2 border-[#3D5F42] ring-2 ring-[#3D5F42] ring-offset-2 shadow-sm flex flex-col relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-[#3D5F42] text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow">Most Popular</span>
            </div>
            <div className="flex items-center gap-3 mb-4 mt-2">
              <div className="p-2.5 rounded-xl bg-green-100 text-[#3D5F42]">
                <Sprout className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-agri-brown-900">Grower</h3>
                <p className="text-xs text-agri-brown-500">For growing farms that want full control</p>
              </div>
            </div>
            <div className="mb-6">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-agri-brown-900">{displayPrice('grower', cycle)}</span>
                <span className="text-agri-brown-500 text-sm">{cycleLabel('grower', cycle)}</span>
                {growerSave && (
                  <span className="ml-1 bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    Save {growerSave}%
                  </span>
                )}
              </div>
              <p className="text-agri-brown-400 text-xs mt-1">{perMonthEquiv('grower', cycle)}</p>
            </div>
            <ul className="space-y-2.5 flex-1 mb-6">
              {['Up to 5 active flocks', 'Full analytics & KPIs', 'Automated daily email report', 'Eden AI advisor (30 questions/month)', 'Smart document import', '2 team members', 'Sell signals & insights', 'Export reports (CSV/PDF)'].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-agri-brown-700">
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={() => setCheckoutPlan('grower')}
              className="w-full py-3 rounded-2xl font-semibold text-sm bg-[#3D5F42] text-white hover:bg-[#2F4A34] transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
              Subscribe <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Farm Boss */}
          <div className="bg-white rounded-3xl p-8 border-2 border-amber-300 shadow-sm flex flex-col relative">
            <div className="flex items-center gap-3 mb-4 mt-2">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-agri-brown-900">Farm Boss</h3>
                <p className="text-xs text-agri-brown-500">For large commercial operations</p>
              </div>
            </div>
            <div className="mb-6">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-agri-brown-900">{displayPrice('farmboss', cycle)}</span>
                <span className="text-agri-brown-500 text-sm">{cycleLabel('farmboss', cycle)}</span>
                {farmbossSave && (
                  <span className="ml-1 bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    Save {farmbossSave}%
                  </span>
                )}
              </div>
              <p className="text-agri-brown-400 text-xs mt-1">{perMonthEquiv('farmboss', cycle)}</p>
            </div>
            <ul className="space-y-2.5 flex-1 mb-6">
              {['Unlimited flocks', 'Unlimited team members', 'Everything in Grower', 'Eden AI advisor (unlimited)', 'Benchmarking vs other farms', 'Loan-readiness PDF report', 'Priority support'].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-agri-brown-700">
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={() => setCheckoutPlan('farmboss')}
              className="w-full py-3 rounded-2xl font-semibold text-sm bg-amber-500 text-white hover:bg-amber-600 transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
              Subscribe <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Footer note */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-agri-brown-500 text-sm">
            All paid plans start with a <strong className="text-agri-brown-700">14-day free trial</strong> at full access.
            No credit card needed. Payments via card, mobile money, or bank transfer.
          </p>
        </div>

        {/* Bottom CTA */}
        <div className="bg-gradient-to-r from-agri-brown-600 to-agri-brown-700 rounded-3xl p-12 text-center text-white shadow-2xl">
          <h3 className="text-3xl md:text-4xl font-bold mb-4">Ready to Transform Your Farm?</h3>
          <p className="text-xl mb-8 opacity-90">Join farmers across Africa already using Edentrack</p>
          <div className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
            <button onClick={goSignup}
              className="flex-1 bg-gradient-to-r from-neon-400 to-neon-500 text-agri-brown-900 px-8 py-4 rounded-full font-semibold hover:shadow-2xl transition-all hover:scale-105">
              Start Free Trial
            </button>
            <button onClick={() => { window.location.hash = ''; window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="flex-1 bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/20 transition-all hover:scale-105">
              Schedule Demo
            </button>
          </div>
        </div>
      </div>
    </section>
    </>
  );
}
