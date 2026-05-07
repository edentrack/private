/**
 * OnboardingChoice — the post-signup screen where the user picks how to
 * set up their farm: a 5-minute chat with Eden, or the existing 7-step
 * form wizard.
 *
 * Per docs/BRIEF_PHASE_6_CONVERSATIONAL_ONBOARDING.md (PR #ONBO-B).
 *
 * Path persistence: writes profiles.onboarding_status = 'chose_chat' or
 * 'chose_form'. App.tsx routing reads that on next render and dispatches
 * to the right flow. Reload mid-decision returns to whichever flow they
 * picked (state survives the reload).
 *
 * Mobile-first: full-viewport on phone, two big tappable cards. ≥44px
 * tap targets per the Phase 3 mobile UX brief.
 */

import { useState } from 'react';
import { MessageCircle, ClipboardList, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  onChose: () => void;
}

export function OnboardingChoice({ onChose }: Props) {
  const { user, refreshSession } = useAuth();
  const { showToast } = useToast();
  const [pending, setPending] = useState<null | 'chat' | 'form'>(null);

  const choose = async (choice: 'chat' | 'form') => {
    if (!user || pending) return;
    setPending(choice);
    const { error } = await supabase
      .from('profiles')
      .update({ onboarding_status: choice === 'chat' ? 'chose_chat' : 'chose_form' })
      .eq('id', user.id);
    if (error) {
      showToast(`Could not save your choice: ${error.message}`, 'error');
      setPending(null);
      return;
    }
    if (refreshSession) {
      await refreshSession();
    }
    onChose();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block text-4xl mb-3" aria-hidden>
            🌾
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to EdenTrack</h1>
          <p className="text-gray-600 text-sm">How would you like to set up your farm?</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => choose('chat')}
            disabled={!!pending}
            className="w-full bg-white border-2 border-emerald-200 hover:border-emerald-400 active:border-emerald-500 rounded-2xl p-5 text-left transition-all disabled:opacity-60 min-h-[88px] flex items-start gap-3"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
              {pending === 'chat' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <MessageCircle className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-semibold text-gray-900">Chat with Eden</h2>
                <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  Recommended
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Tell me about your farm in your own words. I'll set everything up. About 5 minutes.
              </p>
            </div>
          </button>

          <button
            onClick={() => choose('form')}
            disabled={!!pending}
            className="w-full bg-white border-2 border-gray-200 hover:border-gray-400 active:border-gray-500 rounded-2xl p-5 text-left transition-all disabled:opacity-60 min-h-[88px] flex items-start gap-3"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-700 text-white flex items-center justify-center">
              {pending === 'form' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ClipboardList className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Fill out a form</h2>
              <p className="text-sm text-gray-600">Step-by-step setup wizard. 7 short steps.</p>
            </div>
          </button>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6 flex items-center justify-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Either way, you can switch later.
        </p>
      </div>
    </div>
  );
}

export default OnboardingChoice;
