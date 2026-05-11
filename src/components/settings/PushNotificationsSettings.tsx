import { useEffect, useState, useCallback } from 'react';
import { Bell, BellOff, AlertCircle, Sparkles, AtSign, Droplets, HeartPulse, Syringe, Package, Clock } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { supabase } from '../../lib/supabaseClient';
import {
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  getPushSubscriptionStatus,
} from '../../lib/pushNotifications';

/**
 * Per-category notification preferences.
 *
 * Each push_subscriptions row carries a `prefs` JSONB map of
 * category → bool. The send-push-notification edge function reads
 * this map and skips subscriptions where the requested category is
 * false. We expose toggles for every category so the user controls
 * what pings them on this device.
 *
 * Categories are documented in 20260507000003_push_subscriptions.sql
 * (defaults true, opt-out model) and extended by
 * 20260512000001_push_prefs_journal_categories.sql.
 */
type CategoryKey =
  | 'pond_alert'
  | 'mortality_spike'
  | 'water_quality'
  | 'vaccination_due'
  | 'task_overdue'
  | 'low_feed'
  | 'journal_mention'
  | 'eden_journal';

const CATEGORY_META: Array<{
  key: CategoryKey;
  icon: typeof Bell;
  labelEn: string;
  labelFr: string;
  descEn: string;
  descFr: string;
}> = [
  { key: 'pond_alert',       icon: Droplets,    labelEn: 'Pond emergencies',     labelFr: "Urgences d'étang",   descEn: 'DO drop, ammonia spike, temperature alerts.', descFr: "Baisse d'OD, pic d'ammoniac, alertes de température." },
  { key: 'mortality_spike',  icon: HeartPulse,  labelEn: 'Mortality spikes',     labelFr: 'Pics de mortalité',  descEn: 'Triggered when 24h losses exceed 2% of the flock.', descFr: 'Déclenché si les pertes sur 24h dépassent 2% du troupeau.' },
  { key: 'water_quality',    icon: Droplets,    labelEn: 'Water quality',        labelFr: "Qualité de l'eau",   descEn: 'Daily pond water-quality threshold breaches.', descFr: 'Dépassement de seuils journaliers de qualité.' },
  { key: 'vaccination_due',  icon: Syringe,     labelEn: 'Vaccinations due',     labelFr: 'Vaccinations dues',  descEn: 'A scheduled vaccination is due within 24 hours.', descFr: 'Une vaccination programmée est due sous 24 heures.' },
  { key: 'task_overdue',     icon: Clock,       labelEn: 'Overdue tasks',        labelFr: 'Tâches en retard',   descEn: 'Tasks past their due time on this farm.', descFr: 'Tâches dépassant leur échéance sur cette ferme.' },
  { key: 'low_feed',         icon: Package,     labelEn: 'Low feed stock',       labelFr: 'Stock faible',       descEn: 'Feed inventory drops below your set threshold.', descFr: 'Stock en dessous du seuil défini.' },
  { key: 'journal_mention',  icon: AtSign,      labelEn: 'Journal mentions',     labelFr: 'Mentions journal',   descEn: 'A teammate tagged you in a journal note.', descFr: "Un collègue vous a mentionné dans une note de journal." },
  { key: 'eden_journal',     icon: Sparkles,    labelEn: "Eden's auto-summaries",labelFr: "Résumés d'Eden",     descEn: "Eden's weekly digests, cycle close-outs, withdrawal-period reminders.", descFr: "Résumés hebdomadaires, fins de cycle, rappels de délais de retrait." },
];

/**
 * Push notifications opt-in — Phase G.
 *
 * Lets each user enable/disable web push for THIS browser. Notifications
 * fire from the alerts cron + future events (overdue task, low feed,
 * vaccination due). Supports multiple devices per user — each device
 * subscribes independently.
 */

type Status = 'unknown' | 'unsupported' | 'denied' | 'inactive' | 'active';

