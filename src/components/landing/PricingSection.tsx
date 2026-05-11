import { Fragment, useState } from 'react';
import { Check, ArrowRight, Leaf, Sprout, Crown, Building2, ChevronDown, ChevronUp } from 'lucide-react';
import { CheckoutModal } from './CheckoutModal';
import { getEffectivePrice, formatPrice } from '../../utils/regionalPayment';

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

// Map landing-page plan IDs to the canonical plan keys used in
// FIXED_PRICES (regionalPayment.ts is the single source of truth).
// Don't hardcode prices here — that's how landing/checkout/billing
// drift apart and the user sees three different numbers for the
// same plan.
const PLAN_KEY: Record<PaidPlan, 'pro' | 'enterprise' | 'industry'> = {
  grower: 'pro',
  farmboss: 'enterprise',
  industry: 'industry',
};

function priceFor(plan: PaidPlan, cycle: Cycle, currency = 'USD'): number {
  // getEffectivePrice already applies admin-set discount + per-cell
  // overrides on top of FIXED_PRICES.
  return getEffectivePrice(PLAN_KEY[plan], cycle, currency);
}

function savings(plan: PaidPlan, cycle: Cycle): number | null {
  if (cycle === 'monthly') return null;
  const monthly = priceFor(plan, 'monthly');
  const actual = priceFor(plan, cycle);
  if (!monthly || !actual) return null;
  const months = cycle === 'quarterly' ? 3 : 12;
  return Math.round((1 - actual / (monthly * months)) * 100);
}

function cycleLabel(cycle: Cycle): string {
  if (cycle === 'monthly') return '/month';
  if (cycle === 'quarterly') return '/ 3 months';
  return '/year';
}

function displayPrice(plan: PaidPlan, cycle: Cycle): string {
  return formatPrice(priceFor(plan, cycle), 'USD');
}

function perMonthEquiv(plan: PaidPlan, cycle: Cycle): string {
  const p = priceFor(plan, cycle);
  if (cycle === 'monthly') return `${formatPrice(p, 'USD')}/mo`;
  const months = cycle === 'quarterly' ? 3 : 12;
  return `≈ ${formatPrice(Math.round(p / months), 'USD')}/mo`;
}

