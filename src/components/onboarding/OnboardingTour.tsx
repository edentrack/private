import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ArrowRight, ArrowLeft, CheckCircle, Play } from 'lucide-react';

const STORAGE_KEY = 'onboarding_tour_completed';

interface Step {
  id: string;
  navigateTo?: string;
  target?: string;
  title: string;
  body: string;
  cta?: string;
  spotlightPad?: number;
  emoji?: string;
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    navigateTo: 'dashboard',
    emoji: '🌱',
    title: 'Welcome to Edentrack',
    body: "You're now managing your farm digitally. This 90-second tour shows you exactly where everything lives — no guessing, no confusion.",
    cta: 'Use the arrow keys or tap Next to continue.',
  },
  {
    id: 'flocks',
    navigateTo: 'flocks',
    target: '[data-tour="flock-header"]',
    emoji: '🐔',
    title: 'Everything starts with a Flock',
    body: "Create your first batch here — bird type (broiler or layer), arrival date, and count. Takes 30 seconds. Every KPI, report, and AI answer flows from a flock.",
    cta: "Tap 'Add Flock' after the tour to create your first batch.",
    spotlightPad: 16,
  },
  {
    id: 'dashboard',
    navigateTo: 'dashboard',
    target: '[data-tour="kpi-section"]',
    emoji: '📊',
    title: 'Your live farm snapshot',
    body: "These KPIs — laying rate, mortality, FCR, feed stock — update the moment you log anything. Check this every morning. Green = on track. Red = act now.",
    cta: 'Tap any KPI card to drill into details.',
    spotlightPad: 8,
  },
  {
    id: 'tasks',
    navigateTo: 'tasks',
    target: '[data-tour="task-header"]',
    emoji: '✅',
    title: 'Never miss a routine or vaccination',
    body: "Set up recurring tasks — vaccinations, water checks, cleaning — and Edentrack generates them every day. Workers mark done right from their phone.",
    cta: 'One missed vaccination can cost you an entire flock.',
  },
  {
    id: 'expenses',
    navigateTo: 'expenses',
    target: '[data-tour="expense-header"]',
    emoji: '💰',
    title: 'Track every franc spent here',
    body: "Log feed bags, medication, and chick purchases. Your feed stock updates automatically. You'll always know your cost per bird and your profit margin.",
    cta: 'Tip: use Smart Import to photograph a receipt instead of typing.',
  },
  {
    id: 'eden',
    navigateTo: 'ai-assistant',
    target: '[data-tour="ai-header"]',
    emoji: '🤖',
    title: 'Eden — your personal farm advisor',
    body: 'Ask Eden anything in plain language: "Log 5 deaths in Batch A" — "What\'s my FCR this week?" — "Why are my birds losing weight?" It reads your live farm data and can even extract records from receipt photos.',
    cta: 'Think of it as a vet, accountant, and agronomist — always available.',
  },
  {
    id: 'smart-import',
    navigateTo: 'smart-upload',
    target: '[data-tour="smart-import-header"]',
    emoji: '📷',
    title: 'Smart Import — photograph & import',
    body: 'Take a photo of any paper receipt or invoice. Smart Import extracts the data, shows you a preview, and saves it with one tap. No more manual entry for supplier invoices.',
    cta: 'Works with handwritten receipts too.',
  },
  {
    id: 'done',
    navigateTo: 'flocks',
    emoji: '🎉',
    title: "Tour complete — let's farm!",
    body: "You've seen the key features. Your first move: tap 'Add Flock' on this page to create your first batch. Everything else — KPIs, reports, AI insights — flows from there.",
    cta: 'You can replay this tour anytime from Settings.',
  },
];

/* ─── Geometry helpers ──────────────────────────────────────────────────── */
const DEFAULT_PAD = 12;
const TOOLTIP_W = 340;
const GAP = 18;

