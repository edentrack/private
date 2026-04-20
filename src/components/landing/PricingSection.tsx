import React, { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';

interface PricingSectionProps {
  onGetStarted: () => void;
}

export default function PricingSection({ onGetStarted }: PricingSectionProps) {

  const features = [
    'Unlimited flocks/rabbitries/ponds',
    'All animal types (Poultry, Rabbits, Fish)',
    'Advanced analytics & insights',
    'KPIs & performance tracking',
    'Daily farm summary',
    'Unlimited team members',
    'Role-based access control',
    'Export reports (CSV/PDF)',
    'Inventory management',
    'Expense tracking',
    'Sales & revenue tracking',
    'Task management',
    'Mobile web access',
    'Priority support',
  ];

  return (
    <section id="pricing" className="py-20 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-agri-brown-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-agri-brown-600">
            One plan, all features included.
          </p>
        </div>

        {/* Pricing Card */}
        <div className="max-w-4xl mx-auto mb-16">
          <div className="bg-white rounded-3xl p-8 md:p-12 border-2 border-agri-brown-200 shadow-2xl relative">
            {/* Badge */}
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
              <span className="bg-gradient-to-r from-agri-brown-600 to-agri-brown-700 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
                Includes All Features
              </span>
            </div>

            {/* Plan Name */}
            <div className="text-center mb-8 pt-6">
              <h3 className="text-3xl font-bold text-agri-brown-900 mb-2">Standard Plan</h3>
              <div className="flex items-baseline justify-center gap-2 mb-4">
                <span className="text-6xl font-bold text-agri-brown-900">$12</span>
                <span className="text-xl text-agri-brown-600">/farm/month</span>
              </div>
              <p className="text-lg text-agri-brown-600">Everything you need to manage your farm</p>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {features.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-neon-600 flex-shrink-0" />
                  <span className="text-agri-brown-700">{feature}</span>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <div className="text-center">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onGetStarted();
                  window.location.href = (window.location.pathname || '/') + '#/signup';
                }}
                className="bg-gradient-to-r from-agri-brown-600 to-agri-brown-700 text-white px-8 py-4 rounded-full font-semibold text-lg hover:shadow-2xl hover:shadow-agri-brown-500/40 transition-all duration-300 hover:scale-105 flex items-center gap-2 mx-auto"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>

        </div>

        {/* Enterprise Plan */}
        <div className="max-w-4xl mx-auto text-center mb-8">
          <h4 className="text-2xl font-bold text-agri-brown-900 mb-2">Enterprise Plan</h4>
          <p className="text-agri-brown-600 mb-4">
            For large farms, multi-location operations, or custom integrations. Contact us for custom pricing.
          </p>
          <a
            href="mailto:support@edentrack.app?subject=Enterprise Plan Inquiry"
            className="text-agri-brown-700 hover:text-agri-brown-900 font-semibold inline-flex items-center gap-2 transition-colors"
          >
            Contact Sales
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Trial Info */}
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-agri-brown-500 text-sm">
            All plans include 14-day free trial • No credit card required
          </p>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-agri-brown-600 to-agri-brown-700 rounded-3xl p-12 text-center text-white shadow-2xl">
          <h3 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Transform Your Farm Management?
          </h3>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of farmers already using EDENTRACK
          </p>
          <div className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = (window.location.pathname || '/') + '#/signup';
              }}
              className="flex-1 bg-gradient-to-r from-neon-400 to-neon-500 text-agri-brown-900 px-8 py-4 rounded-full font-semibold hover:shadow-2xl hover:shadow-neon-500/50 transition-all duration-300 hover:scale-105"
            >
              Start Free Trial
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.hash = '';
                window.scrollTo({ top: 0, behavior: 'smooth' });
                // The demo form will be shown via HeroSection
                setTimeout(() => {
                  const viewDemoBtn = document.querySelector('[data-demo-trigger]');
                  if (viewDemoBtn) (viewDemoBtn as HTMLButtonElement).click();
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
