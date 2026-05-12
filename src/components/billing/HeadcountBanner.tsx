import { AlertTriangle, TrendingUp, X, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFarmHeadcount } from '../../hooks/useFarmHeadcount';
import { getEffectiveTier } from '../../utils/planGating';
import { useLanguage } from '../../contexts/LanguageContext';

interface Props {
  /** Called when the user clicks the upgrade CTA. */
  onUpgrade: () => void;
}

/**
 * Headcount banner — shown above the dashboard when a farm's active
 * animal count is approaching or exceeding the plan's cap.
 *
 * States (driven by useFarmHeadcount → planGating.headcountStatus):
 *   ok         (under 80%)  → no banner at all
 *   approaching(80–99%)     → amber, "approaching limit", soft CTA
 *   over       (100–119%)   → red, "above plan limit", same CTA
 *   hard_stop  (≥120%)      → red, also blocks new additions (banner
 *                              just says so; the actual block lives in
 *                              OverflowModal + create-flock guards)
 *   unlimited               → no banner (Industry tier)
 *
 * Dismissible: an X stashes a per-farm flag in localStorage so the
 * banner doesn't reappear within the same day. Promotes growth
 * without nagging the same user three times in a session.
 */
export function HeadcountBanner({ onUpgrade }: Props) {
  const { currentFarm, profile } = useAuth();
  const tier = getEffectiveTier(profile);
  const { status } = useFarmHeadcount(currentFarm?.id, tier);
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const [dismissed, setDismissed] = useState(false);

  // Per-farm + per-day dismiss flag. Resets at midnight local time
  // so a farmer who's growing past their plan still sees the nudge
  // the next morning.
  const dismissKey = currentFarm?.id
    ? `headcountBannerDismissed:${currentFarm.id}:${new Date().toLocaleDateString('en-CA')}`
    : null;

  useEffect(() => {
    if (!dismissKey) return;
    setDismissed(localStorage.getItem(dismissKey) === '1');
  }, [dismissKey]);

  const dismiss = () => {
    if (!dismissKey) return;
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  if (status.state === 'ok' || status.state === 'unlimited') return null;
  if (dismissed && status.state !== 'hard_stop') return null;  // hard_stop is non-dismissable

  const palette = status.state === 'approaching'
    ? {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        icon: 'text-amber-600',
        title: 'text-amber-900',
        body: 'text-amber-800',
        btn: 'bg-amber-600 hover:bg-amber-700',
      }
    : {
        bg: 'bg-red-50',
        border: 'border-red-200',
        icon: 'text-red-600',
        title: 'text-red-900',
        body: 'text-red-700',
        btn: 'bg-red-600 hover:bg-red-700',
      };

  const Icon = status.state === 'approaching' ? TrendingUp : AlertTriangle;

  const headline = status.state === 'approaching'
    ? (isFr
        ? `Vous êtes à ${status.pct}% de la limite d'animaux de votre plan`
        : `You're at ${status.pct}% of your plan's animal limit`)
    : status.state === 'over'
    ? (isFr
        ? `Au-dessus de la limite d'animaux (${status.count.toLocaleString()} / ${status.cap.toLocaleString()})`
        : `Over your plan's animal limit (${status.count.toLocaleString()} / ${status.cap.toLocaleString()})`)
    : (isFr
        ? `Limite du plan dépassée — nouveaux groupes bloqués`
        : `Plan limit exceeded — new flocks blocked`);

  const subline = status.state === 'approaching'
    ? (isFr
        ? `Votre ferme a ${status.count.toLocaleString()} animaux actifs. La limite du plan est ${status.cap.toLocaleString()}. Passez à un plan supérieur pour éviter une interruption à la limite.`
        : `Your farm has ${status.count.toLocaleString()} active animals. Plan cap is ${status.cap.toLocaleString()}. Upgrade now and avoid an interruption when you hit the limit.`)
    : status.state === 'over'
    ? (isFr
        ? `Tout fonctionne encore, mais les nouveaux ajouts seront bloqués à 120% de la limite. Passez à un plan supérieur pour continuer à grandir.`
        : `Everything still works for now, but new additions will be blocked at 120% of your cap. Upgrade to keep growing.`)
    : (isFr
        ? `${status.count.toLocaleString()} animaux actifs — bien au-dessus de la limite de ${status.cap.toLocaleString()}. Mettez à niveau ou archivez des groupes pour pouvoir en ajouter d'autres.`
        : `${status.count.toLocaleString()} active animals — well over the ${status.cap.toLocaleString()} cap. Upgrade or archive some flocks to add more.`);

  return (
    <div className={`${palette.bg} border ${palette.border} rounded-2xl p-4 flex items-start gap-3 mb-4`}>
      <Icon className={`w-5 h-5 ${palette.icon} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${palette.title} mb-0.5`}>{headline}</p>
        <p className={`text-xs ${palette.body} leading-relaxed`}>{subline}</p>
        <button
          type="button"
          onClick={onUpgrade}
          className={`mt-2 inline-flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${palette.btn}`}
        >
          {isFr ? 'Améliorer le plan' : 'Upgrade plan'} <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      {status.state !== 'hard_stop' && (
        <button
          type="button"
          onClick={dismiss}
          className={`${palette.icon} hover:bg-white/30 rounded p-1 -mt-1 -mr-1`}
          aria-label={isFr ? 'Ignorer' : 'Dismiss'}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