interface Rect { top: number; left: number; width: number; height: number }
type Side = 'top' | 'bottom' | 'left' | 'right' | 'center';
interface TPos { side: Side; top: number; left: number }

function calcTooltipPos(rect: Rect, pad: number): TPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sTop = rect.top - pad;
  const sLeft = rect.left - pad;
  const sRight = rect.left + rect.width + pad;
  const sBot = rect.top + rect.height + pad;
  const th = 280;

  if (sRight + GAP + TOOLTIP_W < vw)
    return { side: 'right', top: Math.max(GAP, Math.min(sTop + (rect.height + pad * 2) / 2 - th / 2, vh - th - GAP)), left: sRight + GAP };
  if (sLeft - GAP - TOOLTIP_W > 0)
    return { side: 'left', top: Math.max(GAP, Math.min(sTop + (rect.height + pad * 2) / 2 - th / 2, vh - th - GAP)), left: sLeft - GAP - TOOLTIP_W };
  if (sBot + GAP + th < vh)
    return { side: 'bottom', top: sBot + GAP, left: Math.max(GAP, Math.min(rect.left + rect.width / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - GAP)) };
  return { side: 'top', top: Math.max(GAP, sTop - GAP - th), left: Math.max(GAP, Math.min(rect.left + rect.width / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - GAP)) };
}

function arrowStyle(side: Side): React.CSSProperties {
  const base: React.CSSProperties = { position: 'absolute', width: 0, height: 0 };
  if (side === 'right')  return { ...base, left: -10, top: '50%', transform: 'translateY(-50%)', borderTop: '10px solid transparent', borderBottom: '10px solid transparent', borderRight: '10px solid white' };
  if (side === 'left')   return { ...base, right: -10, top: '50%', transform: 'translateY(-50%)', borderTop: '10px solid transparent', borderBottom: '10px solid transparent', borderLeft: '10px solid white' };
  if (side === 'bottom') return { ...base, top: -10, left: '50%', transform: 'translateX(-50%)', borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderBottom: '10px solid white' };
  return { ...base, bottom: -10, left: '50%', transform: 'translateX(-50%)', borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '10px solid white' };
}

/* ─── Main component ────────────────────────────────────────────────────── */
interface Props { onComplete: () => void; onNavigate?: (view: string) => void }

