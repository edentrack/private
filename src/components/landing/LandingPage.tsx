import React, { useState } from 'react';
import {
  Menu, X, LayoutDashboard, TrendingUp, Brain, FileUp, CheckCircle,
  BarChart3, Users, Package, Calendar, Scale, Syringe, DollarSign,
  ShoppingCart, Zap, Sprout, Crown, Check, ChevronDown, ChevronUp,
  ArrowRight, Leaf, Building2, Shield, Stethoscope, Wifi, MessageCircle,
  ClipboardList, Egg,
} from 'lucide-react';

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
      'Mortality & weight tracking',
      'Expense recording',
      'Basic inventory management',
      'WhatsApp report sharing',
    ],
    notIncluded: ['Analytics & KPIs', 'Weekly email reports', 'Eden AI advisor', 'Smart Import', 'Team members'],
  },
  {
    id: 'grower',
    name: 'Grower',
    icon: <Sprout className="w-5 h-5" />,
    iconBg: 'bg-green-100 text-[#3D5F42]',
    price: 15,
    priceSub: 'every 3 months',
    badge: 'Most Popular',
    highlighted: true,
    ctaLabel: 'Start free trial',
    features: [
      'Up to 5 active flocks',
      'Full analytics & KPIs',
      'Automated weekly email reports',
      'Eden AI advisor (50 msg/month)',
      'Eden voice & photo logging',
      'Smart receipt & document import',
      'Vaccination scheduling & vet log',
      'Sales tracking & invoices',
      '2 team members + role permissions',
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
      'Unlimited flocks & team members',
      'Eden AI — unlimited messages',
      'Photo disease diagnosis',
      'Payroll & shift management',
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
      'Up to 10 farms, one account',
      'Multi-farm analytics dashboard',
      'Eden AI — unlimited, best model',
      'Unlimited team & custom roles',
      'Custom-branded PDF reports',
      'Excel / CSV data export',
      'Webhook API integrations',
      'Dedicated WhatsApp support',
      'Onboarding & quarterly review call',
    ],
    notIncluded: [],
  },
];

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: 'Farm Dashboard',
    description: 'Birds alive, today\'s tasks, egg collections, spending overview — everything at a glance the moment you open the app.',
    color: 'text-[#3D5F42]',
    bg: 'bg-green-50',
  },
  {
    icon: Brain,
    title: 'Eden AI Advisor',
    description: 'Ask Eden anything — flock health, feed optimization, when to sell. It knows your farm data and can log mortality, eggs, and expenses directly on your behalf.',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  {
    icon: FileUp,
    title: 'Smart Receipt Import',
    description: 'Photo a paper receipt and Eden reads it — auto-importing expenses with the right category, amount, and description. No typing.',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
  {
    icon: Shield,
    title: 'Role-Based Access Control',
    description: 'Owner, Manager, Worker, Viewer — each with their own access level. Toggle exactly what managers and workers can see, log, or delete.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: TrendingUp,
    title: 'Analytics & KPIs',
    description: 'Track FCR, survival rate, profit per flock, cost-per-bird, and laying rate. View week-by-week breakdowns and share reports via WhatsApp.',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
  },
  {
    icon: Egg,
    title: 'Egg Collection & Sales',
    description: 'Log eggs by size (small/medium/large/jumbo), track damaged eggs, manage inventory, and sell with automatic stock deduction.',
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
  },
  {
    icon: Scale,
    title: 'Weight & Growth Tracking',
    description: 'Record batch weights, compare against breed standards, and get sell-now vs wait recommendations from Eden.',
    color: 'text-[#3D5F42]',
    bg: 'bg-green-50',
  },
  {
    icon: Syringe,
    title: 'Vaccinations & Vet Log',
    description: 'Schedule vaccinations, get reminders, mark administered dates, and keep a full vet visit log including diagnosis, medication, and dosage.',
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
  {
    icon: Package,
    title: 'Inventory Management',
    description: 'Track feed, medication, and supplies. Get low-stock alerts before you run out. Log daily usage from the dashboard in one tap.',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    icon: DollarSign,
    title: 'Expense & Sales Tracking',
    description: 'Log every cost and sale. View profit per flock, per week, or across the whole farm. Export to PDF for your bank or accountant.',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    icon: Wifi,
    title: 'Works Offline',
    description: 'No internet on the farm? Everything still works. Data queues locally and syncs automatically when you reconnect — nothing is ever lost.',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
  },
  {
    icon: Users,
    title: 'Team & Payroll',
    description: 'Add managers and workers. Assign shifts, track hours, and process payroll — all from the same app.',
    color: 'text-pink-600',
    bg: 'bg-pink-50',
  },
  {
    icon: BarChart3,
    title: 'Weekly Email Reports',
    description: 'Get a full 7-day farm performance summary in your inbox every week, on the day you choose. Automatic, no setup needed.',
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp Sharing',
    description: 'One tap to share your farm report, flock summary, or sales receipt via WhatsApp with your partner, investor, or supply chain.',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    icon: ClipboardList,
    title: 'Tasks & Forecasting',
    description: 'Create task templates that repeat daily or weekly. Use the Forecast page to plan upcoming expenses before a batch starts.',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
];

const FAQS = [
  {
    q: 'Does it work without internet?',
    a: 'Yes. Edentrack is a PWA (Progressive Web App). All features work offline — data queues locally and syncs automatically when you reconnect. Nothing is lost.',
  },
  {
    q: 'Can Eden AI actually log my data?',
    a: 'Yes. Just tell Eden what happened — "50 large eggs collected from Batch A" or "bought 3 bags of feed for 45,000 CFA" — Eden extracts the details and asks you to confirm before saving. It also reads receipt photos.',
  },
  {
    q: 'Can I manage broilers and layers on the same farm?',
    a: 'Yes. Edentrack supports both broiler and layer flocks at the same time. The dashboard adapts — layer farms show egg KPIs, broiler farms show FCR and weight targets.',
  },
  {
    q: 'How does role access work?',
    a: 'There are four roles: Owner (full access), Manager (configurable — you choose what they can touch), Worker (tasks and logging only), and Viewer (read-only). You control every toggle individually in Settings.',
  },
  {
    q: 'What is Smart Import?',
    a: 'Take a photo of any paper receipt or invoice. Eden reads it using AI vision and imports the expense — amount, category, description — directly. No manual entry.',
  },
  {
    q: 'What currencies are supported?',
    a: 'All major African currencies (XAF, NGN, GHS, KES, ZAR, RWF, XOF and more), plus USD, EUR, and GBP.',
  },
  {
    q: 'How does the weekly email report work?',
    a: 'Pick your preferred day (e.g. Monday) in Settings. Every week, Edentrack sends a full 7-day summary — production, expenses, mortality, and revenue — straight to your inbox.',
  },
  {
    q: 'Can I add workers and control what they see?',
    a: 'Yes. Workers can be limited to tasks only, or you can enable mortality logging, egg collection, weight recording, and Eden AI individually for each farm. All under Settings → Permissions.',
  },
];

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
      {/* NAV */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow" style={{ background: 'linear-gradient(135deg,#ffe833,#ffdd00)' }}>
                <span className="text-gray-900 font-bold text-base">E</span>
              </div>
              <span className="text-xl font-bold tracking-tight">EDENTRACK</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" onClick={e => scrollTo(e, 'features')} className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">Features</a>
              <a href="#pricing" onClick={e => scrollTo(e, 'pricing')} className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">Pricing</a>
              <a href="#faq" onClick={e => scrollTo(e, 'faq')} className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">FAQ</a>
              <button type="button" onClick={handleSignIn} className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">Sign In</button>
              <button type="button" onClick={handleGetStarted} className="bg-[#3D5F42] text-white text-sm px-5 py-2 rounded-full font-semibold hover:bg-[#2F4A34] transition-colors">
                Get Started Free
              </button>
            </div>

            <button type="button" className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-3">
            <a href="#features" onClick={e => scrollTo(e, 'features')} className="block text-sm text-gray-700 font-medium py-1">Features</a>
            <a href="#pricing" onClick={e => scrollTo(e, 'pricing')} className="block text-sm text-gray-700 font-medium py-1">Pricing</a>
            <a href="#faq" onClick={e => scrollTo(e, 'faq')} className="block text-sm text-gray-700 font-medium py-1">FAQ</a>
            <hr className="border-gray-100" />
            <button type="button" onClick={handleSignIn} className="block w-full text-left text-sm text-gray-700 font-medium py-1">Sign In</button>
            <button type="button" onClick={handleGetStarted} className="w-full bg-[#3D5F42] text-white py-2.5 rounded-xl font-semibold text-sm">Get Started Free</button>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="py-20 px-4 sm:px-6 text-center bg-gradient-to-b from-[#f7f5f0] to-white">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold px-4 py-1.5 rounded-full mb-8">
            <Zap className="w-3.5 h-3.5" />
            Eden AI now logs data, reads receipts, and diagnoses flock health
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
            Run your poultry farm<br />
            <span style={{ color: '#3D5F42' }}>like a professional</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            Track flocks, expenses, egg production, sales, health and team — all in one place. Built for broiler and layer farmers across Africa. Works offline.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button type="button" onClick={handleGetStarted} className="w-full sm:w-auto bg-[#3D5F42] text-white px-8 py-3.5 rounded-full font-semibold text-base hover:bg-[#2F4A34] transition-colors shadow-md">
              Start for free — no card needed
            </button>
            <a href="#features" onClick={e => scrollTo(e, 'features')} className="w-full sm:w-auto flex items-center justify-center gap-2 text-gray-700 font-medium text-base hover:text-gray-900">
              See what's included <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <p className="text-xs text-gray-400 mt-5">Free forever on Starter · No credit card required</p>
        </div>

        {/* Stats bar */}
        <div className="max-w-3xl mx-auto mt-16 grid grid-cols-3 gap-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {[
            { value: '25+', label: 'Built features' },
            { value: '2', label: 'Languages (EN + FR)' },
            { value: '15+', label: 'African currencies' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-[#3D5F42]">{value}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Everything your farm needs</h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">Every feature below is live in the app today.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, description, color, bg }) => (
              <div key={title} className="rounded-2xl border border-gray-100 p-6 hover:shadow-md transition-shadow">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${bg}`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 px-4 sm:px-6 bg-[#f7f5f0]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Get started in minutes</h2>
          <p className="text-gray-500 mb-14 text-lg">No training needed. Farm from day one.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Create your farm', body: 'Sign up, name your farm, pick your country and currency. Takes 60 seconds.' },
              { step: '2', title: 'Add your flock', body: 'Enter your bird count and arrival date. Edentrack sets up tasks, phases, and targets automatically.' },
              { step: '3', title: 'Track everything', body: 'Log daily tasks, snap receipt photos, ask Eden AI for advice — and watch your data build into real farm intelligence.' },
            ].map(({ step, title, body }) => (
              <div key={step} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-left">
                <div className="w-9 h-9 rounded-full bg-[#3D5F42] text-white flex items-center justify-center font-bold text-sm mb-4">{step}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EDEN AI SPOTLIGHT */}
      <section className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-3xl p-8 sm:p-12 border border-purple-100">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 text-xs font-semibold px-3 py-1 rounded-full mb-5">
                  <Brain className="w-3.5 h-3.5" />
                  Eden AI — Powered by Claude
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Your farm advisor that actually does things</h2>
                <p className="text-gray-600 leading-relaxed mb-6">
                  Eden doesn't just answer questions — it acts. Tell it what happened on the farm and it logs the data for you. Send it a receipt photo and it imports the expense. Ask it about a sick bird and it gives you a diagnosis with treatment steps.
                </p>
                <ul className="space-y-2">
                  {[
                    'Diagnose flock health from symptoms or photos',
                    'Log eggs, mortality, and expenses by voice or text',
                    'Read and import paper receipt photos',
                    'Analyze your farm KPIs and explain them plainly',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-purple-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white rounded-2xl shadow-md border border-purple-100 p-5 space-y-3">
                {[
                  { role: 'user', text: 'We collected 420 large eggs and 80 medium from Batch B this morning. 6 were cracked.' },
                  { role: 'eden', text: 'Got it — 420 large + 80 medium = 500 good eggs, 6 damaged. That\'s a 98.8% quality rate. Confirming below. Also, your batch B laying rate is now 84% — slightly above last week.' },
                  { role: 'user', text: 'Yes save it. Also 3 birds died, cause unknown.' },
                  { role: 'eden', text: 'Saving egg collection. For the mortality: a sudden 3-bird loss with no known cause often points to heat stress or water access issues this time of year. Check drinkers first. Logging the 3 deaths — confirm below.' },
                ].map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-purple-600 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}>
                      {msg.role === 'eden' && <span className="block text-xs font-semibold text-purple-600 mb-1">Eden</span>}
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ROLE PERMISSIONS SPOTLIGHT */}
      <section className="py-20 px-4 sm:px-6 bg-[#f7f5f0]">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mb-5">
                <Shield className="w-3.5 h-3.5" />
                Role-Based Access Control
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Your farm, your rules</h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                Invite your manager, workers, and farm partners — and control exactly what each person can do. Not just read vs write. Individual toggles per feature.
              </p>
              <div className="space-y-3">
                {[
                  { role: 'Owner', desc: 'Full access to everything', color: 'bg-green-100 text-green-800' },
                  { role: 'Manager', desc: '14 configurable permissions — financials, team, payroll, delete', color: 'bg-blue-100 text-blue-800' },
                  { role: 'Worker', desc: 'Tasks + configurable logging — eggs, mortality, weight, Eden AI', color: 'bg-amber-100 text-amber-800' },
                  { role: 'Viewer', desc: 'Read-only across all data — ideal for investors or advisors', color: 'bg-gray-100 text-gray-700' },
                ].map(({ role, desc, color }) => (
                  <div key={role} className="flex items-start gap-3 bg-white rounded-xl p-4 border border-gray-100">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${color}`}>{role}</span>
                    <span className="text-sm text-gray-600">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Settings → Permissions → Worker</p>
              <div className="space-y-3">
                {[
                  { label: 'Log Mortality', sub: 'Workers can report dead birds', on: true },
                  { label: 'Log Egg Collections', sub: 'Record egg counts by size', on: true },
                  { label: 'Log Bird Weights', sub: 'Record weight samples', on: false },
                  { label: 'Use Eden AI', sub: 'Chat and log data via AI', on: true },
                  { label: 'View Financial Data', sub: 'Expenses, sales, profit', on: false },
                ].map(({ label, sub, on }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-400">{sub}</p>
                    </div>
                    <div className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors ${on ? 'bg-[#3D5F42]' : 'bg-gray-200'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OFFLINE + WHATSAPP STRIP */}
      <section className="py-14 px-4 sm:px-6 bg-white border-y border-gray-100">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {[
            { icon: Wifi, title: 'Works offline', body: 'Log data with no signal. Syncs when you reconnect.', color: 'text-teal-600', bg: 'bg-teal-50' },
            { icon: MessageCircle, title: 'WhatsApp sharing', body: 'Share reports, receipts, and farm summaries in one tap.', color: 'text-green-600', bg: 'bg-green-50' },
            { icon: Stethoscope, title: 'Photo diagnosis', body: 'Send a photo of a sick bird or droppings. Eden gives a diagnosis.', color: 'text-red-600', bg: 'bg-red-50' },
          ].map(({ icon: Icon, title, body, color, bg }) => (
            <div key={title} className="flex flex-col items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg}`}>
                <Icon className={`w-6 h-6 ${color}`} />
              </div>
              <h3 className="font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 max-w-xs">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-20 px-4 sm:px-6 bg-[#f7f5f0]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Simple, honest pricing</h2>
            <p className="text-gray-500 text-lg">Pay every 3 months. Cancel anytime. Start free.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {PLANS.map(plan => (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl p-6 border-2 flex flex-col shadow-sm ${
                  plan.highlighted ? 'border-[#3D5F42] ring-2 ring-[#3D5F42] ring-offset-2' : 'border-gray-200'
                }`}
              >
                {plan.badge && (
                  <div className="text-center mb-3">
                    <span className="bg-[#3D5F42] text-white text-xs font-bold px-3 py-1 rounded-full">{plan.badge}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${plan.iconBg}`}>{plan.icon}</div>
                  <span className="font-bold text-gray-900 text-lg">{plan.name}</span>
                </div>

                <div className="mb-5">
                  <span className="text-3xl font-bold text-gray-900">{plan.price === 0 ? 'Free' : `$${plan.price}`}</span>
                  <span className="text-gray-400 text-sm ml-1">/ {plan.priceSub}</span>
                  {plan.price > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">≈ ${(plan.price / 3).toFixed(0)}/month</p>
                  )}
                </div>

                <ul className="space-y-2 flex-1 mb-4">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                  {plan.notIncluded.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-400">
                      <X className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={handleGetStarted}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    plan.highlighted
                      ? 'bg-[#3D5F42] text-white hover:bg-[#2F4A34]'
                      : plan.id === 'farmboss'
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : plan.id === 'industry'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'border-2 border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {plan.ctaLabel}
                </button>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">Payments via Flutterwave — card, mobile money, and bank transfer accepted</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Common questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-gray-100 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-medium text-gray-900 text-sm">{faq.q}</span>
                  {openFaq === i ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-sm text-gray-600 leading-relaxed">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 px-4 sm:px-6 bg-[#3D5F42] text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Start managing your farm today</h2>
          <p className="text-green-200 text-lg mb-8">Free forever on Starter. Upgrade only when you're ready.</p>
          <button type="button" onClick={handleGetStarted} className="bg-white text-[#3D5F42] px-8 py-3.5 rounded-full font-bold text-base hover:bg-green-50 transition-colors shadow-lg">
            Create your free account
          </button>
          <p className="text-green-300 text-xs mt-4">No credit card required · Takes 60 seconds</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-gray-900 text-gray-400 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#ffe833,#ffdd00)' }}>
              <span className="text-gray-900 font-bold text-sm">E</span>
            </div>
            <span className="text-white font-bold">EDENTRACK</span>
          </div>
          <p className="text-xs text-center">Built for African poultry farmers · English & French · Broilers & Layers · Works offline</p>
          <div className="flex items-center gap-6 text-xs">
            <button type="button" onClick={handleSignIn} className="hover:text-white transition-colors">Sign In</button>
            <button type="button" onClick={handleGetStarted} className="hover:text-white transition-colors">Get Started</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
