import { Check, ArrowRight, Leaf, Sprout, Crown } from 'lucide-react';

interface PricingSectionProps {
  onGetStarted: () => void;
}

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    icon: <Leaf className="w-6 h-6" />,
    iconBg: 'bg-gray-100 text-gray-600',
    price: 0,
    priceLabel: 'Free',
    priceSub: 'forever',
    badge: null,
    cardClass: 'border-agri-brown-200',
    ctaClass: 'border-2 border-agri-brown-300 text-agri-brown-700 hover:bg-agri-brown-50',
    ctaLabel: 'Get started free',
    description: 'For farmers just getting started',
    features: [
      '1 active flock',
      'Mortality & weight tracking',
      'Expense recording',
      'Task management',
      'WhatsApp daily share',
    ],
    missing: ['Analytics & KPIs', 'Email reports', 'AI assistant', 'Team members'],
  },
  {
    id: 'grower',
    name: 'Grower',
    icon: <Sprout className="w-6 h-6" />,
    iconBg: 'bg-green-100 text-[#3D5F42]',
    price: 9,
    priceLabel: '$9',
    priceSub: 'every 3 months',
    badge: 'Most Popular',
    cardClass: 'border-[#3D5F42] ring-2 ring-[#3D5F42] ring-offset-2',
    ctaClass: 'bg-[#3D5F42] text-white hover:bg-[#2F4A34]',
    ctaLabel: 'Start 14-day free trial',
    description: 'For growing farms that want full control',
    features: [
      'Up to 5 active flocks',
      'Full analytics & KPIs',
      'Automated daily email report',
      'AI assistant (30 questions/month)',
      'Smart document import',
      '2 team members',
      'Sell signals & insights',
      'Export reports (CSV/PDF)',
    ],
    missing: [],
  },
  {
    id: 'farmboss',
    name: 'Farm Boss',
    icon: <Crown className="w-6 h-6" />,
    iconBg: 'bg-amber-100 text-amber-700',
    price: 21,
    priceLabel: '$21',
    priceSub: 'every 3 months',
    badge: null,
    cardClass: 'border-amber-300',
    ctaClass: 'bg-amber-500 text-white hover:bg-amber-600',
    ctaLabel: 'Start 14-day free trial',
    description: 'For large commercial operations',
    features: [
      'Unlimited flocks',
      'Unlimited team members',
      'Everything in Grower',
      'AI assistant (unlimited)',
      'Benchmarking vs other farms',
      'Loan-readiness PDF report',
      'Priority support',
    ],
    missing: [],
  },
];

export default function PricingSection({ onGetStarted }: PricingSectionProps) {
  const handleCta = (planId: string) => {
    onGetStarted();
    window.location.href = (window.location.pathname || '/') + '#/signup';
  };

  return (
    <section id="pricing" className="py-20 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Heading */}
        <div className="text-center mb-6">
          <h2 className="text-4xl md:text-5xl font-bold text-agri-brown-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-agri-brown-600 max-w-2xl mx-auto">
            Pay every 3 months — designed around the poultry cycle so you pay when you earn.
          </p>
        </div>

        {/* Per-month callout */}
        <div className="text-center mb-14">
          <span className="inline-block bg-agri-brown-50 border border-agri-brown-200 text-agri-brown-700 text-sm font-medium px-4 py-2 rounded-full">
            As low as $3/month • 14-day free trial • No credit card required
          </span>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-3xl p-8 border-2 shadow-sm flex flex-col relative ${plan.cardClass}`}
            >
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-[#3D5F42] text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow">
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className="flex items-center gap-3 mb-4 mt-2">
                <div className={`p-2.5 rounded-xl ${plan.iconBg}`}>
                  {plan.icon}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-agri-brown-900">{plan.name}</h3>
                  <p className="text-xs text-agri-brown-500">{plan.description}</p>
                </div>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-agri-brown-900">{plan.priceLabel}</span>
                  {plan.price > 0 && (
                    <span className="text-agri-brown-500 text-sm ml-1">/ {plan.priceSub}</span>
                  )}
                </div>
                {plan.price === 0 && (
                  <span className="text-agri-brown-500 text-sm">{plan.priceSub}</span>
                )}
                {plan.price > 0 && (
                  <p className="text-agri-brown-400 text-xs mt-1">
                    ≈ ${Math.round(plan.price / 3)}/month equivalent
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-agri-brown-700">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
                {plan.missing.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-agri-brown-300 line-through">
                    <span className="w-4 h-4 flex-shrink-0 mt-0.5 text-center">–</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                type="button"
                onClick={() => handleCta(plan.id)}
                className={`w-full py-3 rounded-2xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2 ${plan.ctaClass}`}
              >
                {plan.ctaLabel}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Comparison note */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-agri-brown-500 text-sm">
            All paid plans start with a <strong className="text-agri-brown-700">14-day free trial</strong> at full access.
            No credit card needed to start. Payments via card, mobile money, or bank transfer.
          </p>
        </div>

        {/* Bottom CTA banner */}
        <div className="bg-gradient-to-r from-agri-brown-600 to-agri-brown-700 rounded-3xl p-12 text-center text-white shadow-2xl">
          <h3 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Transform Your Farm?
          </h3>
          <p className="text-xl mb-8 opacity-90">
            Join farmers across Africa already using Edentrack
          </p>
          <div className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
            <button
              type="button"
              onClick={() => {
                onGetStarted();
                window.location.href = (window.location.pathname || '/') + '#/signup';
              }}
              className="flex-1 bg-gradient-to-r from-neon-400 to-neon-500 text-agri-brown-900 px-8 py-4 rounded-full font-semibold hover:shadow-2xl hover:shadow-neon-500/50 transition-all duration-300 hover:scale-105"
            >
              Start Free Trial
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.hash = '';
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(() => {
                  const btn = document.querySelector('[data-demo-trigger]');
                  if (btn) (btn as HTMLButtonElement).click();
                }, 100);
              }}
              className="flex-1 bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/20 transition-all duration-300 hover:scale-105"
            >
              Schedule Demo
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
