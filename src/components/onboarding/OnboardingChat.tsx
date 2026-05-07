/**
 * OnboardingChat — the conversational onboarding flow.
 *
 * Per docs/BRIEF_PHASE_6_CONVERSATIONAL_ONBOARDING.md (PR #ONBO-C).
 *
 * Eden walks a brand-new user through farm setup in a 5-minute chat.
 * Each user message hits /api/ai-chat with `onboarding_mode: true`. Eden's
 * reply may contain [LOG] blocks (CREATE_FARM, CREATE_FLOCK/POND/RABBITRY,
 * LOG_STOCKING, ONBOARDING_COMPLETE, SWITCH_TO_FORM) that auto-execute —
 * NO confirmation card, since each step is part of a continuous flow.
 *
 * Design constraints:
 * - Full-viewport (no nav, no header)
 * - Mobile-first; one-handed thumb friendly
 * - Always-visible "Skip — go to form" at the top
 * - Inline "✓ Saved" pills next to Eden's messages when actions execute
 * - On ONBOARDING_COMPLETE: flip onboarding_status='completed', refresh
 *   session, the App.tsx routing then drops the user on the dashboard.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, Send, CheckCircle2, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { EdenAvatarAnimated } from '../ai/EdenAvatarAnimated';
import { trackEvent } from '../../utils/analytics';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  pills?: string[]; // small "✓ Created farm 'X'" badges shown inline under an assistant message
  timestamp: number;
}

interface Action {
  type:
    | 'CREATE_FARM'
    | 'CREATE_FLOCK'
    | 'CREATE_POND'
    | 'CREATE_RABBITRY'
    | 'LOG_STOCKING'
    | 'LOG_MORTALITY'
    | 'LOG_EGGS'
    | 'LOG_FEED_USAGE'
    | 'ONBOARDING_COMPLETE'
    | 'SWITCH_TO_FORM';
  // CREATE_FARM
  name?: string;
  species?: 'poultry' | 'aquaculture' | 'rabbits';
  country?: string;
  currency_code?: string;
  // CREATE_FLOCK / POND / RABBITRY
  farm_name?: string;
  count?: number;
  // LOG_STOCKING
  flock_name?: string;
  fingerling_count?: number;
  stocked_at?: string;
  log_date?: string;
  // LOG_MORTALITY / LOG_EGGS
  cause?: string;
  small_eggs?: number;
  medium_eggs?: number;
  large_eggs?: number;
  jumbo_eggs?: number;
  // LOG_FEED_USAGE
  feed_type?: string;
  bags_used?: number;
}

interface Props {
  onComplete: () => void;
  onSwitchToForm: () => void;
}

function parseLogBlocks(text: string): Action[] {
  const blocks: Action[] = [];
  const re = /\[LOG\]\s*([\s\S]*?)\s*\[\/LOG\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[1].trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.type) {
        blocks.push(parsed as Action);
      }
    } catch {
      /* skip malformed */
    }
  }
  return blocks;
}

function stripLogBlocks(text: string): string {
  return text.replace(/\[LOG\][\s\S]*?\[\/LOG\]/gi, '').replace(/\[LOG\][\s\S]*$/i, '').trim();
}

