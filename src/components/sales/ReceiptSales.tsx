import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Trash2, Receipt, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Flock, ProductType } from '../../types/database';
import { createReceipt, calculateAvailableEggStock } from '../../utils/receiptOperations';

interface ReceiptItem {
  productType: ProductType;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

interface ReceiptSalesProps {
  onReceiptCreated: () => void;
}

export function ReceiptSales({ onReceiptCreated }: ReceiptSalesProps) {
  const { user, profile, currentFarm } = useAuth();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [selectedFlock, setSelectedFlock] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ReceiptItem[]>([
    { productType: 'eggs', description: '', quantity: 0, unit: 'trays', unitPrice: 0 }
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [availableEggs, setAvailableEggs] = useState(0);

  useEffect(() => {
    loadFlocks();
  }, [currentFarm?.id]);

  useEffect(() => {
    if (currentFarm?.id) {
      loadAvailableEggs();
    }
  }, [currentFarm?.id, selectedFlock]);

  const loadFlocks = async () => {
    if (!currentFarm?.id) return;

    const { data } = await supabase
      .from('flocks')
      .select('*')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (data) {
      setFlocks(data);
      if (data.length > 0) {
        setSelectedFlock(data[0].id);
      }
    }
  };

  const loadAvailableEggs = async () => {
    if (!currentFarm?.id) return;
    const stock = await calculateAvailableEggStock(
      currentFarm.id,
      selectedFlock || undefined
    );
    setAvailableEggs(stock);
  };

  const addItem = () => {
    setItems([...items, {
      productType: 'eggs',
      description: '',
      quantity: 0,
      unit: 'trays',
      unitPrice: 0
    }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ReceiptItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'productType') {
      if (value === 'eggs') {
        newItems[index].unit = 'trays';
      } else if (value === 'broilers' || value === 'chickens') {
        newItems[index].unit = 'birds';
      }
    }

    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentFarm?.id) return;

    setSaving(true);
    setError('');

    const totalEggsToSell = items
      .filter(item => item.productType === 'eggs')
      .reduce((sum, item) => sum + item.quantity, 0);

    if (totalEggsToSell > availableEggs) {
      setError(`Cannot sell ${totalEggsToSell} trays. Only ${availableEggs} trays available in stock.`);
      setSaving(false);
      return;
    }

    const result = await createReceipt({
      farmId: currentFarm.id,
      flockId: selectedFlock || null,
      customerName: customerName || null,
      saleDate,
      paymentMethod,
      notes: notes || null,
      items: items.map(item => ({
        productType: item.productType,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
      })),
      userId: user.id,
    });

    if (result.success) {
      setCustomerName('');
      setSaleDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('Cash');
      setNotes('');
      setItems([{ productType: 'eggs', description: '', quantity: 0, unit: 'trays', unitPrice: 0 }]);
      onReceiptCreated();
      loadAvailableEggs();
    } else {
      setError(result.error || 'Failed to create receipt');
    }

    setSaving(false);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
          <ShoppingCart className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">New Sale</h2>
          <p className="text-sm text-gray-500">Create a sales receipt</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Flock</label>
            <select
              value={selectedFlock}
              onChange={(e) => setSelectedFlock(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
            >
              <option value="">Select Flock</option>
              {flocks.map((flock) => (
                <option key={flock.id} value={flock.id}>
                  {flock.name} ({flock.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Customer Name (Optional)</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Walk-in customer"
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sale Date</label>
            <input
              type="date"
              required
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
            >
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>
        </div>

        {availableEggs > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-blue-800">
              <Receipt className="w-5 h-5" />
              <span className="font-medium">Available Egg Stock: {availableEggs} trays</span>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">Items</label>
            <button
              type="button"
              onClick={addItem}
              className="text-sm text-[#3D5F42] hover:text-[#2F4A34] font-medium inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Product</label>
                    <select
                      required
                      value={item.productType}
                      onChange={(e) => updateItem(index, 'productType', e.target.value as ProductType)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent text-sm"
                    >
                      <option value="eggs">Eggs</option>
                      <option value="broilers">Broilers</option>
                      <option value="chickens">Chickens</option>
                    </select>
                  </div>

                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Large eggs"
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Qty</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={item.quantity || ''}
                      onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Price</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={item.unitPrice || ''}
                      onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="col-span-1 flex items-end">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={items.length === 1}
                      className="w-full p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="col-span-1 flex items-end justify-end">
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Total</div>
                      <div className="font-semibold text-gray-900">
                        {(item.quantity * item.unitPrice).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Additional notes about this sale..."
            className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
          />
        </div>

        <div className="bg-gradient-to-r from-[#3D5F42] to-[#2F4A34] rounded-xl p-6 text-white">
          <div className="flex justify-between items-center">
            <span className="text-lg font-medium">Total Amount</span>
            <span className="text-3xl font-bold">
              {profile?.currency_preference} {calculateTotal().toLocaleString()}
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={saving || items.some(i => !i.description || i.quantity <= 0 || i.unitPrice <= 0)}
          className="w-full bg-[#3D5F42] text-white px-6 py-4 rounded-xl font-semibold text-lg hover:bg-[#2F4A34] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Creating Receipt...' : 'Create Receipt'}
        </button>
      </form>
    </div>
  );
}
