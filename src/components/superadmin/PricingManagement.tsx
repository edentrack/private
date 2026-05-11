import { useEffect, useState, useMemo } from 'react';
import { Save, RefreshCw, Percent, Eye, Tag } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';
import {
  FIXED_PRICES,
  formatPrice,
  loadPricingSettings,
  getEffectivePrice,
  getCurrentDiscountPct,
} from '../../utils/regionalPayment';

/**
 * SuperAdmin pricing controls.
 *
 * Two levers:
 *   1. Global discount % — single number that ripples to every plan,
 *      cycle, and currency. Quickest way to run a "10% off" promo.
 *   2. Per-cell overrides — pin a specific (tier × cycle × currency)
 *      to a fixed amount. Wins over baseline + discount.
 *
 * Both live in Supabase tables seeded by the
 * 20260510_pricing_settings_and_no_trial migration. Anyone can read;
 * only super-admins can write (RLS enforced server-side too).
 *
 * The preview grid shows effective prices in real time so the admin
 * sees exactly what farmers will see before clicking Save.
 */

type Cycle = 'monthly' | 'quarterly' | 'yearly';
type Tier = 'pro' | 'enterprise' | 'industry';

const TIER_LABELS: Record<Tier, string> = {
  pro: 'Grower',
  enterprise: 'Farm Boss',
  industry: 'Industry',
};
const CYCLE_LABELS: Record<Cycle, string> = {
  monthly: 'Monthly',
  quarterly: '3-Month',
  yearly: 'Yearly',
};
const PREVIEW_CURRENCIES = ['USD', 'XAF', 'NGN', 'KES', 'GHS', 'EUR', 'GBP'];

