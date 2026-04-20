import { useState } from 'react';
import { ChevronRight, ChevronLeft, Check, Building2, MapPin, Target } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { SUPPORTED_COUNTRIES, getCurrencyForCountry } from '../../utils/currency';

interface OnboardingWizardProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'farm' | 'location' | 'goals' | 'complete';

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { user, currentFarm, refreshAuth } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSkip = async () => {
    if (!user) return;

    try {
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);

      if (refreshAuth) await refreshAuth();
      onComplete();
    } catch (err) {
      console.error('Skip onboarding error:', err);
    }
  };

  const [farmName, setFarmName] = useState('');
  const [country, setCountry] = useState('Cameroon');
  const [city, setCity] = useState('');
  const [regionState, setRegionState] = useState('');

  const [primaryGoal, setPrimaryGoal] = useState<'profit' | 'growth' | 'efficiency' | 'quality'>('profit');

  const steps: Step[] = ['welcome', 'farm', 'location', 'goals', 'complete'];
  const currentIndex = steps.indexOf(currentStep);
  const progress = ((currentIndex) / (steps.length - 1)) * 100;

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
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex]);
    }
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
          .insert({
            name: farmName,
            owner_id: user.id,
            country,
            currency_code: currencyCode,
            city: city || null,
            region_state: regionState || null,
          })
          .select()
          .single();

        if (farmError) throw farmError;
        farmId = newFarm.id;

        await supabase.from('farm_members').insert({
          farm_id: farmId,
          user_id: user.id,
          role: 'owner',
          is_active: true,
        });
      } else {
        await supabase
          .from('farms')
          .update({
            name: farmName,
            country,
            currency_code: currencyCode,
            city: city || null,
            region_state: regionState || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', farmId);
      }

      // Flock creation removed from onboarding - users can create flocks later

      await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          primary_goal: primaryGoal,
          farm_name: farmName,
          country,
          updated_at: new Date().toISOString(),
        })
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
    const content = (() => {
      switch (currentStep) {
        case 'welcome':
          return (
            <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-neon-300/50 to-neon-500/30 rounded-full blur-2xl" />
              <img src="/image.png" alt="Chicken" className="relative w-full h-full object-contain" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome to Ebenezer Farm</h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Let's get your farm set up in just a few steps. We'll help you track your flocks,
              manage expenses, and grow your poultry business.
            </p>
            <div className="flex justify-center gap-4 text-sm text-gray-500 mb-6">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Track flocks
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Manage sales
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                View analytics
              </div>
            </div>
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Skip for now
            </button>
          </div>
        );

      case 'farm':
        return (
          <div>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Name Your Farm</h2>
              <p className="text-gray-600">What would you like to call your farm?</p>
            </div>
            <div className="max-w-md mx-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Farm Name</label>
                <input
                  type="text"
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  placeholder="e.g., Sunrise Poultry Farm"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500"
                >
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Currency will be set to {getCurrencyForCountry(country)}
                </p>
              </div>
            </div>
          </div>
        );

      case 'location':
        return (
          <div>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Farm Location</h2>
              <p className="text-gray-600">Where is your farm located? (Optional)</p>
            </div>
            <div className="max-w-md mx-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City/Town</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g., Douala"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Region/State</label>
                <input
                  type="text"
                  value={regionState}
                  onChange={(e) => setRegionState(e.target.value)}
                  placeholder="e.g., Littoral"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500"
                />
              </div>
              <p className="text-sm text-gray-500 text-center">
                You can add more details later in Settings
              </p>
            </div>
          </div>
        );

      case 'goals':
        return (
          <div>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-purple-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">What's Your Main Goal?</h2>
              <p className="text-gray-600">This helps us customize your experience</p>
            </div>
            <div className="max-w-md mx-auto space-y-3">
              {[
                { id: 'profit', label: 'Maximize Profit', desc: 'Track costs closely, optimize feed conversion' },
                { id: 'growth', label: 'Scale My Farm', desc: 'Add more flocks, expand operations' },
                { id: 'efficiency', label: 'Improve Efficiency', desc: 'Reduce mortality, streamline tasks' },
                { id: 'quality', label: 'Premium Quality', desc: 'Focus on bird health and product quality' },
              ].map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => setPrimaryGoal(goal.id as any)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    primaryGoal === goal.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold text-gray-900">{goal.label}</div>
                  <div className="text-sm text-gray-500">{goal.desc}</div>
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
            <h2 className="text-3xl font-bold text-gray-900 mb-4">You're All Set!</h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Your farm is ready to go. Start tracking your flock's progress, manage tasks,
              and watch your business grow.
            </p>
            <button
              onClick={onComplete}
              className="btn-primary px-8 py-3"
            >
              Go to Dashboard
            </button>
          </div>
        );
        default:
          return null;
      }
    })();

    return (
      <div key={currentStep}>
        {content}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col">
      {currentStep !== 'welcome' && currentStep !== 'complete' && (
        <div className="px-6 py-4">
          <div className="max-w-2xl mx-auto">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-neon-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2 text-center">
              Step {currentIndex} of {steps.length - 2}
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}
          {renderStep()}
        </div>
      </div>

      {currentStep !== 'complete' && (
        <div className="px-6 py-6 border-t border-gray-200 bg-white">
          <div className="max-w-2xl mx-auto flex justify-between">
            {currentStep !== 'welcome' ? (
              <button
                onClick={handleBack}
                className="px-6 py-3 text-gray-600 font-medium hover:text-gray-900 flex items-center gap-2"
              >
                <ChevronLeft className="w-5 h-5" />
                Back
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={handleNext}
              disabled={loading}
              className="btn-primary px-8 py-3 flex items-center gap-2"
            >
              {loading ? (
                'Saving...'
              ) : currentStep === 'goals' ? (
                'Complete Setup'
              ) : (
                <>
                  {currentStep === 'welcome' ? 'Get Started' : 'Continue'}
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
