import React from 'react';
import { TrendingUp, Smartphone, Globe, Shield, Zap, Users, BarChart, Monitor } from 'lucide-react';
import { CheckCircle2, DollarSign, Package, BarChart3, Calendar } from 'lucide-react';

export default function FeaturesSection() {
  const mainFeatures = [
    {
      icon: TrendingUp,
      title: 'Multi-Species Support',
      description: 'Manage poultry, rabbits, and fish all in one platform',
      color: 'text-neon-600',
      bgColor: 'bg-neon-100',
    },
    {
      icon: BarChart3,
      title: 'Real-Time Analytics',
      description: 'Track performance, expenses, and revenue with live insights',
      color: 'text-agri-brown-600',
      bgColor: 'bg-agri-brown-100',
    },
    {
      icon: Smartphone,
      title: 'Mobile-First',
      description: 'Access your farm data anywhere, anytime on any device',
      color: 'text-neon-600',
      bgColor: 'bg-neon-100',
    },
    {
      icon: Globe,
      title: 'Multi-Language',
      description: 'Available in English, French, and more languages',
      color: 'text-agri-brown-600',
      bgColor: 'bg-agri-brown-100',
    },
    {
      icon: Shield,
      title: 'Secure & Private',
      description: 'Your data is encrypted and secure with role-based access',
      color: 'text-neon-600',
      bgColor: 'bg-neon-100',
    },
    {
      icon: Zap,
      title: 'AI-Powered Insights',
      description: 'Get intelligent recommendations and forecasts',
      color: 'text-agri-brown-600',
      bgColor: 'bg-agri-brown-100',
    },
  ];

  const trackFeatures = [
    { text: 'Flock Management', subtext: 'Track poultry, rabbits, and fish with species-specific features' },
    { text: 'Sales & Revenue', subtext: 'Record sales, manage customers, and track revenue in real-time' },
    { text: 'Expense Tracking', subtext: 'Monitor all expenses and analyze spending patterns' },
    { text: 'Inventory Management', subtext: 'Track feed, supplies, and other inventory items' },
    { text: 'Weight Analysis', subtext: 'Monitor growth and market readiness with detailed analytics' },
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
