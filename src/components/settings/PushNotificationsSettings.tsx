import { useEffect, useState } from 'react';
import { Bell, BellOff, AlertCircle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import {
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  getPushSubscriptionStatus,
} from '../../lib/pushNotifications';

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
  const [status, setStatus] = useState<Status>('unknown');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  const refresh = async () => {
    const next = await getPushSubscriptionStatus();
    setStatus(next);
  };

  const handleEnable = async () => {
    setWorking(true);
    const ok = await subscribeToPushNotifications();
    setWorking(false);
    if (ok) {
      toast.success('Push notifications enabled on this device');
      refresh();
    } else {
      // The function logs specific reasons; the most likely user-facing
      // failure is denied permission.
      const next = await getPushSubscriptionStatus();
      if (next === 'denied') {
        toast.error('Notifications are blocked. Enable them in your browser settings.');
      } else if (next === 'unsupported') {
        toast.error('This browser does not support push notifications.');
      } else {
        toast.error('Could not enable push notifications. The admin may need to set VAPID keys.');
      }
      setStatus(next);
    }
  };

  const handleDisable = async () => {
    setWorking(true);
    const ok = await unsubscribeFromPushNotifications();
    setWorking(false);
    if (ok) {
      toast.success('Push notifications disabled on this device');
      refresh();
    } else {
      toast.error('Could not disable push notifications');
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
          <Bell className="w-4 h-4" />
        </div>
        <h2 className="font-semibold text-gray-900">Push notifications (this device)</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Real-time alerts on this browser/phone. Pond emergencies, overdue tasks, vaccinations
        due — delivered as native notifications even when EdenTrack is closed.
      </p>

      {status === 'unsupported' && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            This browser does not support push notifications. iOS Safari supports them only on iOS 16.4+ as
            an installed PWA. Try Chrome on Android, or install EdenTrack to your home screen.
          </p>
        </div>
      )}

      {status === 'denied' && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-800">
            Notifications are blocked for this site. Click the lock icon next to the URL → allow
            notifications, then reload.
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
          {working ? 'Enabling…' : 'Enable on this device'}
        </button>
      )}

      {status === 'active' && (
        <div className="flex items-center gap-3">
          <div className="flex-1 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 text-xs rounded-full">
            <Bell className="w-3 h-3" /> Active on this device
          </div>
          <button
            type="button"
            onClick={handleDisable}
            disabled={working}
            className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            <BellOff className="w-3.5 h-3.5" />
            {working ? 'Disabling…' : 'Disable'}
          </button>
        </div>
      )}

      <details className="mt-4 text-[11px] text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">How this works</summary>
        <div className="mt-2 space-y-1.5 leading-relaxed">
          <p>• Each device subscribes independently. Enabling on your phone doesn't affect your laptop.</p>
          <p>• Pond emergency alerts fire within 15 minutes of a threshold breach (DO &lt; 3 mg/L, ammonia spike, etc).</p>
          <p>• If you never tap a notification for a long time, your browser may auto-revoke the subscription. Re-enable from this page if needed.</p>
        </div>
      </details>
    </div>
  );
}
