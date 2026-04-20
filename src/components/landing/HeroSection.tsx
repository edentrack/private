import React, { useState, useEffect } from 'react';
import { ArrowRight, Play, CheckCircle2, TrendingUp, Package, DollarSign, Users, Calendar, BarChart3, Clock, User, Mail, Phone, MessageSquare, X } from 'lucide-react';
import { ChickenIcon } from '../icons/ChickenIcon';
import { supabase } from '../../lib/supabaseClient';

interface HeroSectionProps {
  onGetStarted: () => void;
}

export default function HeroSection({ onGetStarted }: HeroSectionProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showDemoForm, setShowDemoForm] = useState(false);
  const [demoFormData, setDemoFormData] = useState({
    name: '',
    email: '',
    phone: '',
    preferredDate: '',
    preferredTime: '',
    message: '',
    company: '',
  });
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoSuccess, setDemoSuccess] = useState(false);
  const [demoError, setDemoError] = useState('');

  const slides = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      nav: ['Dashboard', 'Flocks', 'Insights'],
      content: (
        <>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-agri-brown-900 mb-2">Good morning! 👋</h2>
            <p className="text-agri-brown-600">Here's what's happening with your farm today.</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'TOTAL ANIMALS', value: '1,000' },
              { label: 'ACTIVE FLOCKS', value: '1' },
              { label: 'PENDING TASKS', value: '3' },
              { label: 'CURRENT WEEK', value: '3' },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white rounded-xl p-4 shadow-md border border-neon-100">
                <div className="text-xs font-semibold text-agri-brown-500 uppercase mb-1">{stat.label}</div>
                <div className="text-2xl font-bold text-agri-brown-900">{stat.value}</div>
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-md border border-neon-100">
              <h3 className="font-semibold text-agri-brown-900 mb-4">Today's Tasks</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-2 bg-neon-50 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-neon-600" />
                  <span className="text-sm text-agri-brown-700">Feed Pen #1</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl p-6 shadow-md border border-neon-100">
              <h3 className="font-semibold text-agri-brown-900 mb-4">Production Cycle</h3>
              <div className="space-y-2">
                <div className="text-sm text-agri-brown-700">Week 3 • Growing Phase</div>
                <div className="w-full bg-neon-100 rounded-full h-2">
                  <div className="bg-gradient-to-r from-neon-400 to-neon-500 h-2 rounded-full" style={{ width: '25%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'flocks',
      title: 'Flocks',
      nav: ['Dashboard', 'Flocks', 'Insights'],
      content: (
        <>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-agri-brown-900">Flock Management</h2>
              <button className="bg-gradient-to-r from-neon-400 to-neon-500 text-agri-brown-900 px-4 py-2 rounded-lg font-semibold text-sm">
                + New Flock
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {[
              { name: 'Flock 1', type: 'Layer', birds: 1000, age: '11 weeks', status: 'Active', survivalRate: '98.5%' },
            ].map((flock, idx) => (
              <div key={idx} className="bg-white rounded-xl p-6 shadow-md border border-neon-100">
                <div className="mb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="badge-yellow inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-100 text-yellow-800 text-xs font-semibold">
                          {flock.type === 'Layer' ? (
                            <img src="/layer.jpg" alt="Layer" className="w-4 h-4 object-contain mix-blend-multiply" style={{ backgroundColor: 'transparent' }} />
                          ) : (
                            <ChickenIcon className="w-4 h-4" />
                          )}
                          <span>{flock.type}</span>
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-agri-brown-900 mb-2">{flock.name}</h3>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs font-semibold text-agri-brown-500 uppercase">AGE</span>
                      <div className="text-lg font-bold text-agri-brown-900">{flock.age} old</div>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-agri-brown-500 uppercase">INITIAL BIRD COUNT</span>
                      <div className="text-lg font-bold text-agri-brown-900">1,000</div>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-agri-brown-500 uppercase">CURRENT BIRD COUNT</span>
                      <div className="text-lg font-bold text-agri-brown-900">985</div>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-agri-brown-500 uppercase">SURVIVAL RATE</span>
                      <div className="text-lg font-bold text-agri-brown-900">{flock.survivalRate}</div>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 pt-4 border-t border-neon-100">
                  <button className="flex-1 bg-neon-50 text-agri-brown-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-neon-100 transition-colors">
                    Weight Check
                  </button>
                  <button className="flex-1 bg-neon-50 text-agri-brown-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-neon-100 transition-colors">
                    Record Mortality
                  </button>
                  <button className="flex-1 bg-neon-50 text-agri-brown-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-neon-100 transition-colors">
                    Archive Flock
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      id: 'insights',
      title: 'Insights',
      nav: ['Dashboard', 'Flocks', 'Insights'],
      content: (
        <>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-agri-brown-900 mb-2">Insights & Analytics</h2>
            <p className="text-agri-brown-600">Track performance and financial metrics</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              { label: 'TOTAL REVENUE', value: '450,000', icon: DollarSign, color: 'text-green-600' },
              { label: 'TOTAL EXPENSES', value: '320,000', icon: Package, color: 'text-red-600' },
              { label: 'NET PROFIT', value: '130,000', icon: TrendingUp, color: 'text-neon-600' },
            ].map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <div key={idx} className="bg-white rounded-xl p-6 shadow-md border border-neon-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-agri-brown-500 uppercase">{stat.label}</div>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div className={`text-3xl font-bold ${stat.color}`}>{stat.value} XAF</div>
                </div>
              );
            })}
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-md border border-neon-100">
            <h3 className="font-semibold text-agri-brown-900 mb-4">Production Metrics</h3>
            <div className="space-y-3">
              {[
                { label: 'Feed Conversion Ratio', value: '1.8', target: '1.5-2.0' },
                { label: 'Survival Rate', value: '98%', target: '>95%' },
                { label: 'Production Rate', value: '85%', target: '>80%' },
              ].map((metric, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-agri-brown-700">{metric.label}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-agri-brown-900">{metric.value}</span>
                    <span className="text-xs text-agri-brown-500">Target: {metric.target}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'inventory',
      title: 'Inventory',
      nav: ['Dashboard', 'Flocks', 'Inventory'],
      content: (
        <>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-agri-brown-900 mb-2">Inventory Management</h2>
            <p className="text-agri-brown-600">Track feed, medication, and supplies</p>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {[
              { name: 'Starter Feed', stock: '50 bags', status: 'In Stock', category: 'Feed' },
              { name: 'Antibiotics', stock: '5 bottles', status: 'Low Stock', category: 'Medication' },
              { name: 'Layer Feed', stock: '30 bags', status: 'In Stock', category: 'Feed' },
            ].map((item, idx) => (
              <div key={idx} className="bg-white rounded-xl p-4 shadow-md border border-neon-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      item.category === 'Feed' ? 'bg-neon-100' : 'bg-red-100'
                    }`}>
                      <Package className={`w-5 h-5 ${
                        item.category === 'Feed' ? 'text-neon-600' : 'text-red-600'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-agri-brown-900">{item.name}</h3>
                      <p className="text-sm text-agri-brown-600">{item.stock}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    item.status === 'In Stock' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      id: 'sales',
      title: 'Sales',
      nav: ['Dashboard', 'Sales', 'Insights'],
      content: (
        <>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-agri-brown-900 mb-2">Sales Management</h2>
            <p className="text-agri-brown-600">Track bird and egg sales</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[
              { label: 'Total Revenue', value: '450,000 XAF', trend: '+12%' },
              { label: 'Birds Sold', value: '150', trend: '+8%' },
              { label: 'Eggs Sold', value: '2,400', trend: '+15%' },
              { label: 'Avg Price/Bird', value: '3,000 XAF', trend: '+5%' },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white rounded-xl p-4 shadow-md border border-neon-100">
                <div className="text-xs font-semibold text-agri-brown-500 uppercase mb-1">{stat.label}</div>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-agri-brown-900">{stat.value}</div>
                  <span className="text-xs font-semibold text-green-600">{stat.trend}</span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-md border border-neon-100">
            <h3 className="font-semibold text-agri-brown-900 mb-4">Recent Sales</h3>
            <div className="space-y-3">
              {[
                { customer: 'John Doe', items: '50 birds', amount: '150,000 XAF', date: 'Today' },
                { customer: 'Mary Smith', items: '3 trays eggs', amount: '15,000 XAF', date: 'Yesterday' },
              ].map((sale, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-semibold text-agri-brown-900">{sale.customer}</div>
                    <div className="text-sm text-agri-brown-600">{sale.items}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-agri-brown-900">{sale.amount}</div>
                    <div className="text-xs text-agri-brown-500">{sale.date}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ),
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000); // Change slide every 5 seconds

    return () => clearInterval(interval);
  }, [slides.length]);

  const currentSlideData = slides[currentSlide];

  return (
    <section className="relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="text-center">
          {/* Main Heading */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
            Professional Farm Management
            <br />
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, #ffe833 0%, #ffdd00 50%, #F5A623 100%)', WebkitBackgroundClip: 'text' }}>
              for Modern Farmers
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-xl md:text-2xl text-gray-700 mb-8 max-w-3xl mx-auto leading-relaxed">
            Track flocks, manage sales, monitor inventory, and grow your profits with the most comprehensive farm management platform.
          </p>

          {/* Tagline */}
          <p className="text-lg text-gray-600 mb-12 italic">
            Built by a farmer, for farmers worldwide.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onGetStarted();
                window.location.href = (window.location.pathname || '/') + '#/signup';
              }}
              className="group text-white px-8 py-4 rounded-full font-semibold text-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #4A3124 0%, #3A261C 100%)' }}
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            
            <button
              type="button"
              data-demo-trigger
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDemoForm(!showDemoForm);
              }}
              className="bg-white text-gray-900 px-8 py-4 rounded-full font-semibold text-lg border-2 border-gray-300 hover:border-gray-400 hover:shadow-lg transition-all duration-200 flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              View Demo
            </button>
          </div>

          {/* Demo Booking Form - Inline */}
          {showDemoForm && (
            <div className="max-w-2xl mx-auto mt-8 mb-8">
              {demoSuccess ? (
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-200">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Demo Request Submitted!</h3>
                  <p className="text-gray-600 mb-6">
                    Thank you! We've received your demo request and will contact you shortly.
                  </p>
                  <button
                    onClick={() => {
                      setShowDemoForm(false);
                      setDemoSuccess(false);
                      setDemoFormData({
                        name: '',
                        email: '',
                        phone: '',
                        preferredDate: '',
                        preferredTime: '',
                        message: '',
                        company: '',
                      });
                    }}
                    className="text-agri-brown-600 hover:text-agri-brown-700 font-medium"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-200">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold text-gray-900">Schedule Your Demo</h3>
                    <button
                      onClick={() => setShowDemoForm(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  
                  {demoError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-800">
                      {demoError}
                    </div>
                  )}

                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setDemoError('');
                    setDemoLoading(true);

                    try {
                      const { data: superAdminProfiles, error: profileError } = await supabase
                        .from('profiles')
                        .select('id, full_name')
                        .eq('is_super_admin', true)
                        .limit(1);

                      if (profileError) throw profileError;
                      if (!superAdminProfiles || superAdminProfiles.length === 0) {
                        throw new Error('No admin account found. Please contact support@edentrack.app directly.');
                      }

                      const superAdminId = superAdminProfiles[0].id;
                      const { data: farms, error: farmError } = await supabase
                        .from('farms')
                        .select('id, name')
                        .eq('owner_id', superAdminId)
                        .limit(1);

                      if (farmError) throw farmError;
                      if (!farms || farms.length === 0) {
                        throw new Error('Admin farm not found. Please contact support@edentrack.app directly.');
                      }

                      const farmId = farms[0].id;
                      const scheduledDateTime = demoFormData.preferredDate && demoFormData.preferredTime
                        ? `${demoFormData.preferredDate}T${demoFormData.preferredTime}:00`
                        : null;

                      const taskDescription = `Demo Request from ${demoFormData.name}\n\n` +
                        `Email: ${demoFormData.email}\n` +
                        `Phone: ${demoFormData.phone}\n` +
                        (demoFormData.company ? `Company: ${demoFormData.company}\n` : '') +
                        (demoFormData.preferredDate ? `Preferred Date: ${new Date(demoFormData.preferredDate).toLocaleDateString()}\n` : '') +
                        (demoFormData.preferredTime ? `Preferred Time: ${demoFormData.preferredTime}\n` : '') +
                        (demoFormData.message ? `\nMessage:\n${demoFormData.message}` : '');

                      const { error: taskError } = await supabase
                        .from('tasks')
                        .insert({
                          farm_id: farmId,
                          title_override: `Demo Request: ${demoFormData.name}`,
                          notes: taskDescription,
                          scheduled_for: scheduledDateTime,
                          scheduled_time: demoFormData.preferredTime || null,
                          due_date: demoFormData.preferredDate || new Date().toISOString().split('T')[0],
                          status: 'pending',
                          assigned_to: superAdminId,
                          requires_input: false,
                          critical: true,
                          auto_generated: false,
                        });

                      if (taskError) throw taskError;
                      setDemoSuccess(true);
                    } catch (err) {
                      setDemoError(err instanceof Error ? err.message : 'Failed to submit demo request. Please contact support@edentrack.app');
                    } finally {
                      setDemoLoading(false);
                    }
                  }} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <User className="w-4 h-4 inline mr-2" />
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={demoFormData.name}
                          onChange={(e) => setDemoFormData({ ...demoFormData, name: e.target.value })}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-neon-500 focus:border-neon-500"
                          placeholder="John Doe"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Mail className="w-4 h-4 inline mr-2" />
                          Email *
                        </label>
                        <input
                          type="email"
                          required
                          value={demoFormData.email}
                          onChange={(e) => setDemoFormData({ ...demoFormData, email: e.target.value })}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-neon-500 focus:border-neon-500"
                          placeholder="john@example.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Phone className="w-4 h-4 inline mr-2" />
                          Phone *
                        </label>
                        <input
                          type="tel"
                          required
                          value={demoFormData.phone}
                          onChange={(e) => setDemoFormData({ ...demoFormData, phone: e.target.value })}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-neon-500 focus:border-neon-500"
                          placeholder="+237 6XX XXX XXX"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Company/Farm Name
                        </label>
                        <input
                          type="text"
                          value={demoFormData.company}
                          onChange={(e) => setDemoFormData({ ...demoFormData, company: e.target.value })}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-neon-500 focus:border-neon-500"
                          placeholder="My Farm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Calendar className="w-4 h-4 inline mr-2" />
                          Preferred Date
                        </label>
                        <input
                          type="date"
                          value={demoFormData.preferredDate}
                          onChange={(e) => setDemoFormData({ ...demoFormData, preferredDate: e.target.value })}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-neon-500 focus:border-neon-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Clock className="w-4 h-4 inline mr-2" />
                          Preferred Time
                        </label>
                        <select
                          value={demoFormData.preferredTime}
                          onChange={(e) => setDemoFormData({ ...demoFormData, preferredTime: e.target.value })}
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-neon-500 focus:border-neon-500"
                        >
                          <option value="">Select a time</option>
                          {['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'].map((time) => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <MessageSquare className="w-4 h-4 inline mr-2" />
                        Additional Message
                      </label>
                      <textarea
                        rows={3}
                        value={demoFormData.message}
                        onChange={(e) => setDemoFormData({ ...demoFormData, message: e.target.value })}
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-neon-500 focus:border-neon-500 resize-none"
                        placeholder="Tell us about your farm or specific features you'd like to see..."
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={demoLoading}
                      className="w-full bg-gradient-to-r from-agri-brown-600 to-agri-brown-700 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {demoLoading ? 'Submitting...' : 'Schedule Demo'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* Trial Info */}
          {!showDemoForm && (
            <p className="text-sm text-gray-500">
              No credit card required • 14-day free trial
            </p>
          )}
        </div>

        {/* App Preview Slideshow */}
        <div className="mt-16 max-w-6xl mx-auto">
          <div className="relative rounded-2xl shadow-2xl overflow-hidden border-4 border-white/20 backdrop-blur-sm">
            {/* Navigation Dots */}
            <div className="absolute top-4 right-4 z-20 flex gap-2">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    currentSlide === idx
                      ? 'bg-neon-500 w-8'
                      : 'bg-white/50 hover:bg-white/70'
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>

            {/* Slides Container */}
            <div className="relative bg-gradient-to-br from-white to-agri-gold-50 p-4">
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                {/* Mock Navigation Header */}
                <div className="bg-gradient-to-r from-neon-50 to-agri-gold-50 border-b border-neon-200 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-neon-400 to-neon-500 rounded-lg flex items-center justify-center">
                      <span className="text-agri-brown-900 font-bold text-sm">E</span>
                    </div>
                    <span className="font-bold text-agri-brown-900">EDENTRACK</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {currentSlideData.nav.map((navItem, idx) => (
                      <div
                        key={idx}
                        className={`text-sm px-3 py-1 rounded-full transition-all duration-300 ${
                          navItem === currentSlideData.title
                            ? 'font-medium text-agri-brown-700 bg-white border border-neon-200'
                            : 'text-agri-brown-600 hover:text-agri-brown-700'
                        }`}
                      >
                        {navItem}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Slide Content with Transition */}
                <div className="p-8 bg-gradient-to-br from-agri-gold-50 to-white relative min-h-[400px]">
                  <div
                    key={currentSlide}
                    className="transition-opacity duration-500 ease-in-out"
                  >
                    {currentSlideData.content}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Slide Indicator Labels */}
          <div className="mt-4 flex justify-center gap-4">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                onClick={() => setCurrentSlide(idx)}
                className={`text-sm font-medium transition-colors ${
                  currentSlide === idx
                    ? 'text-agri-brown-900 underline'
                    : 'text-agri-brown-600 hover:text-agri-brown-900'
                }`}
              >
                {slide.title}
              </button>
            ))}
          </div>
        </div>
      </div>

    </section>
  );
}
