import React, { useState } from 'react';
import {
  Rocket,
  Calendar,
  CheckCircle,
  Clock,
  Heart,
  Bell,
  Filter,
  Sparkles,
} from 'lucide-react';
import { roadmapFeatures, roadmapCategories } from '../../data/roadmap';

export default function ComingSoonPage() {
  const [selectedCategory, setSelectedCategory] = useState('All Features');
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [votedFeatures, setVotedFeatures] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const filteredFeatures = roadmapFeatures.filter(feature => {
    const matchesCategory = selectedCategory === 'All Features' || feature.category === selectedCategory;
    const matchesPhase = !selectedPhase || feature.phase === selectedPhase;
    return matchesCategory && matchesPhase;
  });

  const phases = ['Week 2', 'Month 1', 'Month 2', 'Month 3+'];
  const featuresByPhase = phases.map(phase => ({
    phase,
    features: filteredFeatures.filter(f => f.phase === phase),
  }));

  const handleVote = (featureId: string) => {
    const newVoted = new Set(votedFeatures);
    if (newVoted.has(featureId)) {
      newVoted.delete(featureId);
    } else {
      newVoted.add(featureId);
    }
    setVotedFeatures(newVoted);
  };

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribed(true);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      'launched': 'bg-green-100 text-green-800',
      'in-progress': 'bg-amber-100 text-amber-800',
      'coming-soon': 'bg-gray-100 text-gray-800',
    };

    const icons = {
      'launched': <CheckCircle className="w-4 h-4" />,
      'in-progress': <Clock className="w-4 h-4" />,
      'coming-soon': <Calendar className="w-4 h-4" />,
    };

    const labels = {
      'launched': 'Launched',
      'in-progress': 'In Progress',
      'coming-soon': 'Coming Soon',
    };

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {icons[status]}
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-green-50">
      <div className="bg-gradient-to-r from-[#3D5F42] to-[#2d4631] text-white py-20 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white bg-opacity-20 rounded-full mb-6 animate-pulse">
            <Rocket className="w-10 h-10" />
          </div>
          <h1 className="text-5xl font-bold mb-4">Coming Soon</h1>
          <p className="text-xl text-amber-100 max-w-2xl mx-auto mb-8">
            Exciting new features in development! Vote for what you want to see first and get notified when they launch.
          </p>

          <div className="flex flex-wrap justify-center gap-8 mb-8">
            <div className="text-center">
              <p className="text-4xl font-bold">{roadmapFeatures.length}</p>
              <p className="text-amber-100">Features Planned</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold">{roadmapFeatures.filter(f => f.status === 'in-progress').length}</p>
              <p className="text-amber-100">In Progress</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold">{roadmapFeatures.filter(f => f.status === 'launched').length}</p>
              <p className="text-amber-100">Launched</p>
            </div>
          </div>

          {!subscribed ? (
            <form onSubmit={handleSubscribe} className="max-w-md mx-auto">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email for updates"
                  required
                  className="flex-1 px-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-white"
                />
                <button
                  type="submit"
                  className="px-6 py-3 bg-white text-[#3D5F42] font-semibold rounded-lg hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Bell className="w-5 h-5" />
                  Notify Me
                </button>
              </div>
            </form>
          ) : (
            <div className="max-w-md mx-auto bg-white bg-opacity-20 rounded-lg p-4">
              <p className="flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Thanks! We'll notify you when features launch.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-1" />
              Filter by Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
            >
              {roadmapCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Filter by Timeline
            </label>
            <select
              value={selectedPhase || ''}
              onChange={(e) => setSelectedPhase(e.target.value || null)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
            >
              <option value="">All Phases</option>
              {phases.map(phase => (
                <option key={phase} value={phase}>{phase}</option>
              ))}
            </select>
          </div>
        </div>

        {featuresByPhase.map(({ phase, features }) => (
          features.length > 0 && (
            <div key={phase} className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-200 to-transparent"></div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-[#3D5F42]" />
                  {phase}
                </h2>
                <div className="flex-1 h-px bg-gradient-to-l from-transparent via-amber-200 to-transparent"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {features.map(feature => (
                  <div
                    key={feature.id}
                    className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="text-4xl">{feature.icon}</div>
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">{feature.title}</h3>
                            <span className="text-sm text-gray-500">{feature.category}</span>
                          </div>
                        </div>
                        {getStatusBadge(feature.status)}
                      </div>

                      <p className="text-gray-600 mb-4">{feature.description}</p>

                      <div className="mb-4">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Benefits:</p>
                        <ul className="space-y-1">
                          {feature.benefits.slice(0, 3).map((benefit, idx) => (
                            <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                              {benefit}
                            </li>
                          ))}
                        </ul>
                        {feature.benefits.length > 3 && (
                          <p className="text-xs text-gray-500 mt-1">
                            +{feature.benefits.length - 3} more benefits
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => handleVote(feature.id)}
                        className={`w-full py-2 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                          votedFeatures.has(feature.id)
                            ? 'bg-red-500 text-white hover:bg-red-600'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <Heart
                          className={`w-5 h-5 ${votedFeatures.has(feature.id) ? 'fill-current' : ''}`}
                        />
                        {votedFeatures.has(feature.id) ? 'Voted!' : 'Vote for this feature'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ))}

        {filteredFeatures.length === 0 && (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Filter className="w-10 h-10 text-gray-400" />
            </div>
            <p className="text-gray-500 text-lg">No features found for this filter combination.</p>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-r from-[#3D5F42] to-[#2d4631] text-white py-12 px-6 mt-12">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-3xl font-bold mb-4">Have a Feature Request?</h3>
          <p className="text-lg text-amber-100 mb-6">
            We're building Ebenezer for YOU. Tell us what features would make your farm management easier!
          </p>
          <button className="px-8 py-3 bg-white text-[#3D5F42] font-bold rounded-lg hover:bg-amber-50 transition-colors inline-flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Submit Feature Request
          </button>
        </div>
      </div>
    </div>
  );
}
