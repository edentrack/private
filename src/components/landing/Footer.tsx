import React from 'react';
import { ArrowRight } from 'lucide-react';
import { LogoIcon } from '../common/Logo';

interface FooterProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

export default function Footer({ onGetStarted, onSignIn }: FooterProps) {
  return (
    <footer className="bg-gradient-to-br from-agri-brown-800 to-agri-brown-900 text-white py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Logo & Description */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <LogoIcon size="sm" blend />
              <span className="text-2xl font-bold">EDENTRACK</span>
            </div>
            <p className="text-agri-brown-300 text-sm leading-relaxed">
              Professional farm management for modern farmers worldwide.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="font-bold text-lg mb-4">Product</h4>
            <ul className="space-y-2">
              <li>
                <a href="#features" className="text-agri-brown-300 hover:text-white transition-colors text-sm">
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className="text-agri-brown-300 hover:text-white transition-colors text-sm">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#roadmap" className="text-agri-brown-300 hover:text-white transition-colors text-sm">
                  Demo
                </a>
              </li>
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="font-bold text-lg mb-4">Company</h4>
            <ul className="space-y-2">
              <li>
                <a href="#about" className="text-agri-brown-300 hover:text-white transition-colors text-sm">
                  About
                </a>
              </li>
              <li>
                <a href="mailto:support@edentrack.app" className="text-agri-brown-300 hover:text-white transition-colors text-sm">
                  Blog
                </a>
              </li>
              <li>
                <a href="mailto:support@edentrack.app" className="text-agri-brown-300 hover:text-white transition-colors text-sm">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-bold text-lg mb-4">Legal</h4>
            <ul className="space-y-2">
              <li>
                <a href="#" className="text-agri-brown-300 hover:text-white transition-colors text-sm">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="text-agri-brown-300 hover:text-white transition-colors text-sm">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="text-agri-brown-300 hover:text-white transition-colors text-sm">
                  Cookie Policy
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-agri-brown-700 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-agri-brown-300 text-sm">
            © 2026 EDENTRACK. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSignIn();
              }}
              className="text-agri-brown-300 hover:text-white transition-colors text-sm font-medium"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onGetStarted();
              }}
              className="bg-gradient-to-r from-neon-400 to-neon-500 text-agri-brown-900 px-6 py-2 rounded-full font-semibold hover:shadow-lg hover:shadow-neon-500/30 transition-all duration-200 hover:scale-105 flex items-center gap-2"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
