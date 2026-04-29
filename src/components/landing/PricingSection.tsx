import { useState } from 'react';
import { Check, ArrowRight, Leaf, Sprout, Crown, Building2 } from 'lucide-react';
import { CheckoutModal } from './CheckoutModal';

interface PricingSectionProps {
  onGetStarted: () => void;
}

type Cycle = 'monthly' | 'quarterly' | 'yearly';
type PaidPlan = 'grower' | 'farmboss' | 'industry';

const CYCLE_LABELS: Record<Cycle, string> = {
  monthly: 'Monthly',
  quarterly: '3 Months',
  yearly: 'Yearly',
};

interface PlanPricing {
  monthly: number;
  quarterly: number;
  yearly: number;
}

const PRICING: Record<PaidPlan, PlanPricing> = {
  grower:   { monthly: 12,  quarterly: 30,  yearly: 108 },
  farmboss: { monthly: 35,  quarterly: 87,  yearly: 300 },
  industry: { monthly: 89,  quarterly: 222, yearly: 800 },
};

function savings(plan: PaidPlan, cycle: Cycle): number | null {
  if (cycle === 'monthly') return null;
  const { monthly, quarterly, yearly } = PRICING[plan];
  if (cycle === 'quarterly') return Math.round((1 - quarterly / (monthly * 3)) * 100);
  return Math.round((1 - yearly / (monthly * 12)) * 100);
}

function cycleLabel(cycle: Cycle): string {
  if (cycle === 'monthly') return '/month';
  if (cycle === 'quarterly') return '/ 3 months';
  return '/year';
}

function displayPrice(plan: PaidPlan, cycle: Cycle): string {
  const p = PRICING[plan];
  if (cycle === 'monthly') return `$${p.monthly}`;
  if (cycle === 'quarterly') return `$${p.quarterly}`;
  return `$${p.yearly}`;
}

function perMonthEquiv(plan: PaidPlan, cycle: Cycle): string {
  const p = PRICING[plan];
  if (cycle === 'monthly') return `$${p.monthly}/mo`;
  if (cycle === 'quarterly') return `≈ $${Math.round(p.quarterly / 3)}/mo`;
  return `≈ $${Math.round(p.yearly / 12)}/mo`;
}

