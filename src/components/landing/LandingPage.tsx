import React, { useState, useEffect } from 'react';
import {
  Menu, X, LayoutDashboard, TrendingUp, Brain, FileUp, CheckCircle,
  BarChart3, Users, Package, Calendar, Scale, Syringe, DollarSign,
  ShoppingCart, Zap, Sprout, Crown, Check, ChevronDown, ChevronUp,
  ArrowRight, Leaf, Building2, Shield, Stethoscope, Wifi, MessageCircle,
  ClipboardList, Egg,
} from 'lucide-react';
import { FIXED_PRICES, detectRegion, type RegionConfig } from '../../utils/regionalPayment';
import { supabase } from '../../lib/supabaseClient';

const Y = '#ffdd00';
const YD = '#e6c700';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    icon: <Leaf className="w-5 h-5" />,
    iconBg: 'bg-gray-100 text-gray-600',
    price: 0,
    priceSub: 'forever',
    badge: null,
    highlighted: false,
    ctaLabel: 'Get started free',
    features: [
      '1 active flock',
      'Daily task management',
      'Mortality and weight tracking',
      'Expense recording',
      'Basic inventory management',
      'WhatsApp report sharing',
    ],
    notIncluded: ['Analytics and KPIs', 'Weekly email reports', 'Eden AI advisor', 'Smart Import', 'Team members'],
  },
  {
    id: 'grower',
    name: 'Grower',
    icon: <Sprout className="w-5 h-5" />,
    iconBg: 'bg-yellow-100 text-yellow-800',
    price: 15,
    priceSub: 'every 3 months',
    badge: 'Most Popular',
    highlighted: true,
    ctaLabel: 'Start free trial',
    features: [
      'Up to 5 active flocks',
      'Full analytics and KPIs',
      'Automated weekly email reports',
      'Eden AI advisor (50 messages/month)',
      'Eden voice and photo logging',
      'Smart receipt and document import',
      'Vaccination scheduling and vet log',
      'Sales tracking and invoices',
      '2 team members with role permissions',
    ],
    notIncluded: [],
  },
  {
    id: 'farmboss',
    name: 'Farm Boss',
    icon: <Crown className="w-5 h-5" />,
    iconBg: 'bg-amber-100 text-amber-700',
    price: 33,
    priceSub: 'every 3 months',
    badge: null,
    highlighted: false,
    ctaLabel: 'Subscribe',
    features: [
      'Unlimited flocks and team members',
      'Eden AI with unlimited messages',
      'Photo disease diagnosis',
      'Payroll and shift management',
      'Benchmarking vs similar farms',
      'Loan-readiness PDF report',
      'Priority WhatsApp support',
      'Early access to new features',
    ],
    notIncluded: [],
  },
  {
    id: 'industry',
    name: 'Industry',
    icon: <Building2 className="w-5 h-5" />,
    iconBg: 'bg-blue-100 text-blue-700',
    price: 99,
    priceSub: 'every 3 months',
    badge: 'Large Operations',
    highlighted: false,
    ctaLabel: 'Contact us',
    features: [
      'Up to 10 farms under one account',
      'Multi-farm analytics dashboard',
      'Eden AI unlimited with best model',
      'Unlimited team with custom roles',
      'Custom-branded PDF reports',
      'Excel and CSV data export',
      'Webhook API integrations',
      'Dedicated WhatsApp support',
      'Onboarding and quarterly review call',
    ],
    notIncluded: [],
  },
];

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: 'Farm Dashboard',
    description: 'Everything you need the moment you open the app. Birds alive, today\'s tasks, egg collections and spending at a glance.',
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-100',
  },
  {
    icon: Brain,
    title: 'Eden AI Advisor',
    description: 'Ask Eden anything about flock health, feed costs or when to sell. It knows your farm data and logs mortality, eggs and expenses on your behalf.',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-100',
  },
  {
    icon: FileUp,
    title: 'Smart Receipt Import',
    description: 'Photograph a paper receipt and Eden reads it, pulling out amounts, categories and descriptions automatically. No typing required.',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-100',
  },
  {
    icon: Shield,
    title: 'Role-Based Access Control',
    description: 'Four roles with individual permission toggles. Decide exactly what each person on your farm can see, log or delete.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
  },
  {
    icon: TrendingUp,
    title: 'Analytics and KPIs',
    description: 'FCR, survival rate, profit per flock, laying rate and cost-per-bird in one view. Week-by-week breakdowns you can share straight to WhatsApp.',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-100',
  },
  {
    icon: Egg,
    title: 'Egg Collection and Sales',
    description: 'Track every size, grade and damaged egg. Manage your egg stock and record sales with automatic inventory updates.',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
  {
    icon: Scale,
    title: 'Weight and Growth Tracking',
    description: 'Record batch weights and compare against breed standards. Eden tells you whether to sell now or wait for better returns.',
    color: 'text-yellow-700',
    bg: 'bg-yellow-50',
    border: 'border-yellow-100',
  },
  {
    icon: Syringe,
    title: 'Vaccinations and Vet Log',
    description: 'Schedule vaccinations, get reminders and keep a full vet log with diagnosis, medication and dosage records all in one place.',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-100',
  },
  {
    icon: Package,
    title: 'Inventory Management',
    description: 'Know exactly what you have before you run out. Track feed, medication and supplies with one-tap daily usage logging and low-stock alerts.',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
  {
    icon: DollarSign,
    title: 'Expense and Sales Tracking',
    description: 'Every cost and sale in one place. View profit per flock, per week or across the whole farm and export to PDF for your bank or accountant.',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
  },
  {
    icon: Wifi,
    title: 'Works Offline',
    description: 'No signal? Everything still works. Data queues on your device and syncs silently the moment you reconnect.',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-100',
  },
  {
    icon: Users,
    title: 'Team and Payroll',
    description: 'Add managers and workers, assign shifts, track hours and run payroll all from the same app.',
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-100',
  },
  {
    icon: BarChart3,
    title: 'Weekly Email Reports',
    description: 'A full 7-day farm summary lands in your inbox every week on the day you pick. Fully automatic, no setup needed.',
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
    border: 'border-cyan-100',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp Sharing',
    description: 'One tap and your farm report, flock summary or sales receipt is on WhatsApp. Perfect for partners, investors and buyers.',
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-100',
  },
  {
    icon: ClipboardList,
    title: 'Tasks and Forecasting',
    description: 'Set up recurring task templates and use the Forecast page to plan costs before a batch even starts.',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
  },
];

const FAQS = [
  {
    q: 'Does it work without internet?',
    a: 'Yes. Every feature works without a connection. Your data queues on the device and syncs automatically when you\'re back online. Nothing gets lost.',
  },
  {
    q: 'Can Eden AI actually log my data?',
    a: 'Yes. Tell Eden what happened in plain language and it extracts the details and asks you to confirm before saving. It also reads receipt photos so you don\'t have to type anything.',
  },
  {
    q: 'Can I manage broilers and layers on the same farm?',
    a: 'Yes. Edentrack supports both at the same time. The dashboard adapts automatically, showing egg KPIs for layer farms and FCR and weight targets for broiler farms.',
  },
  {
    q: 'How does role access work?',
    a: 'Four roles: Owner, Manager, Worker and Viewer. Each has its own default permissions and you can adjust every individual toggle in Settings to suit your setup.',
  },
  {
    q: 'What is Smart Import?',
    a: 'Take a photo of any receipt or invoice. Eden reads it and imports the amount, category and description straight into your expense log. No manual typing.',
  },
  {
    q: 'What currencies are supported?',
    a: 'All major currencies worldwide including USD, GBP, EUR, NGN, GHS, KES, XAF, ZAR and more. You set your currency when you create your farm.',
  },
  {
    q: 'How does the weekly email report work?',
    a: 'Pick your preferred day in Settings and Edentrack sends a full 7-day summary covering production, expenses, mortality and revenue every week.',
  },
  {
    q: 'Can I control what workers see?',
    a: 'Yes. Workers default to task-only access but you can enable mortality logging, egg collection, weight recording and Eden AI per farm under Settings.',
  },
];

const APP_SLIDES = [
  {
    label: 'Dashboard',
    color: '#d97706',
    preview: (
      <div className="bg-[#f7f5f0] rounded-xl p-4 space-y-3 text-left">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Good morning 👋</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Birds alive', value: '985', sub: '98.5% survival', color: 'text-gray-900' },
            { label: 'Eggs today', value: '412', sub: '83% lay rate', color: 'text-amber-600' },
            { label: 'Feed stock', value: '8 bags', sub: '3 days left', color: 'text-red-500' },
            { label: 'Net profit', value: '+42,500', sub: 'this cycle', color: 'text-gray-900' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
              <p className="text-[10px] text-gray-400 font-medium">{k.label}</p>
              <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
              <p className="text-[10px] text-gray-400">{k.sub}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-700 mb-2">Today's Tasks</p>
          {['Morning feed, Batch A', 'Water check, all pens', 'Vaccination, Newcastle Week 4'].map((t, i) => (
            <div key={t} className="flex items-center gap-2 py-1">
              <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${i === 0 ? 'border-yellow-400' : 'border-gray-300'}`}
                   style={i === 0 ? { background: Y } : {}} />
              <span className={`text-xs ${i === 0 ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    label: 'Egg Collection',
    color: '#d97706',
    preview: (
      <div className="bg-[#f7f5f0] rounded-xl p-4 space-y-3 text-left">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Log Egg Collection</p>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-3 bg-gray-50 text-[10px] font-semibold text-gray-500 px-3 py-1.5">
            <span>Size</span><span className="text-center">Trays</span><span className="text-center">Loose</span>
          </div>
          {[
            { size: 'Small', trays: 2, loose: 12 },
            { size: 'Medium', trays: 5, loose: 8 },
            { size: 'Large', trays: 6, loose: 0 },
            { size: 'Jumbo', trays: 1, loose: 3 },
          ].map(r => (
            <div key={r.size} className="grid grid-cols-3 items-center px-3 py-2 border-t border-gray-100">
              <span className="text-xs font-semibold text-gray-800">{r.size}</span>
              <span className="text-center text-xs text-gray-600 bg-gray-50 rounded-lg py-1 mx-1">{r.trays}</span>
              <span className="text-center text-xs text-gray-600 bg-gray-50 rounded-lg py-1 mx-1">{r.loose}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <span className="text-xs font-semibold text-amber-800">Total good eggs</span>
          <span className="text-sm font-bold text-amber-900">412</span>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 bg-gray-100 rounded-xl py-2 text-center text-xs font-medium text-gray-500">Damaged: 6</div>
          <button className="flex-1 rounded-xl py-2 text-xs font-bold text-gray-900" style={{ background: Y }}>Save Collection</button>
        </div>
      </div>
    ),
  },
  {
    label: 'Analytics',
    color: '#6366f1',
    preview: (
      <div className="bg-[#f7f5f0] rounded-xl p-4 space-y-3 text-left">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Insights, Batch A</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Total Revenue', value: '284,500', color: 'text-gray-900' },
            { label: 'Total Expenses', value: '242,000', color: 'text-red-500' },
            { label: 'Net Profit', value: '+42,500', color: 'text-gray-900' },
            { label: 'Profit Margin', value: '14.9%', color: 'text-indigo-600' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl p-3 border border-gray-100">
              <p className="text-[10px] text-gray-400">{k.label}</p>
              <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <p className="text-xs font-semibold text-gray-700 mb-2">Weekly performance</p>
          <div className="flex items-end gap-1.5 h-12">
            {[40, 65, 55, 80, 72, 90, 85].map((h, i) => (
              <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i === 5 ? Y : '#fef9c3' }} />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {['W1','W2','W3','W4','W5','W6','W7'].map(w => (
              <span key={w} className="text-[9px] text-gray-400 flex-1 text-center">{w}</span>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    label: 'Eden AI',
    color: '#7c3aed',
    preview: (
      <div className="bg-[#f7f5f0] rounded-xl p-4 space-y-2 text-left">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Eden, Farm Advisor</p>
        {[
          { role: 'user', text: '3 birds died this morning in Batch A, cause unknown' },
          { role: 'eden', text: 'Logging 3 deaths in Batch A. Sudden unexplained loss often points to heat stress or water blockage. Check drinkers first. Survival is still at 98.5%. Want me to flag a vet visit?' },
          { role: 'user', text: 'Yes, and what is my FCR this week?' },
          { role: 'eden', text: 'FCR this week: 1.82, excellent for Week 4 and top 20% of farms your size. Vet visit flagged for today.' },
        ].map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-[11px] leading-relaxed ${
              m.role === 'user' ? 'bg-gray-900 text-white rounded-br-sm' : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100 shadow-sm'
            }`}>
              {m.role === 'eden' && <span className="block text-[9px] font-bold text-purple-500 mb-0.5">Eden</span>}
              {m.text}
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

type BillingCycle = 'monthly' | 'quarterly' | 'yearly';

const PLAN_KEY: Record<string, string | null> = {
  starter: null, grower: 'pro', farmboss: 'enterprise', industry: 'industry',
};

function landingPrice(planId: string, cycle: BillingCycle): string {
  const key = PLAN_KEY[planId];
  if (!key) return 'Free';
  const p = FIXED_PRICES.USD[cycle]?.[key];
  return p !== undefined ? `$${p}` : 'Free';
}

function landingSub(cycle: BillingCycle): string {
  if (cycle === 'monthly') return 'per month';
  if (cycle === 'quarterly') return 'per 3 months';
  return 'per year';
}

function perMonthLine(planId: string, cycle: BillingCycle): string | null {
  const key = PLAN_KEY[planId];
  if (!key || cycle === 'monthly') return null;
  const p = FIXED_PRICES.USD[cycle]?.[key];
  if (!p) return null;
  const months = cycle === 'quarterly' ? 3 : 12;
  return `≈ $${(p / months).toFixed(2)}/mo`;
}

function savingsPct(planId: string, cycle: BillingCycle): number | null {
  if (cycle === 'monthly') return null;
  const key = PLAN_KEY[planId];
  if (!key) return null;
  const monthly = FIXED_PRICES.USD.monthly?.[key];
  const actual = FIXED_PRICES.USD[cycle]?.[key];
  if (!monthly || !actual) return null;
  const months = cycle === 'quarterly' ? 3 : 12;
  return Math.round((1 - actual / (monthly * months)) * 100);
}

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('quarterly');
  const [region, setRegion] = useState<RegionConfig | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<{ plan: string; msg: string } | null>(null);
  const [flwEmailFor, setFlwEmailFor] = useState<string | null>(null); // planKey waiting for email
  const [flwEmail, setFlwEmail] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setActiveSlide(s => (s + 1) % APP_SLIDES.length), 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { setRegion(detectRegion()); }, []);

  // Detect return from Stripe or Flutterwave guest checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('guest') !== '1') return;

    const sessionId = params.get('stripe_session');
    const txRef = params.get('tx_ref');
    const transactionId = params.get('transaction_id');
    const status = params.get('status');

    window.history.replaceState({}, '', window.location.pathname);

    if (sessionId) {
      setPaymentSuccess(true);
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', session_id: sessionId }),
      }).catch(() => {});
    } else if (status === 'successful' && txRef && transactionId) {
      setPaymentSuccess(true);
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_flutterwave', transaction_id: transactionId, tx_ref: txRef }),
      }).catch(() => {});
    }
  }, []);

  const isFlutterwave = region?.processor === 'flutterwave';

  const startCheckout = (planKey: string) => {
    setCheckoutError(null);
    if (isFlutterwave) {
      // Flutterwave needs email — show inline email input
      setFlwEmailFor(planKey);
      setFlwEmail('');
      return;
    }
    doStripeCheckout(planKey);
  };

  const doStripeCheckout = async (planKey: string) => {
    setCheckoutLoading(planKey);
    setCheckoutError(null);
    // Kill any lingering session so back-button can't bypass payment
    await supabase.auth.signOut().catch(() => {});
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_session', plan: planKey, billing_period: billingCycle }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      throw new Error(data.error || `Error ${res.status}`);
    } catch (err: any) {
      setCheckoutLoading(null);
      setCheckoutError({ plan: planKey, msg: err.message || 'Could not start checkout. Please try again.' });
    }
  };

  const doFlutterwaveCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flwEmailFor) return;
    const planKey = flwEmailFor;
    setCheckoutLoading(planKey);
    setFlwEmailFor(null);
    setCheckoutError(null);
    await supabase.auth.signOut().catch(() => {});
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_session',
          gateway: 'flutterwave',
          email: flwEmail,
          plan: planKey,
          billing_period: billingCycle,
          currency: region?.currency || 'NGN',
        }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      throw new Error(data.error || `Error ${res.status}`);
    } catch (err: any) {
      setCheckoutLoading(null);
      setCheckoutError({ plan: planKey, msg: err.message || 'Could not start checkout. Please try again.' });
    }
  };

  const handleGetStarted = () => {
    setMobileMenuOpen(false);
    window.location.href = (window.location.pathname || '/') + '#/signup';
  };

  const handleSignIn = () => {
    setMobileMenuOpen(false);
    window.location.href = (window.location.pathname || '/') + '#/login';
  };

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <style>{`
        @keyframes neonFlicker {
          0%, 18%, 22%, 25%, 53%, 57%, 100% {
            color: #ffdd00;
            text-shadow: 0 0 6px rgba(255,221,0,0.9), 0 0 16px rgba(255,221,0,0.7), 0 0 32px rgba(255,221,0,0.5), 0 0 60px rgba(230,199,0,0.3);
          }
          20%, 24%, 55% {
            color: rgba(255,221,0,0.6);
            text-shadow: 0 0 2px rgba(255,221,0,0.2);
          }
        }
        .neon-track {
          color: #ffdd00;
          text-shadow: 0 0 6px rgba(255,221,0,0.9), 0 0 16px rgba(255,221,0,0.7), 0 0 32px rgba(255,221,0,0.5), 0 0 60px rgba(230,199,0,0.3);
          animation: neonFlicker 5s ease-in-out infinite;
        }
        @keyframes neonGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        @keyframes slideProgressBar { from { width: 0% } to { width: 100% } }
        @keyframes tourCardIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
        .neon-glow { animation: neonGlow 2.5s ease-in-out infinite; }
        .hero-fade { animation: fadeUp 0.7s ease forwards; }
        .hero-fade-2 { animation: fadeUp 0.7s ease 0.15s forwards; opacity: 0; }
        .hero-fade-3 { animation: fadeUp 0.7s ease 0.3s forwards; opacity: 0; }
        .hero-fade-4 { animation: fadeUp 0.7s ease 0.45s forwards; opacity: 0; }
        .hero-grid {
          background-image: linear-gradient(rgba(255,221,0,0.06) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,221,0,0.06) 1px, transparent 1px);
          background-size: 48px 48px;
        }
      `}</style>

      {/* NAV */}
      <nav className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-black tracking-tight">
                <span className="text-white">EDEN</span><span className="neon-track">TRACK</span>
              </span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" onClick={e => scrollTo(e, 'features')} className="text-sm text-gray-400 hover:text-white font-medium transition-colors">Features</a>
              <a href="#pricing" onClick={e => scrollTo(e, 'pricing')} className="text-sm text-gray-400 hover:text-white font-medium transition-colors">Pricing</a>
              <a href="#faq" onClick={e => scrollTo(e, 'faq')} className="text-sm text-gray-400 hover:text-white font-medium transition-colors">FAQ</a>
              <button type="button" onClick={handleSignIn} className="text-sm text-gray-400 hover:text-white font-medium transition-colors">Sign In</button>
              <button type="button" onClick={handleGetStarted}
                className="text-gray-900 text-sm px-5 py-2 rounded-full font-bold transition-all hover:scale-105"
                style={{ background: Y, boxShadow: '0 0 12px rgba(255,221,0,0.4)' }}>
                Get Started Free
              </button>
            </div>

            <button type="button" className="md:hidden p-2 text-gray-400" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#0a0a0a] px-4 py-4 space-y-3">
            <a href="#features" onClick={e => scrollTo(e, 'features')} className="block text-sm text-gray-300 font-medium py-1">Features</a>
            <a href="#pricing" onClick={e => scrollTo(e, 'pricing')} className="block text-sm text-gray-300 font-medium py-1">Pricing</a>
            <a href="#faq" onClick={e => scrollTo(e, 'faq')} className="block text-sm text-gray-300 font-medium py-1">FAQ</a>
            <hr className="border-white/10" />
            <button type="button" onClick={handleSignIn} className="block w-full text-left text-sm text-gray-300 font-medium py-1">Sign In</button>
            <button type="button" onClick={handleGetStarted} className="w-full text-gray-900 py-3 rounded-xl font-bold text-sm" style={{ background: Y }}>Get Started Free</button>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative py-24 px-4 sm:px-6 text-center overflow-hidden hero-grid" style={{ background: '#0a0a0a' }}>
        {/* radial yellow glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 70% 55% at 50% 40%, rgba(255,221,0,0.07) 0%, transparent 70%)',
        }} />

        <div className="relative max-w-4xl mx-auto">
          {/* Neon wordmark */}
          <div className="flex justify-center mb-8 hero-fade">
            <div className="relative">
              <div className="absolute inset-0 neon-glow" style={{
                background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,221,0,0.2) 0%, transparent 70%)',
                filter: 'blur(24px)',
              }} />
              <span className="relative text-5xl sm:text-6xl md:text-7xl font-black tracking-tighter leading-none">
                <span className="text-white">EDEN</span><span className="neon-track">TRACK</span>
              </span>
            </div>
          </div>

          {/* Badge */}
          <div className="hero-fade-2 flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 border text-xs font-semibold px-4 py-1.5 rounded-full"
              style={{ background: 'rgba(255,221,0,0.08)', borderColor: 'rgba(255,221,0,0.25)', color: '#ffdd00' }}>
              <Zap className="w-3.5 h-3.5" />
              Eden AI now logs data, reads receipts and diagnoses flock health
            </div>
          </div>

          {/* Headline */}
          <h1 className="hero-fade-3 text-4xl sm:text-5xl md:text-7xl font-extrabold text-white leading-tight mb-6 tracking-tight">
            Run your poultry farm<br />
            <span style={{
              background: 'linear-gradient(135deg, #ffdd00 0%, #f59e0b 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>like a professional</span>
          </h1>

          {/* Sub */}
          <p className="hero-fade-4 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Track flocks, expenses, egg production, sales and team all in one place.<br className="hidden sm:block" />
            Built for broiler and layer farmers everywhere. Works without internet.
          </p>

          {/* CTAs */}
          <div className="hero-fade-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button type="button" onClick={handleGetStarted}
              className="w-full sm:w-auto text-gray-900 px-8 py-4 rounded-full font-bold text-base transition-all hover:scale-105 hover:brightness-110"
              style={{ background: Y, boxShadow: '0 0 24px rgba(255,221,0,0.35), 0 4px 16px rgba(0,0,0,0.3)' }}>
              Start for free, no card needed
            </button>
            <a href="#features" onClick={e => scrollTo(e, 'features')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 text-gray-300 font-medium text-base border border-white/20 px-8 py-4 rounded-full hover:border-white/40 hover:text-white transition-colors">
              See what's included <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <p className="text-xs text-gray-600 mt-5">Free forever on Starter. No credit card required.</p>
        </div>

        {/* Stats */}
        <div className="relative max-w-3xl mx-auto mt-16 grid grid-cols-2 sm:grid-cols-4 gap-px rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {[
            { value: '40+', label: 'Built features' },
            { value: 'EN + FR', label: 'Languages' },
            { value: '40+', label: 'Currencies' },
            { value: '100%', label: 'Offline-capable' },
          ].map(({ value, label }, i) => (
            <div key={label} className="py-6 px-4 text-center" style={{ background: 'rgba(10,10,10,0.8)' }}>
              <div className="text-xl sm:text-2xl font-bold text-white">{value}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* scroll hint */}
        <div className="relative mt-12 flex justify-center">
          <div className="flex flex-col items-center gap-1 opacity-40">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Scroll to explore</span>
            <ChevronDown className="w-4 h-4 text-gray-500 animate-bounce" />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-yellow-50 border border-yellow-100 text-yellow-700 text-xs font-bold px-4 py-1.5 rounded-full mb-5 uppercase tracking-wider">
              Features
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">Everything your farm needs</h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">Every feature below is live in the app today.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, description, color, bg, border }) => (
              <div key={title} className={`rounded-2xl border p-6 hover:shadow-lg transition-all hover:-translate-y-0.5 group cursor-default ${border}`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${bg} group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 px-4 sm:px-6" style={{ background: '#0a0a0a' }}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 border border-white/10 text-gray-400 text-xs font-bold px-4 py-1.5 rounded-full mb-5 uppercase tracking-wider">
            How it works
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-tight">Get started in minutes</h2>
          <p className="text-gray-400 mb-16 text-lg">No training needed. Farm from day one.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Create your farm', body: 'Sign up, name your farm and pick your country and currency. Takes 60 seconds.' },
              { step: '02', title: 'Add your flock', body: 'Enter your bird count and arrival date and Edentrack sets up your tasks, phases and targets automatically.' },
              { step: '03', title: 'Track everything', body: 'Log daily tasks, photograph receipts and ask Eden for advice. Watch your data turn into real farm intelligence.' },
            ].map(({ step, title, body }) => (
              <div key={step} className="rounded-2xl p-7 text-left border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="text-4xl font-black mb-4" style={{ color: Y, opacity: 0.7 }}>{step}</div>
                <h3 className="font-bold text-white mb-2">{title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* APP SCREENSHOTS SLIDER */}
      <section className="py-24 px-4 sm:px-6 bg-white overflow-hidden">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-gray-100 text-gray-600 text-xs font-bold px-4 py-1.5 rounded-full mb-5 uppercase tracking-wider">
              Live preview
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">See the app in action</h2>
            <p className="text-gray-500 text-lg">Real screens from the live app.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-3">
              {APP_SLIDES.map((slide, i) => (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => setActiveSlide(i)}
                  className={`w-full text-left px-5 py-4 rounded-2xl border-2 transition-all duration-300 ${
                    activeSlide === i ? 'bg-gray-50 shadow-md' : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                  style={activeSlide === i ? { borderColor: Y } : {}}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all"
                         style={{ backgroundColor: activeSlide === i ? Y : '#d1d5db' }} />
                    <span className={`font-semibold text-sm ${activeSlide === i ? 'text-gray-900' : 'text-gray-500'}`}>
                      {slide.label}
                    </span>
                    {activeSlide === i && (
                      <div className="ml-auto h-1 rounded-full bg-gray-100 w-16 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: '100%', background: Y, animation: 'slideProgressBar 4s linear' }} />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="relative">
              <div className="bg-gray-900 rounded-3xl p-3 shadow-2xl ring-1 ring-white/10">
                <div className="bg-gray-800 rounded-2xl px-4 py-2 flex items-center gap-2 mb-3">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 text-center text-xs text-gray-500 font-mono">edentrack.app</div>
                </div>
                <div key={activeSlide} style={{ animation: 'tourCardIn 0.35s ease forwards' }}>
                  {APP_SLIDES[activeSlide].preview}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EDEN AI SPOTLIGHT */}
      <section className="py-24 px-4 sm:px-6 bg-[#f8f8ff]">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-3xl p-8 sm:p-12 border border-purple-100 overflow-hidden relative"
            style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%)' }}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-full mb-5">
                  <Brain className="w-3.5 h-3.5" />
                  Eden AI, Powered by Claude
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900 mb-4 tracking-tight">Your farm advisor that actually does things</h2>
                <p className="text-gray-600 leading-relaxed mb-6">
                  Eden doesn't just answer questions — it acts. Tell it what happened on the farm and it logs the data for you. Send it a receipt photo and it imports the expense.
                </p>
                <ul className="space-y-3">
                  {[
                    'Diagnose flock health from symptoms or photos',
                    'Log eggs, mortality and expenses by voice or text',
                    'Read and import paper receipt photos',
                    'Analyse your farm KPIs and explain them plainly',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                      <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-purple-600" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white rounded-2xl shadow-xl border border-purple-100 p-5 space-y-3">
                {[
                  { role: 'user', text: 'We collected 420 large eggs and 80 medium from Batch B this morning. 6 were cracked.' },
                  { role: 'eden', text: '420 large plus 80 medium is 500 good eggs with 6 damaged, a 98.8% quality rate. Your batch B laying rate is now 84%, slightly above last week.' },
                  { role: 'user', text: 'Yes save it. Also 3 birds died, cause unknown.' },
                  { role: 'eden', text: 'Saving egg collection. For the mortality: sudden 3-bird loss with no known cause often points to heat stress or water access issues. Logging the 3 deaths.' },
                ].map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user' ? 'bg-gray-900 text-white rounded-br-sm' : 'bg-purple-50 text-gray-800 rounded-bl-sm border border-purple-100'
                    }`}>
                      {msg.role === 'eden' && <span className="block text-xs font-bold text-purple-600 mb-1">Eden</span>}
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OFFLINE + WHATSAPP STRIP */}
      <section className="py-16 px-4 sm:px-6 bg-white border-y border-gray-100">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {[
            { icon: Wifi, title: 'Works offline', body: 'Log data with no signal. Syncs when you reconnect.', color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100' },
            { icon: MessageCircle, title: 'WhatsApp sharing', body: 'Share reports, receipts and farm summaries in one tap.', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
            { icon: Stethoscope, title: 'Photo diagnosis', body: 'Send a photo of a sick bird or droppings and Eden gives you a diagnosis.', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
          ].map(({ icon: Icon, title, body, color, bg, border }) => (
            <div key={title} className={`flex flex-col items-center gap-3 p-8 rounded-2xl border ${border} ${bg}`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-white shadow-sm`}>
                <Icon className={`w-7 h-7 ${color}`} />
              </div>
              <h3 className="font-bold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 max-w-xs leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-24 px-4 sm:px-6" style={{ background: '#0a0a0a' }}>
        {paymentSuccess && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment successful!</h2>
              <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                We've sent a <strong>receipt + account setup link</strong> to your email.
              </p>
              <ol className="text-left text-sm text-gray-500 space-y-2 mb-6 px-2">
                <li className="flex gap-2"><span className="font-bold text-gray-900">1.</span> Open the email from Edentrack</li>
                <li className="flex gap-2"><span className="font-bold text-gray-900">2.</span> Click "Set up your account"</li>
                <li className="flex gap-2"><span className="font-bold text-gray-900">3.</span> Create your password &amp; set up your farm</li>
              </ol>
              <button
                onClick={() => setPaymentSuccess(false)}
                className="w-full py-3 rounded-2xl bg-[#3D5F42] text-white font-semibold hover:bg-[#2F4A34] transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 border border-white/10 text-gray-400 text-xs font-bold px-4 py-1.5 rounded-full mb-5 uppercase tracking-wider">
              Pricing
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-tight">Simple, honest pricing</h2>
            <p className="text-gray-400 text-lg">Cancel anytime.</p>
          </div>

          {/* Billing cycle toggle */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex bg-white/5 border border-white/10 rounded-2xl p-1 gap-1">
              {(['monthly', 'quarterly', 'yearly'] as BillingCycle[]).map(c => {
                const save = c !== 'monthly' ? (() => {
                  const growerSave = savingsPct('grower', c);
                  return growerSave ? `Save ${growerSave}%` : null;
                })() : null;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBillingCycle(c)}
                    className={`relative px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                      billingCycle === c
                        ? 'bg-white text-gray-900 shadow'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {c === 'monthly' ? 'Monthly' : c === 'quarterly' ? '3 Months' : 'Yearly'}
                    {save && billingCycle !== c && (
                      <span className="ml-1.5 text-[10px] font-bold text-yellow-400">{save}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {PLANS.map(plan => {
              const save = savingsPct(plan.id, billingCycle);
              const perMo = perMonthLine(plan.id, billingCycle);
              return (
                <div
                  key={plan.id}
                  className="rounded-2xl p-6 flex flex-col transition-all hover:-translate-y-1"
                  style={{
                    background: plan.highlighted ? Y : 'rgba(255,255,255,0.05)',
                    border: plan.highlighted ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {plan.badge && (
                    <div className="text-center mb-3">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${plan.highlighted ? 'bg-black/20 text-gray-900' : 'bg-yellow-500/20 text-yellow-400'}`}>{plan.badge}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${plan.highlighted ? 'bg-black/15' : 'bg-white/10'}`}
                      style={{ color: plan.highlighted ? '#1a1a1a' : '#e5e7eb' }}>{plan.icon}</div>
                    <span className={`font-bold text-lg ${plan.highlighted ? 'text-gray-900' : 'text-white'}`}>{plan.name}</span>
                  </div>

                  <div className="mb-5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`text-3xl font-extrabold ${plan.highlighted ? 'text-gray-900' : 'text-white'}`}>
                        {landingPrice(plan.id, billingCycle)}
                      </span>
                      {plan.id !== 'starter' && (
                        <span className={`text-sm ${plan.highlighted ? 'text-gray-600' : 'text-gray-500'}`}>
                          / {landingSub(billingCycle)}
                        </span>
                      )}
                      {save !== null && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${plan.highlighted ? 'bg-black/20 text-gray-900' : 'bg-yellow-400/20 text-yellow-300'}`}>
                          Save {save}%
                        </span>
                      )}
                    </div>
                    {plan.id === 'starter' && (
                      <p className={`text-xs mt-0.5 ${plan.highlighted ? 'text-gray-600' : 'text-gray-500'}`}>forever</p>
                    )}
                    {perMo && (
                      <p className={`text-xs mt-0.5 ${plan.highlighted ? 'text-gray-600' : 'text-gray-500'}`}>{perMo}</p>
                    )}
                  </div>

                  <ul className="space-y-2 flex-1 mb-5">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${plan.highlighted ? 'text-gray-700' : 'text-yellow-400'}`} />
                        <span className={plan.highlighted ? 'text-gray-800' : 'text-gray-300'}>{f}</span>
                      </li>
                    ))}
                    {plan.notIncluded.map(f => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <X className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-600">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {checkoutError?.plan === (plan.id === 'grower' ? 'pro' : plan.id === 'farmboss' ? 'enterprise' : 'industry') && (
                    <p className="text-red-400 text-xs mb-2 text-center">{checkoutError.msg}</p>
                  )}
                  {flwEmailFor === (plan.id === 'grower' ? 'pro' : plan.id === 'farmboss' ? 'enterprise' : plan.id === 'industry' ? 'industry' : null) && (
                    <form onSubmit={doFlutterwaveCheckout} className="mb-2 space-y-2">
                      <input
                        type="email" required autoFocus value={flwEmail} onChange={e => setFlwEmail(e.target.value)}
                        placeholder="Your email address"
                        className="w-full px-3 py-2 rounded-lg text-sm text-gray-900 placeholder-gray-400 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      />
                      <button type="submit" className="w-full py-2 rounded-lg text-sm font-bold bg-yellow-400 text-gray-900 hover:bg-yellow-300 transition-colors">
                        Go to payment →
                      </button>
                      <button type="button" onClick={() => setFlwEmailFor(null)} className="w-full text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                    </form>
                  )}
                  <button
                    type="button"
                    disabled={!!checkoutLoading || flwEmailFor === (plan.id === 'grower' ? 'pro' : plan.id === 'farmboss' ? 'enterprise' : plan.id === 'industry' ? 'industry' : null)}
                    onClick={() => {
                      if (plan.id === 'grower') { startCheckout('pro'); return; }
                      if (plan.id === 'farmboss') { startCheckout('enterprise'); return; }
                      if (plan.id === 'industry') { startCheckout('industry'); return; }
                      handleGetStarted();
                    }}
                    className={`w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 ${
                      plan.highlighted
                        ? 'bg-gray-900 text-white'
                        : plan.id === 'farmboss'
                        ? 'bg-amber-500 text-white'
                        : plan.id === 'industry'
                        ? 'bg-blue-600 text-white'
                        : 'border border-white/20 text-white hover:bg-white/10'
                    }`}
                  >
                    {checkoutLoading === (plan.id === 'grower' ? 'pro' : plan.id === 'farmboss' ? 'enterprise' : plan.id === 'industry' ? 'industry' : '') ? (
                      <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Preparing…</>
                    ) : plan.ctaLabel}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-gray-600 mt-8">Payments via Flutterwave and Stripe. Card, mobile money and bank transfer accepted. Cancel anytime.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-gray-100 text-gray-600 text-xs font-bold px-4 py-1.5 rounded-full mb-5 uppercase tracking-wider">
              FAQ
            </div>
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Common questions</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-gray-100 rounded-2xl overflow-hidden hover:border-gray-200 transition-colors">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-semibold text-gray-900 text-sm">{faq.q}</span>
                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 ml-3">
                    {openFaq === i ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                  </div>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-sm text-gray-500 leading-relaxed border-t border-gray-50 pt-3">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative py-24 px-4 sm:px-6 text-center overflow-hidden" style={{ background: '#0a0a0a' }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(255,221,0,0.06) 0%, transparent 70%)',
        }} />
        <div className="relative max-w-2xl mx-auto">
          <div className="flex justify-center mb-6">
            <span className="text-3xl font-black tracking-tight">
              <span className="text-white">EDEN</span><span className="neon-track">TRACK</span>
            </span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 tracking-tight">
            Start managing your farm<br />
            <span style={{ color: Y }}>today</span>
          </h2>
          <p className="text-gray-400 text-lg mb-10">Start free. Grow on your own terms.</p>
          <button type="button" onClick={handleGetStarted}
            className="text-gray-900 px-10 py-4 rounded-full font-bold text-base transition-all hover:scale-105 hover:brightness-110"
            style={{ background: Y, boxShadow: '0 0 30px rgba(255,221,0,0.3), 0 4px 20px rgba(0,0,0,0.3)' }}>
            Get started free
          </button>
          <p className="text-gray-600 text-xs mt-4">No card needed. Takes 60 seconds.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#050505] text-gray-500 border-t border-white/5 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center">
            <span className="font-black text-sm tracking-tight">
              <span className="text-white">EDEN</span><span className="neon-track">TRACK</span>
            </span>
          </div>
          <p className="text-xs text-center">Poultry farm management for everyone, everywhere.</p>
          <div className="flex items-center gap-6 text-xs">
            <button type="button" onClick={handleSignIn} className="hover:text-white transition-colors">Sign In</button>
            <button type="button" onClick={handleGetStarted} className="hover:text-white transition-colors">Get Started</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