export default function PricingSection({ onGetStarted }: PricingSectionProps) {
  const [cycle, setCycle] = useState<Cycle>('yearly');
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlan | null>(null);
  const [showCompare, setShowCompare] = useState(false);

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
            Pricing that fits your farm
          </h2>
          <p className="text-gray-400 text-xl max-w-2xl mx-auto">
            Start free. Pay only when Eden is doing real work for you.
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
                <p className="text-xs text-gray-500">Just getting started.</p>
              </div>
            </div>
            <div className="mb-5">
              <span className="text-4xl font-extrabold text-white">Free</span>
              <p className="text-gray-500 text-xs mt-1">forever</p>
            </div>
            <ul className="space-y-2 flex-1 mb-5">
              {[
                '1 farm · 2 active flocks · 1 user',
                'Mortality, weight & expense tracking',
                'Daily task reminders',
                'WhatsApp daily summary',
                'Eden AI · 15 messages/week',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-xs text-gray-300">
                  <Check className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
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
                <p className="text-xs text-gray-700">Running a real farm. 50 to 500 animals.</p>
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
              <p className="text-gray-800 text-xs mt-2 font-medium italic">Less than one bag of layer feed.</p>
            </div>
            <ul className="space-y-2 flex-1 mb-5">
              {[
                '2 farms · 4 flocks each · 4 users',
                'Eden AI · 100 messages/week',
                'Voice messages to Eden',
                'Photo disease diagnosis · 3/month',
                'WhatsApp receipts to customers',
                'Smart CSV import + PDF/CSV export',
                'Payroll for farm workers',
                'Custom onboarding',
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
                <p className="text-xs text-gray-500">Commercial farm with workers.</p>
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
            <p className="text-xs font-semibold text-gray-400 mb-2">Everything in Grower, plus:</p>
            <ul className="space-y-2 flex-1 mb-5">
              {[
                '4 farms · 10 flocks each · unlimited users',
                'Eden AI · 500 messages/week',
                'Photo disease diagnosis · 10/month',
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
                <p className="text-xs text-gray-500">Multiple farms or a cooperative.</p>
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
            <p className="text-xs font-semibold text-gray-400 mb-2">Everything in Farm Boss, plus:</p>
            <ul className="space-y-2 flex-1 mb-5">
              {[
                '10 farms · 20 flocks each',
                'Eden AI · unlimited',
                'Photo disease diagnosis · unlimited',
                'Cooperative dashboard (coming soon)',
                'Direct founder support',
                'Custom training',
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

        {/* Compare all features — expandable matrix */}
        <div className="mt-12 max-w-5xl mx-auto">
          <button
            onClick={() => setShowCompare(!showCompare)}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors py-3 border-t border-b border-white/10"
          >
            {showCompare ? 'Hide full feature comparison' : 'Compare all features'}
            {showCompare ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showCompare && <CompareMatrix />}
        </div>

        {/* Platform + global footer */}
        <p className="text-center text-sm text-gray-400 mt-10">
          Works on web, iPhone, and Android · Poultry, fish, rabbits in one app · English + French
        </p>
        <p className="text-center text-xs text-gray-600 mt-3">
          Payments via Stripe, Paystack, Campay, and Flutterwave. Card, mobile money, and bank transfer accepted. Cancel anytime.
        </p>
      </div>
    </section>
    </>
  );
}

const COMPARE_ROWS: { section: string; rows: { label: string; values: [string, string, string, string] }[] }[] = [
  {
    section: 'Limits',
    rows: [
      { label: 'Farm accounts', values: ['1', '2', '4', '10'] },
      { label: 'Active flocks per farm', values: ['2', '4', '10', '20'] },
      { label: 'Team members', values: ['1', '4', 'Unlimited', 'Unlimited'] },
      { label: 'Eden AI messages', values: ['15/wk', '100/wk', '500/wk', 'Unlimited'] },
    ],
  },
  {
    section: 'Included features',
    rows: [
      { label: 'WhatsApp daily summary', values: ['✓', '✓', '✓', '✓'] },
      { label: 'WhatsApp receipts to customers', values: ['', '✓', '✓', '✓'] },
      { label: 'Voice messages to Eden', values: ['', '✓', '✓', '✓'] },
      { label: 'Reports (PDF/CSV export)', values: ['', '✓', '✓', '✓'] },
      { label: 'Smart CSV import', values: ['', '✓', '✓', '✓'] },
      { label: 'Payroll for workers', values: ['', '✓', '✓', '✓'] },
      { label: 'Custom onboarding', values: ['', '✓', '✓', '✓'] },
    ],
  },
  {
    section: 'Advanced',
    rows: [
      { label: 'Photo disease diagnosis', values: ['', '3/mo', '10/mo', 'Unlimited'] },
      { label: 'Priority support', values: ['', '', '✓', '✓'] },
    ],
  },
  {
    section: 'Industry only',
    rows: [
      { label: 'Cooperative dashboard', values: ['', '', '', 'Coming soon'] },
      { label: 'Direct founder support', values: ['', '', '', '✓'] },
    ],
  },
];

function CompareMatrix() {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider py-3 px-4">Feature</th>
            <th className="text-center text-xs font-semibold text-gray-300 py-3 px-4">Free</th>
            <th className="text-center text-xs font-semibold text-yellow-400 py-3 px-4">Grower</th>
            <th className="text-center text-xs font-semibold text-amber-400 py-3 px-4">Farm Boss</th>
            <th className="text-center text-xs font-semibold text-blue-400 py-3 px-4">Industry</th>
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map(group => (
            <Fragment key={group.section}>
              <tr className="bg-white/5">
                <td colSpan={5} className="py-2 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {group.section}
                </td>
              </tr>
              {group.rows.map(row => (
                <tr key={row.label} className="border-b border-white/5">
                  <td className="py-2.5 px-4 text-xs text-gray-300">{row.label}</td>
                  {row.values.map((v, i) => (
                    <td key={i} className="py-2.5 px-4 text-center text-xs text-gray-200">{v}</td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
