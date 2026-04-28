import React, { useState } from 'react';
import { Leaf, Circle, Smartphone, TrendingUp, Globe, Box, Users, Calendar, Gauge, Zap, ArrowRight } from 'lucide-react';

export default function RoadmapSection() {
  const [activeTab, setActiveTab] = useState<'all' | 'animals' | 'features'>('all');

  const upcomingAnimals = [
    {
      icon: Circle,
      title: 'Pigs',
      description: 'Track pig growth, feed conversion, breeding cycles, and market readiness',
      quarter: 'Q1 2026',
      color: 'bg-pink-500',
      iconColor: 'text-pink-500',
      bgColor: 'bg-pink-100',
    },
    {
      icon: Leaf,
      title: 'Goats',
      description: 'Manage goat herds, milk production, breeding records, and health tracking',
      quarter: 'Q1 2026',
      color: 'bg-orange-500',
      iconColor: 'text-orange-500',
      bgColor: 'bg-orange-100',
    },
    {
      icon: Circle,
      title: 'Cattle',
      description: 'Comprehensive cattle management: dairy production, breeding, weight tracking',
      quarter: 'Q2 2026',
      color: 'bg-yellow-500',
      iconColor: 'text-yellow-500',
      bgColor: 'bg-yellow-100',
    },
    {
      icon: Circle,
      title: 'Sheep',
      description: 'Track sheep flocks, wool production, breeding cycles, and grazing management',
      quarter: 'Q2 2026',
      color: 'bg-gray-400',
      iconColor: 'text-gray-500',
      bgColor: 'bg-gray-100',
    },
    {
      icon: Circle,
      title: 'Beekeeping',
      description: 'Monitor hives, honey production, colony health, and seasonal management',
      quarter: 'Q3 2026',
      color: 'bg-yellow-400',
      iconColor: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
  ];

  const upcomingFeatures = [
    {
      icon: Smartphone,
      title: 'Mobile App',
      description: 'Native iOS and Android apps for on-the-go farm management',
      quarter: 'Q2 2026',
    },
    {
      icon: TrendingUp,
      title: 'Advanced Analytics',
      description: 'AI-powered insights, predictive analytics, and custom reports',
      quarter: 'Q2 2026',
    },
    {
      icon: Globe,
      title: 'Multi-Language Expansion',
      description: 'Support for Swahili, Hausa, Yoruba, and more regional languages',
      quarter: 'Q2 2026',
    },
    {
      icon: Box,
      title: 'Marketplace Integration',
      description: 'Connect with suppliers, buyers, and service providers directly in-app',
      quarter: 'Q3 2026',
    },
    {
      icon: Users,
      title: 'Farmer Community',
      description: 'Connect with other farmers, share knowledge, and get expert advice',
      quarter: 'Q3 2026',
    },
    {
      icon: Calendar,
      title: 'Weather Integration',
      description: 'Real-time weather data and alerts to optimize farm operations',
      quarter: 'Q3 2026',
    },
    {
      icon: Gauge,
      title: 'IoT Device Integration',
      description: 'Connect smart scales, sensors, and automated feeding systems',
      quarter: 'Q4 2026',
    },
    {
      icon: Zap,
      title: 'Offline Mode',
      description: 'Full functionality without internet - sync when connection is restored',
      quarter: 'Q4 2026',
    },
  ];

  const allUpdates = [...upcomingAnimals.map(a => ({ ...a, type: 'animal' as const })), ...upcomingFeatures.map(f => ({ ...f, type: 'feature' as const }))];

  const filteredUpdates = activeTab === 'all' 
    ? allUpdates 
    : activeTab === 'animals' 
    ? upcomingAnimals.map(a => ({ ...a, type: 'animal' as const }))
    : upcomingFeatures.map(f => ({ ...f, type: 'feature' as const }));

  return (
    <section id="roadmap" className="py-20 lg:py-32 bg-gradient-to-br from-white to-agri-gold-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-neon-100 px-4 py-2 rounded-full mb-4">
            <Leaf className="w-5 h-5 text-neon-600" />
            <span className="text-sm font-semibold text-neon-700">Coming Soon</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-agri-brown-900 mb-4">
            What's Next for EDENTRACK
          </h2>
          <p className="text-lg text-agri-brown-600 max-w-2xl mx-auto mb-2">
            We're constantly working on new features and animal support to make your farm management even better.
          </p>
          <p className="text-sm text-agri-brown-500 italic">
            Timeline is an estimate (updated Dec 2025)
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-4 mb-12">
          {[
            { id: 'all' as const, label: 'All Updates' },
            { id: 'animals' as const, label: 'New Animals' },
            { id: 'features' as const, label: 'New Features' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 rounded-full font-semibold transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-neon-400 to-neon-500 text-agri-brown-900 shadow-lg shadow-neon-500/30'
                  : 'bg-white text-agri-brown-700 hover:bg-agri-gold-50 border border-agri-brown-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* More Animals Coming Soon Section */}
        {activeTab === 'all' || activeTab === 'animals' ? (
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-8">
              <Leaf className="w-6 h-6 text-neon-600" />
              <h3 className="text-3xl font-bold text-agri-brown-900">More Animals Coming Soon</h3>
            </div>
            <p className="text-agri-brown-600 mb-8">Expanding our support to more farm animals</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {upcomingAnimals.map((animal, idx) => {
                const Icon = animal.icon;
                return (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl p-6 shadow-md hover:shadow-xl transition-all duration-300 border border-agri-brown-100 group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-14 h-14 ${animal.bgColor} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className={`w-7 h-7 ${animal.iconColor}`} />
                      </div>
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                        {animal.quarter}
                      </span>
                    </div>
                    <h4 className="text-xl font-bold text-agri-brown-900 mb-2">{animal.title}</h4>
                    <p className="text-agri-brown-600 mb-4 leading-relaxed">{animal.description}</p>
                    <div className="flex items-center gap-2 text-sm text-agri-brown-500">
                      <Calendar className="w-4 h-4" />
                      <span>Expected {animal.quarter}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Upcoming Features Section */}
        {activeTab === 'all' || activeTab === 'features' ? (
          <div>
            {activeTab === 'all' && (
              <div className="flex items-center gap-3 mb-8">
                <Zap className="w-6 h-6 text-neon-600 bg-neon-100 rounded-lg p-1" />
                <h3 className="text-3xl font-bold text-agri-brown-900">Upcoming Features</h3>
              </div>
            )}
            <p className="text-agri-brown-600 mb-8">New tools and capabilities we're building</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {upcomingFeatures.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl p-6 shadow-md hover:shadow-xl transition-all duration-300 border border-agri-brown-100 group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-14 h-14 bg-neon-100 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Icon className="w-7 h-7 text-neon-600" />
                      </div>
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                        {feature.quarter}
                      </span>
                    </div>
                    <h4 className="text-xl font-bold text-agri-brown-900 mb-2">{feature.title}</h4>
                    <p className="text-agri-brown-600 leading-relaxed">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Stay Updated CTA */}
        <div className="mt-16 bg-gradient-to-r from-agri-brown-600 to-agri-brown-700 rounded-3xl p-12 text-center text-white shadow-2xl">
          <h3 className="text-3xl md:text-4xl font-bold mb-4">Stay Updated</h3>
          <p className="text-xl mb-8 opacity-90">
            Want to be notified when these features launch? Sign up for our newsletter or follow our updates.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.hash = '#/signup';
              }}
              className="bg-white text-agri-brown-900 px-8 py-4 rounded-full font-semibold hover:shadow-2xl hover:shadow-white/30 transition-all duration-300 hover:scale-105 whitespace-nowrap"
            >
              Get Started Free
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.hash = '#/demo-booking';
              }}
              className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 transition-all duration-300 whitespace-nowrap"
            >
              Contact Us
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
