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
    {checkoutPlan && <CheckoutModal plan={checkoutPlan} billingPeriod={cycle} onClose={() => setCheckoutPlan(null)} />}
    <section id="pricing" className="py-20 lg:py-32" style={{ background: '#0a0a0a' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Heading */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 border border-white/10 text-gray-400 text-xs font-bold px-4 py-1.5 rounded-full mb-5 uppercase tracking-wider">
            Pricing
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
            Simple, honest pricing
          </h2>
          <p className="text-gray-400 text-xl max-w-2xl mx-auto">
            Start free. Upgrade when your farm is ready for full analytics, AI, and team tools.
          </p>
        </div>

        {/* Billing cycle toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex bg-white/5 border border-white/10 rounded-2xl p-1 gap-1">
            {(['monthly', 'quarterly', 'yearly'] as Cycle[]).map(c => {
              const save = c !== 'monthly' ? savings('grower', c) : null;
              return (
                <button
                  key={c}
                  onClick={() => setCycle(c)}
                  className={`relative px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                    cycle === c
                      ? 'bg-white text-gray-900 shadow'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {CYCLE_LABELS[c]}
                  {save && cycle !== c && (
                    <span className="ml-1.5 text-[10px] font-bold text-yellow-400">Save {save}%</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Plans grid — 1 col mobile, 2 col tablet, 4 col desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">

          {/* Starter — free */}
          <div className="rounded-2xl p-7 flex flex-col" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 text-gray-300">
                <Leaf className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Starter</h3>
                <p className="text-xs text-gray-500">Just getting started</p>
              </div>
            </div>
            <div className="mb-5">
              <span className="text-4xl font-extrabold text-white">Free</span>
              <p className="text-gray-500 text-xs mt-1">forever</p>
            </div>
            <ul className="space-y-2 flex-1 mb-5">
              {[
                '2 active flocks',
                'Mortality & weight tracking',
                'Expense recording',
                'Task management',
                'WhatsApp daily share',
                'Eden AI — 10 questions/day',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-xs text-gray-300">
                  <Check className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
              {['Full analytics & KPIs', 'Email reports', 'Financial AI logging', 'Team members'].map(f => (
                <li key={f} className="flex items-start gap-2 text-xs text-gray-600 line-through">
                  <span className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-center">–</span>
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={goSignup}
              className="w-full py-2.5 rounded-2xl font-semibold text-sm border border-white/20 text-white hover:bg-white/10 transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
              Get started free <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Grower — most popular */}
          <div className="rounded-2xl p-7 flex flex-col relative" style={{ background: '#ffdd00' }}>
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-black/20 text-gray-900 text-xs font-bold px-4 py-1.5 rounded-full">Most Popular</span>
            </div>
            <div className="flex items-center gap-3 mb-4 mt-1">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-black/15 text-gray-900">
                <Sprout className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Grower</h3>
                <p className="text-xs text-gray-700">Growing farms, full control</p>
              </div>
            </div>
            <div className="mb-5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-4xl font-extrabold text-gray-900">{displayPrice('grower', cycle)}</span>
                <span className="text-gray-700 text-sm">{cycleLabel(cycle)}</span>
                {savings('grower', cycle) && (
                  <span className="bg-black/20 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full">
                    Save {savings('grower', cycle)}%
                  </span>
                )}
              </div>
              <p className="text-gray-700 text-xs mt-1">{perMonthEquiv('grower', cycle)}</p>
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
                <li key={f} className="flex items-start gap-2 text-xs text-gray-800">
                  <Check className="w-3.5 h-3.5 text-gray-700 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={() => setCheckoutPlan('grower')}
              className="w-full py-2.5 rounded-2xl font-bold text-sm bg-gray-900 text-white hover:bg-gray-800 transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
              Subscribe <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Farm Boss */}
          <div className="rounded-2xl p-7 flex flex-col" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 text-amber-400">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Farm Boss</h3>
                <p className="text-xs text-gray-500">Large commercial operations</p>
              </div>
            </div>
            <div className="mb-5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-4xl font-extrabold text-white">{displayPrice('farmboss', cycle)}</span>
                <span className="text-gray-500 text-sm">{cycleLabel(cycle)}</span>
                {savings('farmboss', cycle) && (
                  <span className="bg-yellow-400/20 text-yellow-300 text-xs font-bold px-2 py-0.5 rounded-full">
                    Save {savings('farmboss', cycle)}%
                  </span>
                )}
              </div>
              <p className="text-gray-500 text-xs mt-1">{perMonthEquiv('farmboss', cycle)}</p>
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
                <li key={f} className="flex items-start gap-2 text-xs text-gray-300">
                  <Check className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={() => setCheckoutPlan('farmboss')}
              className="w-full py-2.5 rounded-2xl font-bold text-sm bg-amber-500 text-white hover:bg-amber-600 transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
              Subscribe <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Industry */}
          <div className="rounded-2xl p-7 flex flex-col" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 text-blue-400">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Industry</h3>
                <p className="text-xs text-gray-500">Multi-farm & integrators</p>
              </div>
            </div>
            <div className="mb-5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-4xl font-extrabold text-white">{displayPrice('industry', cycle)}</span>
                <span className="text-gray-500 text-sm">{cycleLabel(cycle)}</span>
                {savings('industry', cycle) && (
                  <span className="bg-yellow-400/20 text-yellow-300 text-xs font-bold px-2 py-0.5 rounded-full">
                    Save {savings('industry', cycle)}%
                  </span>
                )}
              </div>
              <p className="text-gray-500 text-xs mt-1">{perMonthEquiv('industry', cycle)}</p>
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
                <li key={f} className="flex items-start gap-2 text-xs text-gray-300">
                  <Check className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={() => setCheckoutPlan('industry')}
              className="w-full py-2.5 rounded-2xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
              Subscribe <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-600 mt-8">
          Payments via Flutterwave and Stripe. Card, mobile money and bank transfer accepted. Cancel anytime.
        </p>
      </div>
    </section>
    </>
  );
}