export default function PricingSection({ onGetStarted }: PricingSectionProps) {
  const [cycle, setCycle] = useState<Cycle>('quarterly');
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlan | null>(null);

  const goSignup = () => {
    onGetStarted();
    window.location.href = (window.location.pathname || '/') + '#/signup';
  };

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
            Start free. Upgrade when your farm is ready for full analytics, AI, and team tools.
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

        {/* Plans grid — 1 col mobile, 2 col tablet, 4 col desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-16">

          {/* Starter — free */}
          <div className="bg-white rounded-3xl p-7 border-2 border-agri-brown-200 shadow-sm flex flex-col">
            <div className="flex items-center gap-3 mb-4 mt-1">
              <div className="p-2.5 rounded-xl bg-gray-100 text-gray-600">
                <Leaf className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-agri-brown-900">Starter</h3>
                <p className="text-xs text-agri-brown-500">Just getting started</p>
              </div>
            </div>
            <div className="mb-5">
              <span className="text-4xl font-bold text-agri-brown-900">Free</span>
              <p className="text-agri-brown-400 text-xs mt-1">forever</p>
            </div>
            <ul className="space-y-2 flex-1 mb-5">
              {[
                '1 active flock',
                'Mortality & weight tracking',
                'Expense recording',
                'Task management',
                'WhatsApp daily share',
                'Eden AI — 10 questions/day (farm questions only)',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-xs text-agri-brown-700">
                  <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
              {['Full analytics & KPIs', 'Email reports', 'Financial AI logging', 'Team members'].map(f => (
                <li key={f} className="flex items-start gap-2 text-xs text-agri-brown-300 line-through">
                  <span className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-center">–</span>
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={goSignup}
              className="w-full py-2.5 rounded-2xl font-semibold text-sm border-2 border-agri-brown-300 text-agri-brown-700 hover:bg-agri-brown-50 transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
              Get started free <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Grower — most popular */}
          <div className="bg-white rounded-3xl p-7 border-2 border-[#3D5F42] ring-2 ring-[#3D5F42] ring-offset-2 shadow-md flex flex-col relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-[#3D5F42] text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow">Most Popular</span>
            </div>
            <div className="flex items-center gap-3 mb-4 mt-1">
              <div className="p-2.5 rounded-xl bg-green-100 text-[#3D5F42]">
                <Sprout className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-agri-brown-900">Grower</h3>
                <p className="text-xs text-agri-brown-500">Growing farms, full control</p>
              </div>
            </div>
            <div className="mb-5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-4xl font-bold text-agri-brown-900">{displayPrice('grower', cycle)}</span>
                <span className="text-agri-brown-500 text-sm">{cycleLabel(cycle)}</span>
                {savings('grower', cycle) && (
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    Save {savings('grower', cycle)}%
                  </span>
                )}
              </div>
              <p className="text-agri-brown-400 text-xs mt-1">{perMonthEquiv('grower', cycle)}</p>
            </div>
            <ul className="space-y-2 flex-1 mb-5">
              {[
                'Up to 5 active flocks',
                'Full analytics & KPIs',
                'Automated daily email report',
                'Eden AI — 200 messages/month',
                'Financial logging via Eden AI',
                'Smart document import (CSV)',
                '2 team members',
                'Export reports (CSV/PDF)',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-xs text-agri-brown-700">
                  <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={() => setCheckoutPlan('grower')}
              className="w-full py-2.5 rounded-2xl font-semibold text-sm bg-[#3D5F42] text-white hover:bg-[#2F4A34] transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
              Subscribe <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Farm Boss */}
          <div className="bg-white rounded-3xl p-7 border-2 border-amber-300 shadow-sm flex flex-col relative">
            <div className="flex items-center gap-3 mb-4 mt-1">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-agri-brown-900">Farm Boss</h3>
                <p className="text-xs text-agri-brown-500">Large commercial operations</p>
              </div>
            </div>
            <div className="mb-5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-4xl font-bold text-agri-brown-900">{displayPrice('farmboss', cycle)}</span>
                <span className="text-agri-brown-500 text-sm">{cycleLabel(cycle)}</span>
                {savings('farmboss', cycle) && (
                  <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    Save {savings('farmboss', cycle)}%
                  </span>
                )}
              </div>
              <p className="text-agri-brown-400 text-xs mt-1">{perMonthEquiv('farmboss', cycle)}</p>
            </div>
            <ul className="space-y-2 flex-1 mb-5">
              {[
                'Unlimited flocks',
                'Unlimited team members',
                'Everything in Grower',
                'Eden AI — 1,000 messages/month',
                'Photo disease diagnosis (10/mo)',
                'Payroll management',
                'Priority support',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-xs text-agri-brown-700">
                  <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={() => setCheckoutPlan('farmboss')}
              className="w-full py-2.5 rounded-2xl font-semibold text-sm bg-amber-500 text-white hover:bg-amber-600 transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
              Subscribe <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Industry */}
          <div className="bg-gradient-to-br from-agri-brown-900 to-agri-brown-800 rounded-3xl p-7 border-2 border-agri-brown-700 shadow-sm flex flex-col relative">
            <div className="flex items-center gap-3 mb-4 mt-1">
              <div className="p-2.5 rounded-xl bg-white/10 text-white">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Industry</h3>
                <p className="text-xs text-agri-brown-300">Multi-farm & integrators</p>
              </div>
            </div>
            <div className="mb-5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-4xl font-bold text-white">{displayPrice('industry', cycle)}</span>
                <span className="text-agri-brown-300 text-sm">{cycleLabel(cycle)}</span>
                {savings('industry', cycle) && (
                  <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    Save {savings('industry', cycle)}%
                  </span>
                )}
              </div>
              <p className="text-agri-brown-400 text-xs mt-1">{perMonthEquiv('industry', cycle)}</p>
            </div>
            <ul className="space-y-2 flex-1 mb-5">
              {[
                'Everything in Farm Boss',
                'Multiple farm accounts',
                'Eden AI — unlimited messages',
                'Unlimited photo diagnosis',
                'Dedicated account manager',
                'Custom onboarding & training',
                'API access (coming soon)',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-xs text-agri-brown-100">
                  <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={() => setCheckoutPlan('industry')}
              className="w-full py-2.5 rounded-2xl font-semibold text-sm bg-white text-agri-brown-900 hover:bg-agri-brown-50 transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
              Subscribe <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Footer note — no trial period */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-agri-brown-500 text-sm">
            Payments via card, mobile money, or bank transfer. Cancel anytime.
          </p>
        </div>

        {/* Bottom CTA */}
        <div className="bg-gradient-to-r from-agri-brown-600 to-agri-brown-700 rounded-3xl p-12 text-center text-white shadow-2xl">
          <h3 className="text-3xl md:text-4xl font-bold mb-4">Ready to Transform Your Farm?</h3>
          <p className="text-xl mb-8 opacity-90">Join farmers across Africa already using Edentrack</p>
          <div className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
            <button onClick={goSignup}
              className="flex-1 bg-gradient-to-r from-neon-400 to-neon-500 text-agri-brown-900 px-8 py-4 rounded-full font-semibold hover:shadow-2xl transition-all hover:scale-105">
              Start for Free
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