export function PushNotificationsSettings() {
  const toast = useToast();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const farmSpecies = useFarmSpecies();
  // The "Pond emergencies" example was aqua-specific. Pick a species-
  // relevant emergency keyword so the description reads naturally.
  const emergencyExample = isFr
    ? (farmSpecies.id === 'aquaculture' ? "Urgences d'étang"
      : farmSpecies.id === 'rabbits' ? 'Alertes de santé'
      : 'Pics de mortalité')
    : (farmSpecies.id === 'aquaculture' ? 'Pond emergencies'
      : farmSpecies.id === 'rabbits' ? 'Health alerts'
      : 'Mortality spikes');
  const [status, setStatus] = useState<Status>('unknown');
  const [working, setWorking] = useState(false);
  // Per-category prefs (loaded from push_subscriptions.prefs for the
  // current user). The toggles persist on change — there's no Save
  // button because each row update is a single PATCH. We keep prefs
  // local for instant UI response and sync to DB in the background.
  const [prefs, setPrefs] = useState<Record<CategoryKey, boolean>>({
    pond_alert: true, mortality_spike: true, water_quality: true,
    vaccination_due: true, task_overdue: true, low_feed: true,
    journal_mention: true, eden_journal: true,
  });
  const [savingCategory, setSavingCategory] = useState<CategoryKey | null>(null);

  useEffect(() => {
    refresh();
    loadPrefs();
  }, []);

  const refresh = async () => {
    const next = await getPushSubscriptionStatus();
    setStatus(next);
  };

  const loadPrefs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Read any active subscription on any device — prefs are shared
    // per-user, not per-device, even though the underlying row is
    // per-device. We take the first row's prefs as the source of
    // truth; saving updates all the user's rows so the user doesn't
    // have to keep prefs in sync per browser.
    const { data } = await supabase
      .from('push_subscriptions')
      .select('prefs')
      .eq('user_id', user.id)
      .eq('enabled', true)
      .limit(1)
      .maybeSingle();
    const stored = (data as { prefs: Record<string, boolean> } | null)?.prefs;
    if (stored) {
      setPrefs(prev => ({
        ...prev,
        ...Object.fromEntries(
          (Object.keys(prev) as CategoryKey[]).map(k => [k, stored[k] ?? prev[k]]),
        ) as Record<CategoryKey, boolean>,
      }));
    }
  }, []);

  const togglePref = async (key: CategoryKey) => {
    const next = !prefs[key];
    setPrefs(p => ({ ...p, [key]: next }));
    setSavingCategory(key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: rows } = await supabase
        .from('push_subscriptions')
        .select('id, prefs')
        .eq('user_id', user.id);
      const updates = ((rows ?? []) as { id: string; prefs: Record<string, boolean> }[]).map(r => ({
        id: r.id,
        prefs: { ...(r.prefs ?? {}), [key]: next },
      }));
      // Update each row's prefs. We could do a single UPDATE with a
      // jsonb_set RPC but the volume per user is tiny (1-3 devices).
      for (const u of updates) {
        await supabase
          .from('push_subscriptions')
          .update({ prefs: u.prefs })
          .eq('id', u.id);
      }
    } catch (err) {
      toast.error('Could not save preference');
      // Revert local state on failure
      setPrefs(p => ({ ...p, [key]: !next }));
      console.warn('[notifications] toggle failed:', err);
    } finally {
      setSavingCategory(null);
    }
  };

  const handleEnable = async () => {
    setWorking(true);
    const ok = await subscribeToPushNotifications();
    setWorking(false);
    if (ok) {
      toast.success(isFr ? 'Notifications push activées sur cet appareil' : 'Push notifications enabled on this device');
      refresh();
    } else {
      // The function logs specific reasons; the most likely user-facing
      // failure is denied permission.
      const next = await getPushSubscriptionStatus();
      if (next === 'denied') {
        toast.error(isFr ? 'Les notifications sont bloquées. Activez-les dans les paramètres de votre navigateur.' : 'Notifications are blocked. Enable them in your browser settings.');
      } else if (next === 'unsupported') {
        toast.error(isFr ? 'Ce navigateur ne prend pas en charge les notifications push.' : 'This browser does not support push notifications.');
      } else {
        toast.error(isFr ? "Impossible d'activer les notifications push. L'administrateur doit peut-être configurer les clés VAPID." : 'Could not enable push notifications. The admin may need to set VAPID keys.');
      }
      setStatus(next);
    }
  };

  const handleDisable = async () => {
    setWorking(true);
    const ok = await unsubscribeFromPushNotifications();
    setWorking(false);
    if (ok) {
      toast.success(isFr ? 'Notifications push désactivées sur cet appareil' : 'Push notifications disabled on this device');
      refresh();
    } else {
      toast.error(isFr ? 'Impossible de désactiver les notifications push' : 'Could not disable push notifications');
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
          <Bell className="w-4 h-4" />
        </div>
        <h2 className="font-semibold text-gray-900">{isFr ? 'Notifications push (cet appareil)' : 'Push notifications (this device)'}</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        {isFr
          ? `Alertes en temps réel sur ce navigateur/téléphone. ${emergencyExample}, tâches en retard, vaccinations dues - délivrées en tant que notifications natives même lorsque EdenTrack est fermé.`
          : `Real-time alerts on this browser/phone. ${emergencyExample}, overdue tasks, vaccinations due - delivered as native notifications even when EdenTrack is closed.`}
      </p>

      {status === 'unsupported' && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            {isFr
              ? "Ce navigateur ne prend pas en charge les notifications push. Safari iOS les prend en charge uniquement sur iOS 16.4+ en tant que PWA installée. Essayez Chrome sur Android, ou installez EdenTrack sur votre écran d'accueil."
              : 'This browser does not support push notifications. iOS Safari supports them only on iOS 16.4+ as an installed PWA. Try Chrome on Android, or install EdenTrack to your home screen.'}
          </p>
        </div>
      )}

      {status === 'denied' && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-800">
            {isFr
              ? "Les notifications sont bloquées pour ce site. Cliquez sur l'icône de cadenas à côté de l'URL → autoriser les notifications, puis rechargez."
              : 'Notifications are blocked for this site. Click the lock icon next to the URL → allow notifications, then reload.'}
          </p>
        </div>
      )}

      {(status === 'inactive' || status === 'unknown') && (
        <button
          type="button"
          onClick={handleEnable}
          disabled={working}
          className="px-3 py-2 text-sm font-medium bg-[#3D5F42] text-white rounded-lg hover:bg-[#2f4a34] disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          <Bell className="w-3.5 h-3.5" />
          {working ? (isFr ? 'Activation…' : 'Enabling…') : (isFr ? 'Activer sur cet appareil' : 'Enable on this device')}
        </button>
      )}

      {status === 'active' && (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 text-xs rounded-full">
              <Bell className="w-3 h-3" /> {isFr ? 'Actif sur cet appareil' : 'Active on this device'}
            </div>
            <button
              type="button"
              onClick={handleDisable}
              disabled={working}
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <BellOff className="w-3.5 h-3.5" />
              {working ? (isFr ? 'Désactivation…' : 'Disabling…') : (isFr ? 'Désactiver' : 'Disable')}
            </button>
          </div>

          {/* Per-category toggles. Persist on change — no Save button.
              Each row updates instantly with optimistic state +
              revert on error. Workers who don't want Eden's weekly
              digest on their phone but DO want pond alerts can mix
              and match here. */}
          <div className="mt-5">
            <p className="text-xs font-semibold text-gray-700 mb-2">
              {isFr ? 'Que voulez-vous recevoir ?' : 'What do you want to be notified about?'}
            </p>
            <div className="space-y-1">
              {CATEGORY_META.map(c => {
                const Icon = c.icon;
                const on = prefs[c.key];
                const saving = savingCategory === c.key;
                return (
                  <label
                    key={c.key}
                    className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      on ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => togglePref(c.key)}
                      disabled={saving}
                      className="mt-0.5 w-4 h-4 accent-[#3D5F42]"
                    />
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${on ? 'text-[#3D5F42]' : 'text-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${on ? 'text-gray-900' : 'text-gray-500'}`}>
                        {isFr ? c.labelFr : c.labelEn}
                      </div>
                      <div className="text-[11px] text-gray-500 leading-snug">
                        {isFr ? c.descFr : c.descEn}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}

      <details className="mt-4 text-[11px] text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">{isFr ? 'Comment ça marche' : 'How this works'}</summary>
        <div className="mt-2 space-y-1.5 leading-relaxed">
          {isFr ? (
            <>
              <p>• Chaque appareil s'abonne indépendamment. Activer sur votre téléphone n'affecte pas votre ordinateur portable.</p>
              <p>• Les alertes d'urgence d'étang se déclenchent dans les 15 minutes suivant un dépassement de seuil (OD &lt; 3 mg/L, pic d'ammoniac, etc).</p>
              <p>• Si vous ne touchez aucune notification pendant longtemps, votre navigateur peut révoquer automatiquement l'abonnement. Réactivez depuis cette page si nécessaire.</p>
            </>
          ) : (
            <>
              <p>• Each device subscribes independently. Enabling on your phone doesn't affect your laptop.</p>
              <p>• Pond emergency alerts fire within 15 minutes of a threshold breach (DO &lt; 3 mg/L, ammonia spike, etc).</p>
              <p>• If you never tap a notification for a long time, your browser may auto-revoke the subscription. Re-enable from this page if needed.</p>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
