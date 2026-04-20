import { useState, useEffect } from 'react';
import { X, Package, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { FeedStock } from '../../types/database';

interface RecordFeedUsageModalProps {
  flockId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function RecordFeedUsageModal({ flockId, onClose, onSuccess }: RecordFeedUsageModalProps) {
  const { user, currentFarm } = useAuth();
  const [feedStocks, setFeedStocks] = useState<FeedStock[]>([]);
  const [selectedFeedType, setSelectedFeedType] = useState('');
  const [bagsUsed, setBagsUsed] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentFarm) {
      loadFeedStocks();
    }
  }, [currentFarm]);

  const loadFeedStocks = async () => {
    if (!currentFarm?.id) return;

    const { data } = await supabase
      .from('feed_stock')
      .select('*')
      .eq('farm_id', currentFarm.id)
      .gt('current_stock_bags', 0)
      .order('feed_type');

    if (data && data.length > 0) {
      setFeedStocks(data);
      setSelectedFeedType(data[0].id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentFarm?.id) return;

    const bagsUsedNum = parseFloat(bagsUsed);
    if (isNaN(bagsUsedNum) || bagsUsedNum <= 0) {
      setError('Please enter a valid number of bags used');
      return;
    }

    const selectedFeed = feedStocks.find(f => f.id === selectedFeedType);
    if (!selectedFeed) {
      setError('Please select a feed type');
      return;
    }

    if (bagsUsedNum > selectedFeed.current_stock_bags) {
      setError(`Not enough stock. Available: ${selectedFeed.current_stock_bags} bags`);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const newStock = selectedFeed.current_stock_bags - bagsUsedNum;

      const { error: updateError } = await supabase
        .from('feed_stock')
        .update({
          current_stock_bags: newStock,
          last_updated: new Date().toISOString(),
        })
        .eq('id', selectedFeedType);

      if (updateError) throw updateError;

      const now = new Date();
      const { error: taskError } = await supabase.from('tasks').insert({
        user_id: user.id,
        farm_id: currentFarm.id,
        flock_id: flockId,
        title: 'Record feed bags used today',
        description: `Recorded ${bagsUsedNum} bags of ${selectedFeed.feed_type}. ${notes ? `Notes: ${notes}` : ''}`,
        due_date: now.toISOString().split('T')[0],
        due_at: now.toISOString(),
        status: 'completed',
        completed: true,
        completed_at: now.toISOString(),
        created_by: user.id,
      });

      if (taskError) throw taskError;

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action: `Recorded feed usage: ${bagsUsedNum} bags of ${selectedFeed.feed_type}`,
        entity_type: 'feed_stock',
        entity_id: selectedFeedType,
        details: {
          bags_used: bagsUsedNum,
          feed_type: selectedFeed.feed_type,
          new_stock: newStock,
          flock_id: flockId,
          notes,
        },
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record feed usage');
    } finally {
      setLoading(false);
    }
  };

  if (feedStocks.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-3xl max-w-md w-full p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Record Feed Usage</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
          <div className="text-center py-8">
            <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">No Feed Stock Available</h3>
            <p className="text-gray-600 mb-6">
              Please add feed stock to your inventory before recording usage.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4632] transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Package className="w-7 h-7 text-[#3D5F42]" />
            <h2 className="text-2xl font-bold text-gray-900">Record Feed Usage</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
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
            <label htmlFor="feedType" className="block text-sm font-medium text-gray-700 mb-2">
              Feed Type
            </label>
            <select
              id="feedType"
              value={selectedFeedType}
              onChange={(e) => setSelectedFeedType(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
              required
            >
              {feedStocks.map((feed) => (
                <option key={feed.id} value={feed.id}>
                  {feed.feed_type} ({feed.current_stock_bags} bags available)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bagsUsed" className="block text-sm font-medium text-gray-700 mb-2">
              Number of Bags Used
            </label>
            <input
              id="bagsUsed"
              type="number"
              step="0.5"
              min="0"
              value={bagsUsed}
              onChange={(e) => setBagsUsed(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
              placeholder="Enter quantity"
              required
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Additional Notes (Optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all resize-none"
              placeholder="Any observations..."
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4632] transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Recording...' : 'Record Usage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
