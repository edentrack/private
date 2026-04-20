import React, { useState } from 'react';
import { Calendar, Clock, User, Mail, Phone, MessageSquare, ArrowLeft, CheckCircle2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

export default function DemoBookingPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    preferredDate: '',
    preferredTime: '',
    message: '',
    company: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Find super admin farms
      const { data: superAdminProfiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_super_admin', true)
        .limit(1);

      if (profileError) throw profileError;

      if (!superAdminProfiles || superAdminProfiles.length === 0) {
        // If no super admin, try to find any admin farm or create a system task
        throw new Error('No admin account found. Please contact support directly.');
      }

      const superAdminId = superAdminProfiles[0].id;

      // Get the first farm owned by super admin (or create a system farm task)
      const { data: farms, error: farmError } = await supabase
        .from('farms')
        .select('id, name')
        .eq('owner_id', superAdminId)
        .limit(1);

      if (farmError) throw farmError;

      let farmId: string;

      if (!farms || farms.length === 0) {
        // If no farm exists, we'll need to handle this differently
        // For now, create a task in a system way
        throw new Error('Admin farm not found. Please contact support directly.');
      }

      farmId = farms[0].id;

      // Create a task for the admin
      const scheduledDateTime = formData.preferredDate && formData.preferredTime
        ? `${formData.preferredDate}T${formData.preferredTime}:00`
        : null;

      const taskDescription = `Demo Request from ${formData.name}\n\n` +
        `Email: ${formData.email}\n` +
        `Phone: ${formData.phone}\n` +
        (formData.company ? `Company: ${formData.company}\n` : '') +
        (formData.preferredDate ? `Preferred Date: ${new Date(formData.preferredDate).toLocaleDateString()}\n` : '') +
        (formData.preferredTime ? `Preferred Time: ${formData.preferredTime}\n` : '') +
        (formData.message ? `\nMessage:\n${formData.message}` : '');

      const { error: taskError } = await supabase
        .from('tasks')
        .insert({
          farm_id: farmId,
          title_override: `Demo Request: ${formData.name}`,
          notes: taskDescription,
          scheduled_for: scheduledDateTime,
          scheduled_time: formData.preferredTime || null,
          due_date: formData.preferredDate || new Date().toISOString().split('T')[0],
          status: 'pending',
          assigned_to: superAdminId,
          requires_input: false,
          critical: true, // Mark as critical so it shows up prominently
          auto_generated: false,
        });

      if (taskError) throw taskError;

      // Also send an email notification if possible
      // For now, we'll just create the task

      setSuccess(true);
      setFormData({
        name: '',
        email: '',
        phone: '',
        preferredDate: '',
        preferredTime: '',
        message: '',
        company: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit demo request. Please try again or contact support@edentrack.app');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-yellow-50 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full">
          <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Demo Request Submitted!</h2>
            <p className="text-lg text-gray-600 mb-6">
              Thank you for your interest! We've received your demo request and our team will contact you shortly to schedule your personalized demo.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.hash = ''}
                className="w-full bg-gradient-to-r from-agri-brown-600 to-agri-brown-700 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg transition-all duration-200 hover:scale-105"
              >
                Back to Home
              </button>
              <a
                href="mailto:support@edentrack.app"
                className="block text-agri-brown-600 hover:text-agri-brown-700 font-medium transition-colors"
              >
                Or contact us directly
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Get available time slots
  const timeSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30', '17:00'
  ];

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 3);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-yellow-50">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => window.location.hash = ''}
              className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md" style={{ background: 'linear-gradient(135deg, #ffe833 0%, #ffdd00 100%)' }}>
                <span className="text-gray-900 font-bold text-lg">E</span>
              </div>
              <span className="text-2xl font-bold text-gray-900">EDENTRACK</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-neon-400 to-neon-500 rounded-2xl mb-6">
            <Calendar className="w-8 h-8 text-agri-brown-900" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Schedule Your Demo
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Book a personalized demo with our team and see how EDENTRACK can transform your farm management.
          </p>
        </div>

        {/* Booking Form */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">{error}</p>
                  <p className="text-sm text-red-600 mt-1">
                    You can also contact us directly at{' '}
                    <a href="mailto:support@edentrack.app" className="underline">support@edentrack.app</a>
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="w-4 h-4 inline mr-2" />
                  Full Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-neon-500 focus:border-neon-500 transition-all"
                  placeholder="John Doe"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email Address *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-neon-500 focus:border-neon-500 transition-all"
                  placeholder="john@example.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4 inline mr-2" />
                  Phone Number *
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-neon-500 focus:border-neon-500 transition-all"
                  placeholder="+237 6XX XXX XXX"
                />
              </div>

              {/* Company */}
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="w-4 h-4 inline mr-2" />
                  Company/Farm Name
                </label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-neon-500 focus:border-neon-500 transition-all"
                  placeholder="My Farm"
                />
              </div>

              {/* Preferred Date */}
              <div>
                <label htmlFor="preferredDate" className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Preferred Date
                </label>
                <input
                  type="date"
                  id="preferredDate"
                  name="preferredDate"
                  value={formData.preferredDate}
                  onChange={handleChange}
                  min={today}
                  max={maxDateStr}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-neon-500 focus:border-neon-500 transition-all"
                />
              </div>

              {/* Preferred Time */}
              <div>
                <label htmlFor="preferredTime" className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock className="w-4 h-4 inline mr-2" />
                  Preferred Time
                </label>
                <select
                  id="preferredTime"
                  name="preferredTime"
                  value={formData.preferredTime}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-neon-500 focus:border-neon-500 transition-all"
                >
                  <option value="">Select a time</option>
                  {timeSlots.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Message */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                <MessageSquare className="w-4 h-4 inline mr-2" />
                Additional Message
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-neon-500 focus:border-neon-500 transition-all resize-none"
                placeholder="Tell us about your farm or any specific features you'd like to see..."
              />
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-agri-brown-600 to-agri-brown-700 text-white px-8 py-4 rounded-full font-semibold text-lg hover:shadow-2xl hover:shadow-agri-brown-500/40 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Submitting...
                  </>
                ) : (
                  <>
                    Schedule Demo
                    <Calendar className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>

            <p className="text-center text-sm text-gray-500">
              We'll contact you within 24 hours to confirm your demo time.
            </p>
          </form>
        </div>

        {/* Contact Info */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">Or contact us directly:</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="mailto:support@edentrack.app"
              className="text-agri-brown-700 hover:text-agri-brown-900 font-medium transition-colors inline-flex items-center gap-2"
            >
              <Mail className="w-4 h-4" />
              support@edentrack.app
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