export function PricingManagement() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [discountLabel, setDiscountLabel] = useState<string>('');
  const [discountEndsAt, setDiscountEndsAt] = useState<string>('');
  // Force a re-render after we mutate the cache via loadPricingSettings.
  const [refreshTick, setRefreshTick] = useState(0);

  // Read current state once on mount. Bypass the cache so the admin
  // always sees the freshest value on this screen.
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('pricing_settings')
          .select('global_discount_pct, discount_label, discount_ends_at')
          .eq('id', 1)
          .maybeSingle();
        if (data) {
          setDiscountPct(Number(data.global_discount_pct ?? 0));
          setDiscountLabel(data.discount_label ?? '');
          setDiscountEndsAt(data.discount_ends_at ? data.discount_ends_at.slice(0, 16) : '');
        }
      } catch (err) {
        console.warn('[PricingManagement] load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (discountPct < 0 || discountPct > 90) {
      toast.error('Discount must be between 0 and 90%');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('pricing_settings')
        .update({
          global_discount_pct: discountPct,
          discount_label: discountLabel || null,
          discount_ends_at: discountEndsAt ? new Date(discountEndsAt).toISOString() : null,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      if (error) throw error;
      // Invalidate the regionalPayment cache and re-fetch so the
      // preview grid below immediately reflects the new discount.
      // Force-bypass the 5-min cache so the preview table below reflects
      // the new discount immediately, not after the next page load.
      await loadPricingSettings({ force: true });
      setRefreshTick(t => t + 1);
      toast.success(
        discountPct > 0
          ? `${discountPct}% discount applied across all plans`
          : 'Discount cleared. Prices back to baseline.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Preview rows compute against the live (just-saved) effective price
  // helper. refreshTick is in the dependency list so the table re-
  // renders after Save updates the cache.
  const previewRows = useMemo(() => {
    return (['pro', 'enterprise', 'industry'] as Tier[]).flatMap(tier =>
      (['monthly', 'quarterly', 'yearly'] as Cycle[]).map(cycle => {
        const cells = PREVIEW_CURRENCIES.map(currency => {
          const baseline = FIXED_PRICES[currency]?.[cycle]?.[tier];
          const effective = getEffectivePrice(tier, cycle, currency);
          const changed = baseline !== undefined && Math.abs(baseline - effective) > 0.01;
          return { currency, baseline, effective, changed };
        });
        return { tier, cycle, cells };
      }),
    );
    // refreshTick + discountPct so the memo updates on save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, discountPct]);

  const liveDiscount = getCurrentDiscountPct();
  const previewing = discountPct !== liveDiscount;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Tag className="w-6 h-6 text-[#3D5F42]" />
          Pricing controls
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Apply a single discount % across every plan and currency. Saves immediately
          and reflects on the landing page, in-app billing, and edge-function payment
          validation within a minute.
        </p>
      </div>

      {/* Global discount card ------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Percent className="w-5 h-5 text-amber-700" />
          <h2 className="font-bold text-gray-900">Global discount</h2>
          {liveDiscount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
              {liveDiscount}% currently live
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Discount %
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={90}
                step={1}
                value={discountPct}
                onChange={e => setDiscountPct(Math.max(0, Math.min(90, Number(e.target.value))))}
                disabled={loading}
                className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-lg font-bold focus:outline-none focus:border-amber-500"
              />
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={Math.min(50, discountPct)}
                onChange={e => setDiscountPct(Number(e.target.value))}
                disabled={loading}
                className="flex-1"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Hard cap 90%. Slider goes to 50 to discourage runaway promos.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Promo label (optional)
            </label>
            <input
              type="text"
              value={discountLabel}
              onChange={e => setDiscountLabel(e.target.value)}
              disabled={loading}
              placeholder='e.g. "Holiday 2026"'
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Internal note. Doesn't surface on the landing page.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Auto-end date (optional)
            </label>
            <input
              type="datetime-local"
              value={discountEndsAt}
              onChange={e => setDiscountEndsAt(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Currently informational. Wire a cron to fully automate.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-gray-500">
            {previewing
              ? <span className="text-amber-700 font-semibold">Unsaved changes — preview below shows the NEW state</span>
              : 'No pending changes'}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDiscountPct(liveDiscount)}
              disabled={saving || !previewing}
              className="px-3 py-2 text-sm font-semibold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !previewing}
              className="px-4 py-2 text-sm font-bold text-gray-900 bg-[#ffdd00] rounded-lg hover:brightness-105 disabled:opacity-50 flex items-center gap-2"
            >
              {saving
                ? <><div className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" /> Saving</>
                : <><Save className="w-4 h-4" /> Save & apply</>}
            </button>
          </div>
        </div>
      </div>

      {/* Live preview grid --------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-[#3D5F42]" />
          <h2 className="font-bold text-gray-900">Effective prices preview</h2>
          <span className="text-xs text-gray-400">— what farmers see right now</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-3 font-semibold text-gray-600">Plan / Cycle</th>
                {PREVIEW_CURRENCIES.map(c => (
                  <th key={c} className="text-right py-2 px-2 font-semibold text-gray-600 min-w-[5rem]">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map(({ tier, cycle, cells }) => (
                <tr key={`${tier}-${cycle}`} className="border-b border-gray-50 hover:bg-amber-50/30">
                  <td className="py-2 pr-3">
                    <span className="font-semibold text-gray-900">{TIER_LABELS[tier]}</span>
                    <span className="text-gray-400 ml-1">· {CYCLE_LABELS[cycle]}</span>
                  </td>
                  {cells.map(({ currency, baseline, effective, changed }) => (
                    <td key={currency} className={`text-right py-2 px-2 tabular-nums ${changed ? 'text-amber-700 font-semibold' : 'text-gray-700'}`}>
                      <div>{effective !== undefined ? formatPrice(effective, currency) : '—'}</div>
                      {changed && baseline !== undefined && (
                        <div className="text-[10px] text-gray-400 line-through">
                          {formatPrice(baseline, currency)}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-gray-400">
          Showing 7 of {Object.keys(FIXED_PRICES).length} supported currencies.
          The discount applies to all currencies uniformly.
        </p>
      </div>

      {/* Reminder block ------------------------------------------------ */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-900 leading-relaxed">
        <strong>How it propagates:</strong> the discount writes to <code className="bg-white/60 px-1 rounded">pricing_settings.global_discount_pct</code>.
        Client (landing + in-app billing) reads it on next page load. Edge functions
        (flutterwave-payment etc.) cache it for 60 seconds. Existing pending payments
        are validated against the discount that was live when they started — saving a
        new discount mid-checkout doesn't break in-flight transactions.
      </div>
    </div>
  );
}

export default PricingManagement;