export function OnboardingTour({ onComplete, onNavigate }: Props) {
  const [step, setStep]           = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [phase, setPhase]         = useState<'out' | 'in'>('in');
  const [cardKey, setCardKey]     = useState(0);
  const rafRef = useRef<number>(0);

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const isFirst = step === 0;
  const pad     = current.spotlightPad ?? DEFAULT_PAD;

  const measureTarget = useCallback(() => {
    if (!current.target) { setTargetRect(null); return; }
    const el = document.querySelector(current.target);
    if (!el) { setTargetRect(null); return; }
    const r = el.getBoundingClientRect();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [current.target]);

  const goToStep = useCallback((next: number) => {
    if (next < 0 || next >= STEPS.length) return;
    setPhase('out');
    setTimeout(() => {
      const s = STEPS[next];
      if (s.navigateTo && onNavigate) onNavigate(s.navigateTo);
      setStep(next);
      setCardKey(k => k + 1);
      setTimeout(() => {
        setTargetRect(null);
        setTimeout(() => {
          if (s.target) {
            const el = document.querySelector(s.target);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                const r2 = document.querySelector(s.target!)?.getBoundingClientRect();
                if (r2) setTargetRect({ top: r2.top, left: r2.left, width: r2.width, height: r2.height });
              }, 200);
            }
          }
          setPhase('in');
        }, 380);
      }, 60);
    }, 200);
  }, [onNavigate]);

  useEffect(() => {
    const s = STEPS[0];
    if (s.navigateTo && onNavigate) onNavigate(s.navigateTo);
    setTimeout(() => setPhase('in'), 100);
  }, []); // eslint-disable-line

  useEffect(() => {
    const onResize = () => { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(measureTarget); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(rafRef.current); };
  }, [measureTarget]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); isLast ? finish() : goToStep(step + 1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goToStep(step - 1); }
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, isLast, goToStep]); // eslint-disable-line

  const finish = () => { localStorage.setItem(STORAGE_KEY, 'true'); onComplete(); };

  const sp = targetRect ? {
    top: targetRect.top - pad, left: targetRect.left - pad,
    width: targetRect.width + pad * 2, height: targetRect.height + pad * 2,
  } : null;

  const tpos: TPos = (sp && targetRect) ? calcTooltipPos(targetRect, pad) : { side: 'center', top: 0, left: 0 };
  const isCentered = !sp;
  const overlayOpacity = phase === 'in' ? 1 : 0;

  return (
    <>
      <style>{`
        @keyframes tour-glow {
          0%, 100% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.78), 0 0 0 3px rgba(80,200,120,0.6), 0 0 20px 6px rgba(80,200,120,0.35); }
          50%       { box-shadow: 0 0 0 9999px rgba(0,0,0,0.78), 0 0 0 3px rgba(80,200,120,1),   0 0 30px 10px rgba(80,200,120,0.55); }
        }
        @keyframes tour-card-in {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tour-pulse-ring {
          0%   { transform: scale(1);    opacity: 0.7; }
          70%  { transform: scale(1.1);  opacity: 0; }
          100% { transform: scale(1.1);  opacity: 0; }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[9999]"
        style={{ opacity: overlayOpacity, transition: 'opacity 0.22s ease', pointerEvents: overlayOpacity < 0.5 ? 'none' : 'auto' }}
      >
        {/* Dark overlay — click to skip */}
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.78)' }} onClick={finish} />

        {/* Spotlight */}
        {sp && (
          <>
            <div style={{
              position: 'fixed', top: sp.top - 6, left: sp.left - 6,
              width: sp.width + 12, height: sp.height + 12,
              borderRadius: 16, border: '2px solid rgba(80,200,120,0.7)',
              animation: 'tour-pulse-ring 1.8s ease-out infinite',
              zIndex: 1, pointerEvents: 'none',
            }} />
            <div style={{
              position: 'fixed', top: sp.top, left: sp.left, width: sp.width, height: sp.height,
              borderRadius: 14, animation: 'tour-glow 2s ease-in-out infinite',
              transition: 'top 0.4s cubic-bezier(.4,0,.2,1), left 0.4s cubic-bezier(.4,0,.2,1), width 0.4s cubic-bezier(.4,0,.2,1), height 0.4s cubic-bezier(.4,0,.2,1)',
              zIndex: 1, pointerEvents: 'none',
            }} />
          </>
        )}

        {/* Card */}
        {isCentered ? (
          <div className="absolute inset-0 flex items-center justify-center px-5" style={{ zIndex: 2 }} onClick={e => e.stopPropagation()}>
            <div key={cardKey} style={{ animation: 'tour-card-in 0.3s ease forwards', width: '100%', maxWidth: 420 }}>
              <TourCard current={current} step={step} total={STEPS.length} isFirst={isFirst} isLast={isLast}
                onPrev={() => goToStep(step - 1)} onNext={() => isLast ? finish() : goToStep(step + 1)} onSkip={finish} />
            </div>
          </div>
        ) : (
          <div
            key={cardKey} onClick={e => e.stopPropagation()}
            style={{ position: 'fixed', top: tpos.top, left: tpos.left, width: TOOLTIP_W, zIndex: 2,
              animation: 'tour-card-in 0.3s ease forwards',
              transition: 'top 0.4s cubic-bezier(.4,0,.2,1), left 0.4s cubic-bezier(.4,0,.2,1)' }}
          >
            {tpos.side !== 'center' && <div style={arrowStyle(tpos.side)} />}
            <TourCard current={current} step={step} total={STEPS.length} isFirst={isFirst} isLast={isLast}
              onPrev={() => goToStep(step - 1)} onNext={() => isLast ? finish() : goToStep(step + 1)} onSkip={finish} compact />
          </div>
        )}

        {/* Counter + close */}
        <div className="fixed top-4 right-4 flex items-center gap-3" style={{ zIndex: 3 }}>
          <span className="text-white/50 text-xs font-medium tracking-widest">{step + 1} / {STEPS.length}</span>
          <button type="button" onClick={finish}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors backdrop-blur-sm"
            title="Skip tour">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Step dots */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2" style={{ zIndex: 3 }}>
          {STEPS.map((_, i) => (
            <button key={i} type="button" onClick={() => goToStep(i)}
              style={{
                width: i === step ? 24 : 8, height: 8, borderRadius: 99,
                backgroundColor: i === step ? '#4ade80' : 'rgba(255,255,255,0.25)',
                border: 'none', cursor: 'pointer',
                transition: 'width 0.3s ease, background-color 0.3s ease',
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}

/* ─── Tour card ─────────────────────────────────────────────────────────── */
interface CardProps {
  current: Step;
  step: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  compact?: boolean;
}

function TourCard({ current, step, total, isFirst, isLast, onPrev, onNext, onSkip, compact }: CardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${((step + 1) / total) * 100}%`, background: 'linear-gradient(90deg, #3D5F42, #4ade80)' }} />
      </div>

      <div className={compact ? 'p-4' : 'p-6'}>
        {/* Emoji + step badge */}
        <div className="flex items-center gap-2 mb-3">
          {current.emoji && <span className="text-2xl leading-none">{current.emoji}</span>}
          <span className="text-xs font-semibold text-[#3D5F42] bg-[#3D5F42]/10 rounded-full px-2.5 py-0.5">
            {step + 1} of {total}
          </span>
        </div>

        <h2 className={`font-bold text-gray-900 leading-snug ${compact ? 'text-base mb-2' : 'text-xl mb-2.5'}`}>{current.title}</h2>
        <p className={`text-gray-600 leading-relaxed ${compact ? 'text-xs' : 'text-sm'}`}>{current.body}</p>

        {current.cta && (
          <div className={`mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
            <span className="text-amber-500 shrink-0 text-sm">💡</span>
            <p className={`text-amber-800 leading-relaxed ${compact ? 'text-[11px]' : 'text-xs'}`}>{current.cta}</p>
          </div>
        )}

        {/* Buttons */}
        <div className={`flex gap-2 ${compact ? 'mt-3.5' : 'mt-5'}`}>
          {!isFirst && (
            <button type="button" onClick={onPrev}
              className={`rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors shrink-0 ${compact ? 'w-8 h-8' : 'w-10 h-10'}`}>
              <ArrowLeft className={compact ? 'w-3.5 h-3.5 text-gray-500' : 'w-4 h-4 text-gray-500'} />
            </button>
          )}
          <button type="button" onClick={onNext}
            className={`flex-1 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 ${compact ? 'h-8 text-xs' : 'h-10 text-sm'}`}
            style={{ background: 'linear-gradient(135deg, #3D5F42, #4a7a51)' }}>
            {isLast
              ? <><Play className={compact ? 'w-3 h-3' : 'w-4 h-4'} />Start farming!</>
              : <>Next<ArrowRight className={compact ? 'w-3 h-3' : 'w-4 h-4'} /></>
            }
          </button>
        </div>

        {!isLast && (
          <button type="button" onClick={onSkip}
            className={`w-full py-1 text-gray-400 hover:text-gray-600 transition-colors ${compact ? 'mt-1.5 text-[11px]' : 'mt-2 text-xs'}`}>
            Skip tour
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Exports ────────────────────────────────────────────────────────────── */
export function shouldShowTour(): boolean { return !localStorage.getItem(STORAGE_KEY); }
export function resetTour() { localStorage.removeItem(STORAGE_KEY); }
