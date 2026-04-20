import { useState } from 'react';
import { X, Archive, DollarSign, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock } from '../../types/database';

interface ArchiveFlockModalProps {
  flock: Flock | null;
  onClose: () => void;
  onArchived: () => void;
}

export function ArchiveFlockModal({ flock, onClose, onArchived }: ArchiveFlockModalProps) {
  const { user, currentFarm } = useAuth();
  const [action, setAction] = useState<'sold' | 'deceased' | 'archived'>('archived');
  const [salePrice, setSalePrice] = useState('');
  const [buyerInfo, setBuyerInfo] = useState('');
  const [notes, setNotes] = useState('');
  const [keepRecords, setKeepRecords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!flock) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentFarm?.id) return;

    setLoading(true);
    setError('');

    try {
      if (!keepRecords) {
        const { error: deleteError } = await supabase
          .from('flocks')
          .delete()
          .eq('id', flock.id);

        if (deleteError) throw deleteError;

        // Success - close modal and refresh
        setLoading(false);
        onClose();
        onArchived();
        return;
      }

      const updateData = {
        status: action,
        archived_at: new Date().toISOString(),
        archived_reason: notes,
        archived_by: user.id,
        final_bird_count: flock.current_count,
        sale_price: action === 'sold' && salePrice ? parseFloat(salePrice) : null,
        sale_buyer: action === 'sold' ? buyerInfo : null,
      };

      const { error: updateError } = await supabase
        .from('flocks')
        .update(updateData)
        .eq('id', flock.id);

      if (updateError) throw updateError;

      setLoading(false);
      onClose();
      onArchived();
    } catch (err) {
      console.error('Error archiving flock:', err);
      setError(err instanceof Error ? err.message : 'Failed to archive flock. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Archive className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Archive Flock</h2>
              <p className="text-sm text-gray-500">{flock.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">Archive Flock</p>
                <p className="text-sm text-amber-700 mt-1">
                  This will remove the flock from your active list. You can choose to keep or delete all records.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              What happened to the flock?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setAction('sold')}
                className={`p-4 border-2 rounded-xl text-center transition-all ${
                  action === 'sold'
                    ? 'border-[#3D5F42] bg-[#3D5F42]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <DollarSign className={`w-6 h-6 mx-auto mb-2 ${
                  action === 'sold' ? 'text-[#3D5F42]' : 'text-gray-400'
                }`} />
                <div className="font-medium text-sm">Sold</div>
              </button>
              <button
                type="button"
                onClick={() => setAction('deceased')}
                className={`p-4 border-2 rounded-xl text-center transition-all ${
                  action === 'deceased'
                    ? 'border-red-600 bg-red-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <AlertTriangle className={`w-6 h-6 mx-auto mb-2 ${
                  action === 'deceased' ? 'text-red-600' : 'text-gray-400'
                }`} />
                <div className="font-medium text-sm">Deceased</div>
              </button>
              <button
                type="button"
                onClick={() => setAction('archived')}
                className={`p-4 border-2 rounded-xl text-center transition-all ${
                  action === 'archived'
                    ? 'border-gray-600 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Archive className={`w-6 h-6 mx-auto mb-2 ${
                  action === 'archived' ? 'text-gray-600' : 'text-gray-400'
                }`} />
                <div className="font-medium text-sm">Other</div>
              </button>
            </div>
          </div>

          {action === 'sold' && (
            <div className="space-y-4 bg-green-50 rounded-xl p-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sale Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Buyer Information
                </label>
                <input
                  type="text"
                  value={buyerInfo}
                  onChange={(e) => setBuyerInfo(e.target.value)}
                  placeholder="Buyer name or company"
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional details about archiving this flock..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
            />
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={keepRecords}
                onChange={(e) => setKeepRecords(e.target.checked)}
                className="mt-1 w-5 h-5 text-[#3D5F42] rounded focus:ring-[#3D5F42]"
              />
              <div>
                <div className="font-medium text-gray-900">Keep Historical Records</div>
                <div className="text-sm text-gray-600 mt-1">
                  Maintain all data for this flock (expenses, tasks, mortality, etc.) for future reference.
                  If unchecked, all flock data will be permanently deleted.
                </div>
              </div>
            </label>
          </div>

          <div className="bg-blue-50 rounded-xl p-4">
            <div className="text-sm text-blue-800">
              <strong>Final Count:</strong> {flock.current_count} birds
            </div>
            {action === 'sold' && salePrice && (
              <div className="text-sm text-blue-800 mt-2">
                <strong>Price per bird:</strong> {(parseFloat(salePrice) / flock.current_count).toFixed(2)}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-orange-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Archiving...' : keepRecords ? 'Archive Flock' : 'Delete Flock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
