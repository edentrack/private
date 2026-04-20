import React from 'react';
import { Shield, Smartphone, DollarSign, Package, BarChart3, Calendar } from 'lucide-react';

export default function AboutSection() {
  const features = [
    { icon: DollarSign, title: 'Profit', description: 'Track costs & revenue' },
    { icon: Package, title: 'Stock', description: 'Inventory control' },
    { icon: BarChart3, title: 'Growth', description: 'Weight analysis' },
    { icon: Calendar, title: 'Plan', description: 'Tasks & schedules' },
  ];

  return (
    <section id="about" className="py-20 lg:py-32 bg-gradient-to-br from-agri-gold-50 via-neon-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left: About EDENTRACK */}
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-agri-brown-900 mb-6">
              About EDENTRACK
            </h2>
            <p className="text-lg text-agri-brown-700 leading-relaxed mb-8">
              EDENTRACK was built by a farmer and shaped by real daily farm work. It helps farmers run better operations across poultry, rabbits, and aquaculture with simple workflows, reliable records, and clear insights.
            </p>
            
            {/* Feature Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-5 shadow-md border border-agri-brown-100 hover:shadow-lg transition-all duration-200">
                <div className="w-10 h-10 bg-gradient-to-br from-neon-100 to-agri-gold-100 rounded-lg flex items-center justify-center mb-3">
                  <Shield className="w-5 h-5 text-neon-600" />
                </div>
                <h4 className="font-bold text-agri-brown-900 mb-1">Trusted & Secure</h4>
                <p className="text-sm text-agri-brown-600">Role-based access and private farm data.</p>
              </div>
              
              <div className="bg-white rounded-xl p-5 shadow-md border border-agri-brown-100 hover:shadow-lg transition-all duration-200">
                <div className="w-10 h-10 bg-gradient-to-br from-neon-100 to-agri-gold-100 rounded-lg flex items-center justify-center mb-3">
                  <Smartphone className="w-5 h-5 text-neon-600" />
                </div>
                <h4 className="font-bold text-agri-brown-900 mb-1">PWA Ready</h4>
                <p className="text-sm text-agri-brown-600">Fits all screens and works great on mobile.</p>
              </div>
            </div>
          </div>

          {/* Right: Modern Farm Operations */}
          <div className="bg-gradient-to-br from-neon-50 to-agri-gold-50 rounded-3xl p-8 border border-neon-200 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-neon-400 to-neon-500 rounded-lg flex items-center justify-center">
                <span className="text-agri-brown-900 font-bold">E</span>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-agri-brown-900">Modern farm operations</h3>
                <p className="text-agri-brown-600 text-sm">Simple, fast, and built for real life.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {features.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={idx}
                    className="bg-white rounded-xl p-5 shadow-md border border-agri-brown-100 hover:shadow-lg transition-all duration-200 group"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-neon-100 to-agri-gold-100 rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-5 h-5 text-neon-600" />
                    </div>
                    <h4 className="font-bold text-agri-brown-900 mb-1">{feature.title}</h4>
                    <p className="text-sm text-agri-brown-600">{feature.description}</p>
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
