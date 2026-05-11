import { useEffect } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import HeroSection from './HeroSection';
import PricingSection from './PricingSection';
import { useAuth } from '../../contexts/AuthContext';
import { getTrialDaysRemaining } from '../../utils/planGating';

const SEEN_LANDING_FLAG = 'eden_seen_welcome_after_signup';

interface Props {
  onContinue: () => void;   // Called when user wants to enter the app
}

/**
 * Shown to brand-new accounts after sign-up. The user has just created
 * their account; before dropping them into the app, we want them to see
 * what the product is about and what each plan offers, so they can
 * either pay now or decide to start on Free / their 30-day Grower trial.
 *
 * The screen wraps the existing public landing-page content with a
 * sticky "Continue to my account" CTA at the top, plus a personalized
 * banner. After the user dismisses it (or after their first visit
 * persists the localStorage flag), they go straight to the dashboard
 * on subsequent logins.
 */
export default function WelcomeAfterSignup({ onContinue }: Props) {
  const { profile } = useAuth();
  const trialDays = getTrialDaysRemaining(profile);

  useEffect(() => {
    document.title = 'Welcome to EdenTrack';
  }, []);

  const handleContinue = () => {
    try {
      localStorage.setItem(SEEN_LANDING_FLAG, 'true');
    } catch { /* localStorage unavailable in some Capacitor flows */ }
    onContinue();
  };

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="min-h-screen bg-white">

      {/* Sticky welcome banner with Continue CTA */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-yellow-400 to-amber-400 border-b border-yellow-500 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-gray-900">
            <Sparkles className="w-5 h-5 flex-shrink-0" />
            <div>
              <span className="font-bold">Welcome, {firstName}!</span>
              {trialDays > 0 && (
                <span className="text-sm ml-2">
                  You have {trialDays} day{trialDays === 1 ? '' : 's'} of Grower features free.
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleContinue}
            className="bg-gray-900 text-white px-5 py-2 rounded-full font-semibold text-sm hover:bg-gray-800 transition-all flex items-center gap-2 whitespace-nowrap"
          >
            Continue to my account
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Reuse the public landing components so messaging stays consistent */}
      <HeroSection onGetStarted={handleContinue} />
      <PricingSection onGetStarted={handleContinue} />

      {/* Footer reinforcement */}
      <div className="bg-gray-50 border-t border-gray-200 py-12">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-3">Ready to start?</h3>
          <p className="text-gray-600 mb-6">
            Your 30 days of Grower features are already active. Jump in and let Eden start working for you.
          </p>
          <button
            onClick={handleContinue}
            className="bg-gray-900 text-white px-8 py-3 rounded-full font-semibold hover:bg-gray-800 transition-all inline-flex items-center gap-2"
          >
            Continue to my account
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export { SEEN_LANDING_FLAG };
