import { useEffect, useState } from 'react';
import { MessageCircle, Save, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';

/**
 * WhatsApp Daily Report opt-in — Phase G.
 *
 * One section on the Settings page. Each user opts in independently per
 * farm (we keep a row in whatsapp_subscriptions per (farm_id, user_id)).
 *
 * Validation: phone in E.164 (+CCXXXXXXXXX). The DB has a CHECK constraint
 * that catches malformed numbers, so we mirror it client-side for fast
 * feedback.
 *
 * "Send a test message now" calls the edge function with force=true. If
 * the user's phone hasn't messaged the WhatsApp business number yet, Meta
 * will reject the test (template messages still work after registration,
 * but the recipient must accept the conversation). The error is shown so
 * the user knows the next step.
 */

interface Subscription {
  id: string;
  farm_id: string;
  user_id: string;
  phone_e164: string;
  enabled: boolean;
  delivery_time_local: string;
  last_sent_at: string | null;
  last_send_status: string | null;
  consecutive_failures: number;
}

const E164_REGEX = /^\+[1-9][0-9]{6,14}$/;

export function WhatsAppDailyReportSettings() {
  const { currentFarm, user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const [phone, setPhone] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [deliveryTime, setDeliveryTime] = useState('06:30');

  useEffect(() => {
    if (!currentFarm?.id || !user?.id) return;
    loadSubscription();
  }, [currentFarm?.id, user?.id]);

  const loadSubscription = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_subscriptions')
      .select('*')
      .eq('farm_id', currentFarm!.id)
      .eq('user_id', user!.id)
      .maybeSingle();
    if (error && error.code !== 'PGRST116' && !error.message?.includes('whatsapp_subscriptions')) {
      toast.error('Failed to load WhatsApp subscription');
    } else if (data) {
      const sub = data as Subscription;
      setSubscription(sub);
      setPhone(sub.phone_e164 || '');
      setEnabled(sub.enabled);
      setDeliveryTime(sub.delivery_time_local.slice(0, 5));
    }
    setLoading(false);
  };

  const handleSave = async () => {
    const trimmed = phone.trim();
    if (!E164_REGEX.test(trimmed)) {
      toast.error('Phone must be in international format (e.g. +234801234567)');
      return;
    }
    setSaving(true);
    const payload = {
      farm_id: currentFarm!.id,
      user_id: user!.id,
      phone_e164: trimmed,
      enabled,
      delivery_time_local: `${deliveryTime}:00`,
    };
    const { error } = await supabase
      .from('whatsapp_subscriptions')
      .upsert(payload, { onConflict: 'farm_id,user_id' });
    setSaving(false);
    if (error) {
      toast.error(`Failed to save: ${error.message}`);
    } else {
      toast.success(enabled ? 'WhatsApp daily report enabled' : 'Saved');
      loadSubscription();
    }
  };

  const handleTest = async () => {
    if (!subscription) {
      toast.error('Save your phone number first');
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-daily-report', {
        body: {
          force: true,
          farm_id: currentFarm!.id,
          user_id: user!.id,
        },
      });
      if (error) throw error;
      const result = (data as any)?.results?.[0];
      if (result?.ok) {
        toast.success('Test message sent — check WhatsApp');
      } else if (result?.error) {
        toast.error(`Test failed: ${result.error}`);
      } else if ((data as any)?.skipped) {
        toast.info('WhatsApp not configured on the server yet — ask the admin to set WHATSAPP_ACCESS_TOKEN');
      } else {
        toast.success('Test queued');
      }
    } catch (err: any) {
      toast.error(`Test failed: ${err?.message || 'unknown error'}`);
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!subscription) return;
    if (!confirm('Stop receiving WhatsApp daily reports for this farm?')) return;
    const { error } = await supabase
      .from('whatsapp_subscriptions')
      .delete()
      .eq('id', subscription.id);
    if (error) {
      toast.error('Failed to remove subscription');
    } else {
      toast.success('WhatsApp daily report disabled');
      setSubscription(null);
      setPhone('');
      setEnabled(true);
      setDeliveryTime('06:30');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-gray-200">
        <p className="text-sm text-gray-500">Loading WhatsApp settings…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
          <MessageCircle className="w-4 h-4" />
        </div>
        <h2 className="font-semibold text-gray-900">WhatsApp daily report</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Get a one-line summary of yesterday's farm activity in WhatsApp every morning. Includes deaths,
        eggs/biomass, sales, pending tasks, and any water-quality emergencies.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Phone (international format)</label>
          <input
            type="tel"
            placeholder="+234801234567"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
          />
          <p className="text-[11px] text-gray-500 mt-1">Must start with + and country code, e.g. +234, +237, +254.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Delivery time (your local)</label>
          <input
            type="time"
            value={deliveryTime}
            onChange={e => setDeliveryTime(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
          className="rounded"
        />
        Enabled
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-2 text-sm font-medium bg-[#3D5F42] text-white rounded-lg hover:bg-[#2f4a34] disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : subscription ? 'Update' : 'Save & enable'}
        </button>
        {subscription && (
          <>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {testing ? 'Sending…' : 'Send a test message now'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </>
        )}
      </div>

      {subscription?.last_sent_at && (
        <p className="text-[11px] text-gray-500 mt-3">
          Last sent: {new Date(subscription.last_sent_at).toLocaleString()} ·{' '}
          <span className={subscription.last_send_status === 'ok' ? 'text-emerald-700' : 'text-red-600'}>
            {subscription.last_send_status === 'ok' ? 'delivered' : `failed (${subscription.last_send_status})`}
          </span>
        </p>
      )}
      {subscription && subscription.consecutive_failures >= 3 && (
        <p className="text-[11px] text-amber-700 mt-2">
          ⚠️ {subscription.consecutive_failures} consecutive failures — likely the recipient hasn't accepted
          your WhatsApp business conversation yet. Have them send any message to your business number, then try again.
        </p>
      )}

      <details className="mt-4 text-[11px] text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">How this works</summary>
        <div className="mt-2 space-y-1.5 leading-relaxed">
          <p>
            • Messages are sent via Meta's WhatsApp Business Cloud API using an approved template.
          </p>
          <p>
            • The first time, the recipient must send any message to your business number to open the
            24-hour window. After that, the daily template can fire freely.
          </p>
          <p>
            • If 5 consecutive sends fail, the subscription auto-disables. Re-save here to re-enable.
          </p>
          <p>
            • Multiple farm members can each opt in with their own phone — every member can have their own
            delivery time.
          </p>
        </div>
      </details>
    </div>
  );
}
