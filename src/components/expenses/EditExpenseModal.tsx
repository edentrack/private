import { useState, useEffect } from 'react';
import { X, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Expense, ExpenseCategory, Flock } from '../../types/database';

interface EditExpenseModalProps {
  expense: Expense;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['feed', 'medication', 'equipment', 'labor', 'chicks purchase', 'transport', 'other'];

const capitalizeCategory = (cat: string): string => {
  return cat.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

export function EditExpenseModal({ expense, isOpen, onClose, onSave }: EditExpenseModalProps) {
  const { user, profile } = useAuth();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [category, setCategory] = useState<ExpenseCategory>(expense.category);
  const [amount, setAmount] = useState(expense.amount.toString());
  const [description, setDescription] = useState(expense.description);
  const [date, setDate] = useState(expense.incurred_on || expense.date || '');
  const [selectedFlock, setSelectedFlock] = useState<string>(expense.flock_id || '');
  const [paidFromProfit, setPaidFromProfit] = useState(Boolean(expense.paid_from_profit));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadFlocks();
      // Normalize category to lowercase (for both 'transport' and 'chicks transport' → 'transport')
      const normalizedCategory = expense.category.toLowerCase() === 'chicks transport' 
        ? 'transport' 
        : expense.category.toLowerCase();
      setCategory(normalizedCategory as ExpenseCategory);
      setAmount(expense.amount.toString());
      setDescription(expense.description);
      setDate(expense.incurred_on || expense.date || '');
      setSelectedFlock(expense.flock_id || '');
      setPaidFromProfit(Boolean(expense.paid_from_profit));
      setError('');
    }
  }, [isOpen, expense]);

  const loadFlocks = async () => {
    const { data } = await supabase
      .from('flocks')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    setFlocks(data || []);
  };

  const handleSubmit = async () => {
    if (!amount || !date || !selectedFlock || !description) {
      setError('Please fill in all required fields');
      return;
    }

    const amountNum = parseFloat(amount);
    if (amountNum <= 0 || isNaN(amountNum)) {
      setError('Amount must be greater than 0');
      return;
    }

    setLoading(true);
    setError('');

    let errorMessageSet = false;

    try {
      // Normalize category - ensure it's lowercase and handle legacy 'chicks transport'
      let normalizedCategory = category.toLowerCase().trim();
      if (normalizedCategory === 'chicks transport') {
        normalizedCategory = 'transport';
      }
      
      // Ensure date is in ISO format (YYYY-MM-DD)
      let formattedDate = date;
      if (date.includes('/')) {
        // Handle MM/DD/YYYY format
        const parts = date.split('/');
        if (parts.length === 3) {
          const month = parts[0].padStart(2, '0');
          const day = parts[1].padStart(2, '0');
          const year = parts[2];
          formattedDate = `${year}-${month}-${day}`;
        }
      }
      
      const { error: updateError, data } = await supabase
        .from('expenses')
        .update({
          category: normalizedCategory,
          amount: amountNum,
          description: description.trim(),
          incurred_on: formattedDate,
          date: formattedDate,
          flock_id: selectedFlock || null,
          paid_from_profit: paidFromProfit,
        })
        .eq('id', expense.id)
        .select();

      if (updateError) {
        console.error('Update error:', updateError);
        // Show more specific error message
        const dbErrorMessage = updateError.message || updateError.code || 'Failed to update expense';
        if (dbErrorMessage.includes('check constraint') || dbErrorMessage.includes('category') || dbErrorMessage.includes('invalid input value')) {
          setError(`Invalid category: "${normalizedCategory}". The migration may not have been run yet. Please run the migration first.`);
        } else if (dbErrorMessage.includes('foreign key') || dbErrorMessage.includes('flock_id')) {
          setError('Invalid flock selected. Please select a valid flock.');
        } else {
          setError(`Failed to update expense: ${dbErrorMessage}`);
        }
        errorMessageSet = true;
        throw updateError;
      }

      const selectedFlockData = flocks.find(f => f.id === selectedFlock);
      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        action: `Updated ${normalizedCategory} expense to ${amountNum} ${expense.currency}`,
        entity_type: 'expense',
        entity_id: expense.id,
        details: {
          flock_name: selectedFlockData?.name,
          category: normalizedCategory,
          amount: amountNum,
          currency: expense.currency,
          date: formattedDate
        }
      });

      onSave();
      onClose();
    } catch (err) {
      // Only set generic error if we haven't already set a specific error message
      if (!errorMessageSet) {
        if (err instanceof Error && err.message) {
          setError(err.message);
        } else {
          setError('Failed to update expense. Please try again.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#3D5F42]/10 rounded-xl">
              <DollarSign className="w-5 h-5 text-[#3D5F42]" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Edit Expense</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Flock <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedFlock}
                onChange={(e) => setSelectedFlock(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
              >
                <option value="">Select a flock</option>
                {flocks.map((flock) => (
                  <option key={flock.id} value={flock.id}>
                    {flock.name} ({flock.type} - {flock.current_count} birds)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount ({expense.currency}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
                  placeholder="1000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
                rows={2}
                placeholder="Details about this expense..."
              />
            </div>

            <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50">
              <input
                type="checkbox"
                checked={paidFromProfit}
                onChange={(e) => setPaidFromProfit(e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">Paid from revenue balance</div>
                <div className="text-xs text-gray-600">Checked expenses reduce the tracked revenue balance.</div>
              </div>
            </label>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex gap-3 rounded-b-3xl border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !amount || !selectedFlock || !description || !date}
            className="flex-1 bg-[#3D5F42] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#2F4A34] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
