import { useState, useEffect } from 'react';
import { X, AlertTriangle, RotateCcw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { SalesReceipt, ReceiptItem } from '../../types/database';
import { processRefund } from '../../utils/receiptOperations';

interface ProcessRefundModalProps {
  receipt: SalesReceipt;
  onClose: () => void;
  onRefunded: () => void;
}

export function ProcessRefundModal({ receipt, onClose, onRefunded }: ProcessRefundModalProps) {
  const { user, profile, currentFarm } = useAuth();
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [refundReason, setRefundReason] = useState('');
  const [restoreInventory, setRestoreInventory] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadItems();
  }, [receipt.id]);

  const loadItems = async () => {
    const { data } = await supabase
      .from('receipt_items')
      .select('*')
      .eq('receipt_id', receipt.id);

    if (data) {
      setItems(data);
      setSelectedItems(new Set(data.map(item => item.id)));
    }
  };

  const toggleItem = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const calculateRefundAmount = () => {
    return items
      .filter(item => selectedItems.has(item.id))
      .reduce((sum, item) => sum + item.total, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentFarm?.id) return;

    if (selectedItems.size === 0) {
      setError('Please select at least one item to refund');
      return;
    }

    if (!refundReason.trim()) {
      setError('Please provide a refund reason');
      return;
    }

    setProcessing(true);
    setError('');

    const itemsToRefund = items.filter(item => selectedItems.has(item.id));

    const result = await processRefund({
      receiptId: receipt.id,
      farmId: currentFarm.id,
      refundAmount: calculateRefundAmount(),
      refundReason,
      itemsRefunded: itemsToRefund.map(item => ({
        product_type: item.product_type,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total: item.total,
      })),
      restoreInventory,
      userId: user.id,
    });

    if (result.success) {
      onRefunded();
    } else {
      setError(result.error || 'Failed to process refund');
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Process Refund</h2>
              <p className="text-sm text-gray-500">Receipt #{receipt.receipt_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-yellow-900 mb-1">Important</h3>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>• This action will create a refund record and reverse the revenue</li>
                <li>• The original receipt will be marked as refunded</li>
                <li>• This action cannot be undone</li>
              </ul>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 mb-3">Select Items to Refund</div>
            <div className="space-y-2">
              {items.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-all ${
                    selectedItems.has(item.id)
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="w-5 h-5 text-red-600 rounded focus:ring-2 focus:ring-red-500"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{item.description}</div>
                      <div className="text-sm text-gray-600">
                        {item.quantity} {item.unit} × {profile?.currency_preference} {item.unit_price.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="font-semibold text-gray-900">
                    {profile?.currency_preference} {item.total.toLocaleString()}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Refund Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              rows={3}
              placeholder="Explain why this refund is being processed..."
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          {items.some(item => item.product_type === 'eggs' && selectedItems.has(item.id)) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restoreInventory}
                  onChange={(e) => setRestoreInventory(e.target.checked)}
                  className="mt-0.5 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <div className="font-medium text-blue-900">Restore Egg Inventory</div>
                  <div className="text-sm text-blue-700">
                    Add the refunded eggs back to your inventory stock
                  </div>
                </div>
              </label>
            </div>
          )}

          <div className="bg-gray-100 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">Original Amount</span>
              <span className="text-gray-900 font-medium">
                {profile?.currency_preference} {receipt.total.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-gray-300">
              <span className="text-lg font-medium text-gray-900">Refund Amount</span>
              <span className="text-2xl font-bold text-red-600">
                {profile?.currency_preference} {calculateRefundAmount().toLocaleString()}
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={processing || selectedItems.size === 0 || !refundReason.trim()}
              className="flex-1 bg-red-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? 'Processing...' : 'Process Refund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