export function OnboardingChat({ onComplete, onSwitchToForm }: Props) {
  const { user, refreshSession } = useAuth();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content: t('onboarding.chat.first_message'),
      timestamp: Date.now(),
    },
  ]);
  const [firstActionFired, setFirstActionFired] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [completing, setCompleting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const flipOnboardingStatus = async (
    status: 'completed' | 'chose_form'
  ): Promise<boolean> => {
    if (!user) return false;
    const update = status === 'completed'
      ? { onboarding_status: 'completed', onboarding_completed: true }
      : { onboarding_status: 'chose_form' };
    const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
    if (error) {
      showToast(`${t('onboarding.chat.save_failed')}: ${error.message}`, 'error');
      return false;
    }
    return true;
  };

  /**
   * Execute the action types Eden may emit during onboarding. Inline
   * (instead of using AIAssistantPage's giant executeLogAction) so this
   * page doesn't drag in the whole AI chat surface — and because at the
   * time of CREATE_FARM the user has NO currentFarm yet, which the main
   * executor assumes.
   */
  const executeAction = async (
    action: Action
  ): Promise<{ pill: string | null; complete: boolean; switchToForm: boolean }> => {
    if (!user) return { pill: null, complete: false, switchToForm: false };

    if (action.type === 'CREATE_FARM') {
      const farmName = (action.name || '').trim();
      if (!farmName) return { pill: null, complete: false, switchToForm: false };
      const { data: newFarm, error } = await supabase
        .from('farms')
        .insert({
          name: farmName,
          owner_id: user.id,
          farm_type: action.species || 'poultry',
          country: action.country || null,
          currency_code: action.currency_code || null,
        })
        .select('id, name')
        .single();
      if (error || !newFarm) {
        return { pill: `❌ Could not create farm (${error?.message ?? 'unknown'})`, complete: false, switchToForm: false };
      }
      // Defensive owner row.
      await supabase
        .from('farm_members')
        .insert({ farm_id: newFarm.id, user_id: user.id, role: 'owner' })
        .then(({ error }) => {
          if (error && !/duplicate|already/i.test(error.message)) {
            console.warn('farm_members insert warning:', error.message);
          }
        });
      return { pill: `✓ Created ${newFarm.name}`, complete: false, switchToForm: false };
    }

    if (
      action.type === 'CREATE_FLOCK' ||
      action.type === 'CREATE_POND' ||
      action.type === 'CREATE_RABBITRY'
    ) {
      const farmName = (action.farm_name || '').trim();
      const entityName = (action.name || '').trim();
      if (!farmName || !entityName) {
        return { pill: null, complete: false, switchToForm: false };
      }
      const { data: farm } = await supabase
        .from('farms')
        .select('id')
        .ilike('name', farmName)
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!farm) {
        return { pill: `❌ Couldn't find farm "${farmName}"`, complete: false, switchToForm: false };
      }
      const flockType =
        action.type === 'CREATE_POND'
          ? 'Catfish'
          : action.type === 'CREATE_RABBITRY'
          ? 'Rabbitry'
          : 'Broiler';
      const initialCount = Number(action.count) || 0;
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from('flocks').insert({
        farm_id: farm.id,
        user_id: user.id,
        name: entityName,
        type: flockType,
        initial_count: initialCount,
        current_count: initialCount,
        start_date: today,
        arrival_date: today,
        status: 'active',
      });
      if (error) {
        return { pill: `❌ Couldn't create ${entityName}: ${error.message}`, complete: false, switchToForm: false };
      }
      const noun =
        action.type === 'CREATE_POND' ? 'pond' : action.type === 'CREATE_RABBITRY' ? 'rabbitry' : 'flock';
      return {
        pill: `✓ Set up ${noun} "${entityName}"${initialCount > 0 ? ` with ${initialCount} animals` : ''}`,
        complete: false,
        switchToForm: false,
      };
    }

    if (action.type === 'LOG_STOCKING') {
      const flockName = (action.flock_name || '').trim();
      if (!flockName) return { pill: null, complete: false, switchToForm: false };
      const { data: flock } = await supabase
        .from('flocks')
        .select('id, farm_id')
        .ilike('name', flockName)
        .limit(1)
        .maybeSingle();
      if (!flock) return { pill: null, complete: false, switchToForm: false };
      const stockedAt = action.stocked_at || action.log_date || new Date().toISOString().slice(0, 10);
      await supabase.from('stocking_events').insert({
        farm_id: flock.farm_id,
        flock_id: flock.id,
        stocked_at: stockedAt,
        species: action.species || 'other',
        fingerling_count: action.fingerling_count || 0,
      });
      return { pill: `✓ Logged stocking on ${stockedAt}`, complete: false, switchToForm: false };
    }

    if (action.type === 'LOG_MORTALITY') {
      const flockName = (action.flock_name || '').trim();
      if (!flockName) return { pill: null, complete: false, switchToForm: false };
      const { data: flock } = await supabase
        .from('flocks')
        .select('id, farm_id, current_count')
        .ilike('name', flockName)
        .limit(1)
        .maybeSingle();
      if (!flock) return { pill: null, complete: false, switchToForm: false };
      const count = Number(action.count) || 0;
      const date = action.log_date || new Date().toISOString().slice(0, 10);
      await supabase.from('mortality_logs').insert({
        farm_id: flock.farm_id,
        flock_id: flock.id,
        event_date: date,
        count,
        cause: action.cause || 'unknown',
      });
      if (count > 0) {
        await supabase
          .from('flocks')
          .update({ current_count: Math.max(0, (flock.current_count || 0) - count) })
          .eq('id', flock.id);
      }
      return { pill: `✓ Logged ${count} losses`, complete: false, switchToForm: false };
    }

    if (action.type === 'LOG_EGGS') {
      const flockName = (action.flock_name || '').trim();
      if (!flockName) return { pill: null, complete: false, switchToForm: false };
      const { data: flock } = await supabase
        .from('flocks')
        .select('id, farm_id')
        .ilike('name', flockName)
        .limit(1)
        .maybeSingle();
      if (!flock) return { pill: null, complete: false, switchToForm: false };
      const small = action.small_eggs || 0;
      const medium = action.medium_eggs || 0;
      const large = action.large_eggs || 0;
      const jumbo = action.jumbo_eggs || 0;
      const total = small + medium + large + jumbo;
      const date = action.log_date || new Date().toISOString().slice(0, 10);
      await supabase.from('egg_collections').insert({
        farm_id: flock.farm_id,
        flock_id: flock.id,
        collection_date: date,
        collected_on: date,
        small_eggs: small,
        medium_eggs: medium,
        large_eggs: large,
        jumbo_eggs: jumbo,
        total_eggs: total,
      });
      return { pill: `✓ Logged ${total} eggs`, complete: false, switchToForm: false };
    }

    if (action.type === 'LOG_FEED_USAGE') {
      // Onboarding feed-logging is best-effort: if there's no feed_stock
      // record yet (likely on a fresh farm) we just emit a pill — don't
      // block onboarding on missing inventory.
      return {
        pill: `✓ Noted ${action.bags_used ?? '?'} bags of ${action.feed_type ?? 'feed'}`,
        complete: false,
        switchToForm: false,
      };
    }

    if (action.type === 'ONBOARDING_COMPLETE') {
      return { pill: null, complete: true, switchToForm: false };
    }

    if (action.type === 'SWITCH_TO_FORM') {
      return { pill: null, complete: false, switchToForm: true };
    }

    return { pill: null, complete: false, switchToForm: false };
  };

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending || completing) return;

    const newUserMsg: Msg = { role: 'user', content, timestamp: Date.now() };
    setMessages((prev) => [...prev, newUserMsg]);
    setInput('');
    setSending(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not signed in');

      const history = [...messages, newUserMsg].map((m) => ({ role: m.role, content: m.content }));
      const resp = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          onboarding_mode: true,
          include_context: false,
          messages: history,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error || `Server error ${resp.status}`);
      }
      const data = await resp.json();
      const replyText: string = data.message || '';
      // The ai-chat edge function strips [LOG]…[/LOG] blocks from
      // data.message and returns them as data.logAction (single) or
      // data.bulkLogActions (multiple). Parse the message AS WELL for
      // belt-and-braces (handles older deploys), then merge.
      const inlineActions = parseLogBlocks(replyText);
      const serverActions: Action[] = [];
      if (data.logAction && typeof data.logAction === 'object') {
        serverActions.push(data.logAction as Action);
      }
      if (Array.isArray(data.bulkLogActions)) {
        for (const a of data.bulkLogActions) {
          if (a && typeof a === 'object') serverActions.push(a as Action);
        }
      }
      const actions = [...serverActions, ...inlineActions];

      const pills: string[] = [];
      let shouldComplete = false;
      let shouldSwitch = false;
      for (const action of actions) {
        const result = await executeAction(action);
        if (result.pill) pills.push(result.pill);
        if (result.complete) shouldComplete = true;
        if (result.switchToForm) shouldSwitch = true;
      }
      // Fire the "first action executed" event once per session — this is
      // the analytics signal that the user got to value, the 90-second
      // goal in the brief.
      if (pills.length > 0 && !firstActionFired) {
        setFirstActionFired(true);
        trackEvent('onboarding_first_action_executed', {
          user_id: user?.id ?? null,
          action_type: actions[0]?.type,
        });
      }

      const visibleText = stripLogBlocks(replyText);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: visibleText || (pills.length > 0 ? '' : "I'm here — what's next?"),
          pills: pills.length > 0 ? pills : undefined,
          timestamp: Date.now(),
        },
      ]);

      if (shouldSwitch) {
        trackEvent('onboarding_chat_to_form_switched', { user_id: user?.id ?? null });
        if (await flipOnboardingStatus('chose_form')) {
          if (refreshSession) await refreshSession();
          onSwitchToForm();
        }
      } else if (shouldComplete) {
        setCompleting(true);
        if (await flipOnboardingStatus('completed')) {
          trackEvent('onboarding_chat_completed', { user_id: user?.id ?? null });
          if (refreshSession) await refreshSession();
          showToast(t('onboarding.chat.complete_toast'), 'success');
          onComplete();
        } else {
          setCompleting(false);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, something went wrong: ${msg}`, timestamp: Date.now() },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSkip = async () => {
    trackEvent('onboarding_chat_to_form_switched', {
      user_id: user?.id ?? null,
      reason: 'manual_skip',
    });
    if (await flipOnboardingStatus('chose_form')) {
      if (refreshSession) await refreshSession();
      onSwitchToForm();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50 to-white">
      {/* Sticky top bar with Skip CTA */}
      <div className="flex-shrink-0 bg-white/80 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <EdenAvatarAnimated size="sm" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 truncate">{t('onboarding.chat.header_title')}</h1>
            <p className="text-xs text-gray-500 truncate">{t('onboarding.chat.header_subtitle')}</p>
          </div>
        </div>
        <button
          onClick={handleSkip}
          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[36px]"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          {t('onboarding.chat.skip_button')}
        </button>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-w-2xl mx-auto w-full">
        {messages.map((m, idx) => (
          <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-900'
              }`}
            >
              {m.role === 'assistant' && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <EdenAvatarAnimated size="sm" />
                  <span className="text-[11px] font-bold text-emerald-700 tracking-wide">Eden</span>
                </div>
              )}
              {m.content && (
                <div
                  className={`prose prose-sm max-w-none prose-p:my-1 prose-strong:font-semibold ${
                    m.role === 'user' ? 'prose-invert' : ''
                  }`}
                >
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              )}
              {m.pills && m.pills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.pills.map((pill, p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {pill.replace(/^✓\s*/, '')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5 inline-flex items-center gap-2 text-gray-600 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              {t('onboarding.chat.thinking')}
            </div>
          </div>
        )}
        {completing && (
          <div className="flex justify-center">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5 inline-flex items-center gap-2 text-emerald-700 text-sm">
              <ArrowRight className="w-4 h-4" />
              {t('onboarding.chat.wrapping_up')}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={t('onboarding.chat.input_placeholder')}
            rows={1}
            disabled={sending || completing}
            className="flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 min-h-[48px] max-h-32"
          />
          <button
            onClick={() => sendMessage()}
            disabled={sending || completing || !input.trim()}
            className="flex-shrink-0 w-12 h-12 inline-flex items-center justify-center rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingChat;
