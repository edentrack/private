import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock } from '../../types/database';
import { upsertChickExpenses } from '../../utils/flockExpenses';

interface EditFlockModalProps {
  flock: Flock;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditFlockModal({ flock, onClose, onUpdated }: EditFlockModalProps) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const [arrivalDate, setArrivalDate] = useState(flock.arrival_date);
  const [initialCount, setInitialCount] = useState(flock.initial_count);
  const [purchasePricePerBird, setPurchasePricePerBird] = useState(flock.purchase_price_per_bird?.toString() || '');
  const [purchaseTransportCost, setPurchaseTransportCost] = useState(flock.purchase_transport_cost?.toString() || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const purchasePriceNum = parseFloat(purchasePricePerBird) || 0;
      const transportCostNum = parseFloat(purchaseTransportCost) || 0;

      const { error: updateError } = await supabase
        .from('flocks')
        .update({
          arrival_date: arrivalDate,
          initial_count: initialCount,
          purchase_price_per_bird: purchasePriceNum,
          purchase_transport_cost: transportCostNum,
        })
        .eq('id', flock.id);

      if (updateError) throw updateError;

      const updatedFlock: Flock = {
        ...flock,
        arrival_date: arrivalDate,
        initial_count: initialCount,
        purchase_price_per_bird: purchasePriceNum,
        purchase_transport_cost: transportCostNum,
      };

      await upsertChickExpenses({
        flock: updatedFlock,
        userId: user!.id,
        farmId: profile!.farm_id,
        currencyCode: profile!.currency_preference,
      });

      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update flock');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Edit Flock</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <div className="text-sm text-gray-600 mb-4">
              Editing: <span className="font-semibold text-gray-900">{flock.name}</span>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="arrivalDate" className="block text-sm font-medium text-gray-700 mb-2">
                  Arrival Date
                </label>
                <input
                  id="arrivalDate"
                  type="date"
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
                />
              </div>

              <div>
                <label htmlFor="initialCount" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('flocks.initial_count')}
                </label>
                <input
                  id="initialCount"
                  type="number"
                  min="1"
                  value={initialCount}
                  onChange={(e) => setInitialCount(parseInt(e.target.value) || 0)}
                  required
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
                />
              </div>

              <div>
                <label htmlFor="purchasePricePerBird" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('flocks.price_per_bird')}
                </label>
                <input
                  id="purchasePricePerBird"
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchasePricePerBird}
                  onChange={(e) => setPurchasePricePerBird(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
                  placeholder="250"
                />
              </div>

              <div>
                <label htmlFor="purchaseTransportCost" className="block text-sm font-medium text-gray-700 mb-2">
                  Transport Cost
                </label>
                <input
                  id="purchaseTransportCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseTransportCost}
                  onChange={(e) => setPurchaseTransportCost(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
                  placeholder="50000"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-white border-2 border-gray-900 text-gray-900 px-6 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
