import { useState } from 'react';
import { ChevronRight, ChevronLeft, Check, Building2, MapPin, Target, Sprout } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { SUPPORTED_COUNTRIES, getCurrencyForCountry } from '../../utils/currency';

interface OnboardingWizardProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'farm' | 'location' | 'goals' | 'complete';

const GOALS = [
  { id: 'profit',     label: 'Maximize Profit',     desc: 'Track costs closely, optimize feed conversion', emoji: '💰' },
  { id: 'growth',     label: 'Scale My Farm',        desc: 'Add more flocks, expand operations',            emoji: '📈' },
  { id: 'efficiency', label: 'Improve Efficiency',   desc: 'Reduce mortality, streamline daily tasks',      emoji: '⚡' },
  { id: 'quality',    label: 'Premium Quality',       desc: 'Focus on bird health and product quality',      emoji: '🌟' },
];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { user, currentFarm, refreshAuth } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [farmName, setFarmName] = useState('');
  const [country, setCountry] = useState('Cameroon');
  const [city, setCity] = useState('');
  const [regionState, setRegionState] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState<string>('profit');

  const steps: Step[] = ['welcome', 'farm', 'location', 'goals', 'complete'];
  const currentIndex = steps.indexOf(currentStep);
  const progress = (currentIndex / (steps.length - 1)) * 100;

  const handleSkip = async () => {
    if (!user) return;
    try {
      await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id);
      if (refreshAuth) await refreshAuth();
      onComplete();
    } catch (err) {
      console.error('Skip onboarding error:', err);
      onComplete();
    }
  };

  const handleNext = async () => {
    setError('');
    if (currentStep === 'farm' && !farmName.trim()) {
      setError('Please enter your farm name');
      return;
    }
    if (currentStep === 'goals') {
      await saveOnboardingData();
      return;
    }
    const nextIndex = currentIndex + 1;
    if (nextIndex < steps.length) setCurrentStep(steps[nextIndex]);
  };

  const handleBack = () => {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) setCurrentStep(steps[prevIndex]);
  };

  const saveOnboardingData = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const currencyCode = getCurrencyForCountry(country);
      let farmId = currentFarm?.id;

      if (!farmId) {
        const { data: newFarm, error: farmError } = await supabase
          .from('farms')
          .insert({ name: farmName, owner_id: user.id, country, currency_code: currencyCode, city: city || null, region_state: regionState || null })
          .select()
          .single();
        if (farmError) throw farmError;
        farmId = newFarm.id;
        await supabase.from('farm_members').insert({ farm_id: farmId, user_id: user.id, role: 'owner', is_active: true });
      } else {
        await supabase
          .from('farms')
          .update({ name: farmName, country, currency_code: currencyCode, city: city || null, region_state: regionState || null, updated_at: new Date().toISOString() })
          .eq('id', farmId);
      }

      await supabase
        .from('profiles')
        .update({ onboarding_completed: true, primary_goal: primaryGoal, farm_name: farmName, country, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      await refreshAuth?.();
      setCurrentStep('complete');
    } catch (err: any) {
      console.error('Onboarding error:', err);
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-[#3D5F42]/10 rounded-full flex items-center justify-center">
              <Sprout className="w-10 h-10 text-[#3D5F42]" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Welcome to Edentrack</h2>
            <p className="text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
              Your complete poultry farm management tool. Let's get your farm set up in 3 quick steps.
            </p>
            <div className="flex justify-center gap-6 text-sm text-gray-500 mb-8">
              {[['Track flocks', '🐔'], ['Manage sales', '💵'], ['Grow faster', '📊']].map(([label, emoji]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span>{emoji}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <button onClick={handleSkip} className="text-sm text-gray-400 hover:text-gray-600 underline transition-colors">
              Skip setup for now
            </button>
          </div>
        );

      case 'farm':
        return (
          <div>
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-7 h-7 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Name your farm</h2>
              <p className="text-gray-500 mt-1">What would you like to call it?</p>
            </div>
            <div className="max-w-md mx-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Farm Name *</label>
                <input
                  type="text"
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  placeholder="e.g., Sunrise Poultry Farm"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] outline-none transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] outline-none transition-all bg-white"
                >
                  {SUPPORTED_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1.5">Currency: {getCurrencyForCountry(country)}</p>
              </div>
            </div>
          </div>
        );

      case 'location':
        return (
          <div>
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-7 h-7 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Where is your farm?</h2>
              <p className="text-gray-500 mt-1">Optional — helps with supplier recommendations</p>
            </div>
            <div className="max-w-md mx-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">City / Town</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g., Douala"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Region / State</label>
                <input
                  type="text"
                  value={regionState}
                  onChange={(e) => setRegionState(e.target.value)}
                  placeholder="e.g., Littoral"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] outline-none transition-all"
                />
              </div>
            </div>
          </div>
        );

      case 'goals':
        return (
          <div>
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Target className="w-7 h-7 text-purple-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">What's your main goal?</h2>
              <p className="text-gray-500 mt-1">We'll tailor your dashboard to focus on what matters most</p>
            </div>
            <div className="max-w-md mx-auto space-y-3">
              {GOALS.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => setPrimaryGoal(goal.id)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    primaryGoal === goal.id
                      ? 'border-[#3D5F42] bg-[#3D5F42]/5'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{goal.emoji}</span>
                    <div>
                      <div className="font-semibold text-gray-900">{goal.label}</div>
                      <div className="text-sm text-gray-500">{goal.desc}</div>
                    </div>
                    {primaryGoal === goal.id && (
                      <Check className="w-5 h-5 text-[#3D5F42] ml-auto flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">You're all set!</h2>
            <p className="text-gray-500 mb-3 max-w-md mx-auto leading-relaxed">
              <strong className="text-gray-800">{farmName}</strong> is ready. Your next step is to create your first flock — that's how all KPIs, reports, and AI insights come to life.
            </p>
            <p className="text-sm text-gray-400 mb-8">The app tour will walk you through everything once you land on the dashboard.</p>
            <button
              onClick={onComplete}
              className="px-8 py-3 bg-[#3D5F42] text-white rounded-xl font-semibold hover:bg-[#2F4A34] transition-colors"
            >
              Go to Dashboard →
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col">
      {currentStep !== 'welcome' && currentStep !== 'complete' && (
        <div className="px-6 py-4">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-500">Step {currentIndex} of 3</span>
              <span className="text-xs text-gray-400">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-[#3D5F42] transition-all duration-500 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {error && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}
          <div key={currentStep}>{renderStep()}</div>
        </div>
      </div>

      {currentStep !== 'complete' && (
        <div className="px-6 py-5 border-t border-gray-100 bg-white">
          <div className="max-w-lg mx-auto flex justify-between items-center">
            {currentStep !== 'welcome' ? (
              <button onClick={handleBack} className="px-5 py-2.5 text-gray-500 font-medium hover:text-gray-800 flex items-center gap-1.5 transition-colors">
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : <div />}
            <button
              onClick={handleNext}
              disabled={loading}
              className="px-7 py-2.5 bg-[#3D5F42] text-white rounded-xl font-semibold hover:bg-[#2F4A34] transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {loading ? 'Saving...' : currentStep === 'goals' ? 'Complete Setup' : currentStep === 'welcome' ? 'Get Started' : 'Continue'}
              {!loading && currentStep !== 'goals' && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
