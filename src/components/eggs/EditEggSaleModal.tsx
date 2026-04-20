import { useEffect, useState } from 'react';
import { X, DollarSign, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

export interface EggSaleRecord {
  id: string;
  farm_id: string;
  flock_id?: string | null;
  sold_on?: string;
  sale_date?: string;
  trays?: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  small_eggs_sold?: number;
  medium_eggs_sold?: number;
  large_eggs_sold?: number;
  jumbo_eggs_sold?: number;
  small_price?: number;
  medium_price?: number;
  large_price?: number;
  jumbo_price?: number;
  total_eggs?: number;
  total_amount?: number;
  payment_status?: string;
  payment_method?: string | null;
  notes?: string | null;
  revenue_id?: string | null;
}

interface EditEggSaleModalProps {
  record: EggSaleRecord;
  currencyCode?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditEggSaleModal({ record, currencyCode = 'XAF', onClose, onSuccess }: EditEggSaleModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [eggsPerTray, setEggsPerTray] = useState(30);
  const [seededFromRecord, setSeededFromRecord] = useState(false);
  const dateStr = (record.sale_date || record.sold_on || '').toString().slice(0, 10);
  const recordTotalEggs = Number(
    record.total_eggs ??
      Number(record.small_eggs_sold ?? 0) +
        Number(record.medium_eggs_sold ?? 0) +
        Number(record.large_eggs_sold ?? 0) +
        Number(record.jumbo_eggs_sold ?? 0),
  );
  const recordEqTrays = eggsPerTray > 0 ? recordTotalEggs / eggsPerTray : 0;
  const recordPricePerTray = recordEqTrays > 0 ? Math.round(Number(record.total_amount ?? 0) / recordEqTrays) : 0;

  const [formData, setFormData] = useState({
    sale_date: dateStr,
    customer_name: record.customer_name || '',
    customer_phone: record.customer_phone || '',
    small_eggs_sold: Number(record.small_eggs_sold ?? 0),
    medium_eggs_sold: Number(record.medium_eggs_sold ?? 0),
    large_eggs_sold: Number(record.large_eggs_sold ?? 0),
    jumbo_eggs_sold: Number(record.jumbo_eggs_sold ?? 0),
    price_per_tray: 0,
    payment_status: record.payment_status || 'paid',
    payment_method: record.payment_method || 'cash',
    notes: record.notes || '',
  });

  const totalEggs =
    formData.small_eggs_sold +
    formData.medium_eggs_sold +
    formData.large_eggs_sold +
    formData.jumbo_eggs_sold;
  const trays = eggsPerTray > 0 ? Math.floor(totalEggs / eggsPerTray) : 0;
  const looseEggs = eggsPerTray > 0 ? totalEggs % eggsPerTray : totalEggs;
  const perEggPrice = eggsPerTray > 0 ? formData.price_per_tray / eggsPerTray : 0;
  const totalAmount = Math.round(totalEggs * perEggPrice);

  useEffect(() => {
    if (!record.farm_id) return;
    supabase
      .from('farms')
      .select('eggs_per_tray')
      .eq('id', record.farm_id)
      .single()
      .then(({ data }) => {
        if (data?.eggs_per_tray) setEggsPerTray(data.eggs_per_tray);
      });
  }, [record.farm_id]);

  useEffect(() => {
    if (seededFromRecord || !eggsPerTray || eggsPerTray <= 0) return;
    setFormData((prev) => ({
      ...prev,
      price_per_tray: recordPricePerTray,
    }));
    setSeededFromRecord(true);
  }, [seededFromRecord, eggsPerTray, recordTotalEggs, recordPricePerTray]);

  async function handleDelete() {
    if (!window.confirm('Delete this egg sale? This cannot be undone.')) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      // Add back eggs into inventory (deleting a sale means those eggs are no longer "sold")
      const oldSmallSold = Number(record.small_eggs_sold ?? 0);
      const oldMediumSold = Number(record.medium_eggs_sold ?? 0);
      const oldLargeSold = Number(record.large_eggs_sold ?? 0);
      const oldJumboSold = Number(record.jumbo_eggs_sold ?? 0);

      if (oldSmallSold || oldMediumSold || oldLargeSold || oldJumboSold) {
        const { data: inv } = await supabase
          .from('egg_inventory')
          .select('*')
          .eq('farm_id', record.farm_id)
          .maybeSingle();

        if (inv) {
          await supabase
            .from('egg_inventory')
            .update({
              small_eggs: Math.max(0, (inv.small_eggs ?? 0) + oldSmallSold),
              medium_eggs: Math.max(0, (inv.medium_eggs ?? 0) + oldMediumSold),
              large_eggs: Math.max(0, (inv.large_eggs ?? 0) + oldLargeSold),
              jumbo_eggs: Math.max(0, (inv.jumbo_eggs ?? 0) + oldJumboSold),
              last_updated: new Date().toISOString(),
            })
            .eq('farm_id', record.farm_id);
        } else {
          await supabase.from('egg_inventory').insert({
            farm_id: record.farm_id,
            small_eggs: Math.max(0, oldSmallSold),
            medium_eggs: Math.max(0, oldMediumSold),
            large_eggs: Math.max(0, oldLargeSold),
            jumbo_eggs: Math.max(0, oldJumboSold),
            last_updated: new Date().toISOString(),
          });
        }
      }

      const { error } = await supabase.from('egg_sales').delete().eq('id', record.id);
      if (error) throw error;
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete sale');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    if (totalEggs === 0) {
      setErrorMessage('Please enter at least some eggs sold');
      setLoading(false);
      return;
    }

    try {
      const oldSmallSold = Number(record.small_eggs_sold ?? 0);
      const oldMediumSold = Number(record.medium_eggs_sold ?? 0);
      const oldLargeSold = Number(record.large_eggs_sold ?? 0);
      const oldJumboSold = Number(record.jumbo_eggs_sold ?? 0);
      const nextSmallSold = Math.max(0, Math.floor(formData.small_eggs_sold || 0));
      const nextMediumSold = Math.max(0, Math.floor(formData.medium_eggs_sold || 0));
      const nextLargeSold = Math.max(0, Math.floor(formData.large_eggs_sold || 0));
      const nextJumboSold = Math.max(0, Math.floor(formData.jumbo_eggs_sold || 0));

      const { error: updateError } = await supabase
        .from('egg_sales')
        .update({
          sold_on: formData.sale_date,
          sale_date: formData.sale_date,
          trays,
          customer_name: formData.customer_name || null,
          customer_phone: formData.customer_phone || null,
          small_eggs_sold: nextSmallSold,
          medium_eggs_sold: nextMediumSold,
          large_eggs_sold: nextLargeSold,
          jumbo_eggs_sold: nextJumboSold,
          small_price: perEggPrice,
          medium_price: perEggPrice,
          large_price: perEggPrice,
          jumbo_price: perEggPrice,
          total_eggs: totalEggs,
          total_amount: totalAmount,
          payment_status: formData.payment_status,
          payment_method: formData.payment_method || null,
          sold_by: profile?.id,
          notes: formData.notes || null,
        })
        .eq('id', record.id);

      if (updateError) throw updateError;

      // Update egg_inventory by delta (sales subtract from inventory)
      const deltaSmall = nextSmallSold - oldSmallSold;
      const deltaMedium = nextMediumSold - oldMediumSold;
      const deltaLarge = nextLargeSold - oldLargeSold;
      const deltaJumbo = nextJumboSold - oldJumboSold;

      if (deltaSmall !== 0 || deltaMedium !== 0 || deltaLarge !== 0 || deltaJumbo !== 0) {
        const { data: inv } = await supabase
          .from('egg_inventory')
          .select('*')
          .eq('farm_id', record.farm_id)
          .maybeSingle();

        if (inv) {
          await supabase
            .from('egg_inventory')
            .update({
              small_eggs: Math.max(0, (inv.small_eggs ?? 0) - deltaSmall),
              medium_eggs: Math.max(0, (inv.medium_eggs ?? 0) - deltaMedium),
              large_eggs: Math.max(0, (inv.large_eggs ?? 0) - deltaLarge),
              jumbo_eggs: Math.max(0, (inv.jumbo_eggs ?? 0) - deltaJumbo),
              last_updated: new Date().toISOString(),
            })
            .eq('farm_id', record.farm_id);
        }
      }

      // Update linked revenue if exists and amount changed
      if (record.revenue_id) {
        await supabase
          .from('revenues')
          .update({
            amount: totalAmount,
            revenue_date: formData.sale_date,
            description: formData.customer_name
              ? `Egg sale to ${formData.customer_name} - ${totalEggs} eggs`
              : `Egg sale - ${totalEggs} eggs`,
          })
          .eq('id', record.revenue_id);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update sale');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-bold text-gray-900">Edit Egg Sale</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Sale Date</label>
            <input
              type="date"
              value={formData.sale_date}
              onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Customer name</label>
            <input
              type="text"
              value={formData.customer_name}
              onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Customer phone</label>
            <input
              type="text"
              value={formData.customer_phone}
              onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
              placeholder="Optional"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Small eggs</label>
              <input
                type="number"
                min={0}
                step={1}
                value={formData.small_eggs_sold}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    small_eggs_sold: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Medium eggs</label>
              <input
                type="number"
                min={0}
                step={1}
                value={formData.medium_eggs_sold}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    medium_eggs_sold: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Large eggs</label>
              <input
                type="number"
                min={0}
                step={1}
                value={formData.large_eggs_sold}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    large_eggs_sold: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Jumbo eggs</label>
              <input
                type="number"
                min={0}
                step={1}
                value={formData.jumbo_eggs_sold}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    jumbo_eggs_sold: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Price per tray</label>
            <input
              type="number"
              min={0}
              step={1}
              value={formData.price_per_tray}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  price_per_tray: Math.max(0, Math.round(Number(e.target.value) || 0)),
                })
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
            />
          </div>

          <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex justify-between text-sm">
            <span className="font-semibold text-green-900">
              Quantity: {eggsPerTray > 0 ? `${trays} trays + ${looseEggs} eggs` : `${totalEggs} eggs`}
            </span>
            <span className="font-semibold text-green-900">
              Amount: {totalAmount.toLocaleString()} {currencyCode}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Payment status</label>
              <select
                value={formData.payment_status}
                onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
              >
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Payment method</label>
              <input
                type="text"
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
                placeholder="e.g. cash"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm resize-none"
              placeholder="Optional..."
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save changes'}
              </button>
            </div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl font-medium hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete sale
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
