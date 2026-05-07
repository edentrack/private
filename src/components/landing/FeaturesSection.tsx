
import { TrendingUp, Smartphone, Globe, Shield, Zap, Users, BarChart } from 'lucide-react';
import { CheckCircle2, BarChart3 } from 'lucide-react';

export default function FeaturesSection() {
  const mainFeatures = [
    {
      icon: TrendingUp,
      title: 'Three species, one app',
      description: 'Layers, broilers, tilapia, catfish, meat rabbits, breeders. Same shell, species-aware features.',
      color: 'text-neon-600',
      bgColor: 'bg-neon-100',
    },
    {
      icon: Zap,
      title: 'Eden AI on every screen',
      description: 'Ask about feeding rates, water-quality emergencies, harvest timing. Answers grounded in your real farm data.',
      color: 'text-agri-brown-600',
      bgColor: 'bg-agri-brown-100',
    },
    {
      icon: BarChart3,
      title: 'Records that turn into decisions',
      description: 'Daily entries become weekly trends, FCR, survival, and a clear sell-vs-keep signal.',
      color: 'text-neon-600',
      bgColor: 'bg-neon-100',
    },
    {
      icon: Smartphone,
      title: 'Built mobile-first',
      description: 'Designed for the farm gate, not a desk. Works on any phone, online or offline.',
      color: 'text-agri-brown-600',
      bgColor: 'bg-agri-brown-100',
    },
    {
      icon: Globe,
      title: 'Localized for your market',
      description: 'Currencies, languages, and feed/medicine names that match where you actually farm.',
      color: 'text-neon-600',
      bgColor: 'bg-neon-100',
    },
    {
      icon: Shield,
      title: 'Roles for the whole team',
      description: 'Owner, manager, worker, viewer. Each sees what they need, nothing they shouldn’t.',
      color: 'text-agri-brown-600',
      bgColor: 'bg-agri-brown-100',
    },
  ];

  const trackFeatures = [
    { text: 'Multi-species tracking', subtext: 'Flocks, ponds, and rabbitries. Pick your species, the app adapts every label, KPI, and task list.' },
    { text: 'Daily tasks, weekly trends', subtext: 'Log feeding, water DO, mortality, weights. Edentrack rolls them into the metrics that matter.' },
    { text: 'Sales and expenses', subtext: 'Per-flock revenue, per-pond costs, per-rabbitry margins. Profit and loss without the spreadsheet.' },
    { text: 'Feed and inventory', subtext: 'Auto-deduct as you log daily tasks. Per-species feeding rates and starter/grower/finisher schedules built in.' },
    { text: 'Weights and growth', subtext: 'Bird weight checks for poultry, individual fish sampling with ABW and SGR, weanling growth curves for rabbits.' },
  ];

  const additionalFeatures = [
    { icon: Users, title: 'Multi-User', subtitle: 'Team Management' },
    { icon: BarChart, title: 'Analytics', subtitle: 'Real-Time Insights' },
    { icon: Smartphone, title: 'Mobile', subtitle: 'Any Device' },
    { icon: Globe, title: 'Global', subtitle: 'Multi-Language' },
  ];

  return (
    <section id="features" className="py-20 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Heading */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-agri-brown-900 mb-4">
            Everything You Need to Manage Your Farm
          </h2>
          <p className="text-xl text-agri-brown-600 max-w-2xl mx-auto">
            Powerful features designed for modern farmers
          </p>
        </div>

        {/* Main Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {mainFeatures.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl p-6 shadow-md hover:shadow-xl transition-all duration-300 border border-agri-brown-100 hover:border-neon-300 group"
              >
                <div className={`w-12 h-12 ${feature.bgColor} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-bold text-agri-brown-900 mb-2">{feature.title}</h3>
                <p className="text-agri-brown-600 leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>

        {/* Track Everything Section */}
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-agri-brown-900 mb-8 text-center">
            Track Everything
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Left: Feature List */}
            <div className="space-y-6">
              {trackFeatures.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-4">
                  <CheckCircle2 className="w-6 h-6 text-neon-600 flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="font-bold text-lg text-agri-brown-900 mb-1">{feature.text}</h4>
                    <p className="text-agri-brown-600">{feature.subtext}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Feature Cards */}
            <div className="grid grid-cols-2 gap-4">
              {additionalFeatures.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={idx}
                    className="bg-gradient-to-br from-white to-agri-gold-50 rounded-2xl p-6 shadow-md hover:shadow-xl transition-all duration-300 border border-agri-brown-100 group"
                  >
                    <div className="w-10 h-10 bg-neon-100 rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-5 h-5 text-neon-600" />
                    </div>
                    <h4 className="font-bold text-lg text-agri-brown-900 mb-1">{feature.title}</h4>
                    <p className="text-sm text-agri-brown-600">{feature.subtitle}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
