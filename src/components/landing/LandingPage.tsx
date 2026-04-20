import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import HeroSection from './HeroSection';
import FeaturesSection from './FeaturesSection';
import AboutSection from './AboutSection';
import PricingSection from './PricingSection';
import RoadmapSection from './RoadmapSection';
import Footer from './Footer';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleGetStarted = () => {
    setMobileMenuOpen(false);
    // Use full navigation for reliable mobile behavior (hash-only often fails on mobile)
    window.location.href = (window.location.pathname || '/') + '#/signup';
  };

  const handleSignIn = () => {
    setMobileMenuOpen(false);
    // Use full navigation for reliable mobile behavior (hash-only often fails on mobile)
    window.location.href = (window.location.pathname || '/') + '#/login';
  };

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md" style={{ background: 'linear-gradient(135deg, #ffe833 0%, #ffdd00 100%)' }}>
                <span className="text-gray-900 font-bold text-lg">E</span>
              </div>
              <span className="text-2xl font-bold text-gray-900">EDENTRACK</span>
            </div>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-gray-700 hover:text-gray-900 font-medium transition-colors">
                Features
              </a>
              <a href="#about" className="text-gray-700 hover:text-gray-900 font-medium transition-colors">
                About
              </a>
              <a href="#pricing" className="text-gray-700 hover:text-gray-900 font-medium transition-colors">
                Pricing
              </a>
              <a href="#roadmap" className="text-gray-700 hover:text-gray-900 font-medium transition-colors">
                Coming Soon
              </a>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSignIn();
                }}
                className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={handleGetStarted}
                className="text-white px-6 py-2.5 rounded-full font-semibold hover:shadow-lg transition-all duration-200 hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #4A3124 0%, #3A261C 100%)' }}
              >
                Get Started
              </button>
            </div>

            {/* Mobile Navigation - Sign In & Get Started visible at top */}
            <div className="md:hidden flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSignIn();
                }}
                className="text-gray-700 hover:text-gray-900 font-medium transition-colors text-sm px-2"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleGetStarted();
                }}
                className="text-white text-sm font-medium px-4 py-2 rounded-full"
                style={{ background: 'linear-gradient(135deg, #4A3124 0%, #3A261C 100%)' }}
              >
                Get Started
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-gray-700 hover:text-gray-900 transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-gray-200 py-4 space-y-3">
              <a
                href="#features"
                onClick={(e) => handleNavClick(e, 'features')}
                className="block px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors font-medium"
              >
                Features
              </a>
              <a
                href="#pricing"
                onClick={(e) => handleNavClick(e, 'pricing')}
                className="block px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors font-medium"
              >
                Pricing
              </a>
              <a
                href="#about"
                onClick={(e) => handleNavClick(e, 'about')}
                className="block px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors font-medium"
              >
                About
              </a>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleGetStarted();
                }}
                className="w-full text-left px-4 py-2 text-white rounded-full font-semibold hover:shadow-lg transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, #4A3124 0%, #3A261C 100%)' }}
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <HeroSection onGetStarted={handleGetStarted} />

      {/* Features Section */}
      <FeaturesSection />

      {/* About Section */}
      <AboutSection />

      {/* Pricing Section */}
      <PricingSection onGetStarted={handleGetStarted} />

      {/* Roadmap Section */}
      <RoadmapSection />

      {/* Footer */}
      <Footer onGetStarted={handleGetStarted} onSignIn={handleSignIn} />
    </div>
  );
}
