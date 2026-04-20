import { useState } from 'react';
import { X, Camera } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { createEggSaleWithRevenue } from '../../utils/eggInventory';
import { CustomerLookup } from '../customers/CustomerLookup';

interface LogSaleModalProps {
  flockId: string;
  eggsPerTray: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function LogSaleModal({ flockId, eggsPerTray, onClose, onSuccess }: LogSaleModalProps) {
  const { user, profile, currentFarm } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [traysSold, setTraysSold] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [transportCost, setTransportCost] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [trayEggType, setTrayEggType] = useState<'small' | 'medium' | 'large' | 'jumbo' | 'mixed'>('large');
  const [mixedRatioMode, setMixedRatioMode] = useState<'auto' | 'custom'>('auto');
  const [customRatios, setCustomRatios] = useState({
    small: 25,
    medium: 25,
    large: 25,
    jumbo: 25,
  });
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const calculateEggDistribution = (trays: number) => {
    const totalEggs = Math.round(trays * eggsPerTray);

    if (trayEggType === 'small') {
      return { small: totalEggs, medium: 0, large: 0, jumbo: 0 };
    } else if (trayEggType === 'medium') {
      return { small: 0, medium: totalEggs, large: 0, jumbo: 0 };
    } else if (trayEggType === 'large') {
      return { small: 0, medium: 0, large: totalEggs, jumbo: 0 };
    } else if (trayEggType === 'jumbo') {
      return { small: 0, medium: 0, large: 0, jumbo: totalEggs };
    } else {
      if (mixedRatioMode === 'auto') {
        const perSize = Math.floor(totalEggs / 4);
        const remainder = totalEggs % 4;
        return {
          small: perSize + (remainder > 0 ? 1 : 0),
          medium: perSize + (remainder > 1 ? 1 : 0),
          large: perSize + (remainder > 2 ? 1 : 0),
          jumbo: perSize,
        };
      } else {
        const totalRatio = customRatios.small + customRatios.medium + customRatios.large + customRatios.jumbo;
        if (totalRatio === 0) {
          return { small: 0, medium: 0, large: 0, jumbo: 0 };
        }
        return {
          small: Math.round((totalEggs * customRatios.small) / totalRatio),
          medium: Math.round((totalEggs * customRatios.medium) / totalRatio),
          large: Math.round((totalEggs * customRatios.large) / totalRatio),
          jumbo: Math.round((totalEggs * customRatios.jumbo) / totalRatio),
        };
      }
    }
  };

  const distribution = calculateEggDistribution(parseFloat(traysSold) || 0);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhoto(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentFarm?.id) return;

    const traysNum = parseFloat(traysSold);
    const priceNum = parseFloat(unitPrice);
    const transportNum = parseFloat(transportCost) || 0;

    if (isNaN(traysNum) || traysNum <= 0) {
      setError('Please enter a valid number of trays');
      return;
    }

    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Please enter a valid unit price');
      return;
    }

    setError('');
    setLoading(true);

    try {
      let finalCustomerId = customerId;

      // Auto-save new customer if name and phone provided but no customer selected
      if (buyerName && buyerPhone && !customerId) {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('farm_id', currentFarm.id)
          .eq('phone', buyerPhone)
          .maybeSingle();

        if (existingCustomer) {
          finalCustomerId = existingCustomer.id;
        } else {
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              farm_id: currentFarm.id,
              name: buyerName,
              phone: buyerPhone,
              address: buyerAddress || null,
            })
            .select()
            .maybeSingle();

          if (customerError) {
            console.error('Error creating customer:', customerError);
          } else if (newCustomer) {
            finalCustomerId = newCustomer.id;
          }
        }
      }

      let photoUrl = null;

      if (photo) {
        const fileExt = photo.name.split('.').pop();
        const fileName = `${currentFarm.id}/${flockId}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('inventory-photos')
          .upload(fileName, photo);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('inventory-photos')
          .getPublicUrl(fileName);

        photoUrl = urlData.publicUrl;
      }

      const totalEggs = distribution.small + distribution.medium + distribution.large + distribution.jumbo;
      const totalAmount = totalEggs * priceNum;
      const netAmount = totalAmount - transportNum;

      const { error: saleError } = await supabase
        .from('egg_sales')
        .insert({
          farm_id: currentFarm.id,
          sold_on: date,
          sale_date: date,
          trays: traysNum,
          unit_price: priceNum,
          customer_id: finalCustomerId,
          customer_name: buyerName || null,
          customer_phone: buyerPhone || null,
          small_eggs_sold: distribution.small,
          medium_eggs_sold: distribution.medium,
          large_eggs_sold: distribution.large,
          jumbo_eggs_sold: distribution.jumbo,
          small_price: priceNum,
          medium_price: priceNum,
          large_price: priceNum,
          jumbo_price: priceNum,
          total_eggs: totalEggs,
          total_amount: netAmount,
          payment_status: 'paid',
          payment_method: paymentMethod,
          sold_by: profile?.id,
          notes: notes || null,
        });

      if (saleError) throw saleError;

      const { data: inventory } = await supabase
        .from('egg_inventory')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .maybeSingle();

      if (inventory) {
        await supabase
          .from('egg_inventory')
          .update({
            small_eggs: (inventory.small_eggs || 0) - distribution.small,
            medium_eggs: (inventory.medium_eggs || 0) - distribution.medium,
            large_eggs: (inventory.large_eggs || 0) - distribution.large,
            jumbo_eggs: (inventory.jumbo_eggs || 0) - distribution.jumbo,
            last_updated: new Date().toISOString(),
          })
          .eq('farm_id', currentFarm.id);
      }

      const { error: revenueError } = await supabase
        .from('revenues')
        .insert({
          farm_id: currentFarm.id,
          flock_id: flockId,
          source_type: 'egg_sale',
          source_id: null,
          amount: netAmount,
          currency: currentFarm?.currency_code || 'XAF',
          description: buyerName
            ? `Egg sale to ${buyerName} - ${traysNum} trays`
            : `Egg sale - ${traysNum} trays`,
          revenue_date: date,
        });

      if (revenueError) throw revenueError;

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action: buyerName
          ? `Logged egg sale to ${buyerName}: ${traysNum} trays`
          : `Logged egg sale: ${traysNum} trays`,
        entity_type: 'egg_sale',
        entity_id: flockId,
        details: {
          trays: traysNum,
          unitPrice: priceNum,
          buyer: buyerName,
          date,
        },
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log sale');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Log Egg Sale</h2>
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
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              Date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
              required
            />
          </div>

          <div>
            <label htmlFor="egg-type" className="block text-sm font-medium text-gray-700 mb-2">
              Egg Size
            </label>
            <select
              id="egg-type"
              value={trayEggType}
              onChange={(e) => setTrayEggType(e.target.value as 'small' | 'medium' | 'large' | 'jumbo' | 'mixed')}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
            >
              <option value="small">Small Eggs Only</option>
              <option value="medium">Medium Eggs Only</option>
              <option value="large">Large Eggs Only</option>
              <option value="jumbo">Jumbo Eggs Only</option>
              <option value="mixed">Mixed Sizes</option>
            </select>
          </div>

          {trayEggType === 'mixed' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Mixed Eggs Distribution
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMixedRatioMode('auto')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    mixedRatioMode === 'auto'
                      ? 'bg-white text-blue-700 shadow-sm border border-blue-300'
                      : 'text-gray-600 hover:text-gray-900 border border-transparent'
                  }`}
                >
                  Auto (Equal)
                </button>
                <button
                  type="button"
                  onClick={() => setMixedRatioMode('custom')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    mixedRatioMode === 'custom'
                      ? 'bg-white text-blue-700 shadow-sm border border-blue-300'
                      : 'text-gray-600 hover:text-gray-900 border border-transparent'
                  }`}
                >
                  Custom Ratio
                </button>
              </div>

              {mixedRatioMode === 'custom' && (
                <div className="space-y-2 mt-3">
                  <p className="text-xs text-gray-600 font-medium">Ratio (percentages)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Small %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={customRatios.small}
                        onChange={(e) => setCustomRatios({ ...customRatios, small: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Medium %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={customRatios.medium}
                        onChange={(e) => setCustomRatios({ ...customRatios, medium: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Large %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={customRatios.large}
                        onChange={(e) => setCustomRatios({ ...customRatios, large: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Jumbo %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={customRatios.jumbo}
                        onChange={(e) => setCustomRatios({ ...customRatios, jumbo: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Total: {customRatios.small + customRatios.medium + customRatios.large + customRatios.jumbo}%
                  </p>
                </div>
              )}

              <div className="bg-white rounded-lg p-3 mt-2">
                <p className="text-xs font-medium text-gray-700 mb-2">Distribution Preview:</p>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-gray-600">Small</p>
                    <p className="font-bold text-gray-900">{distribution.small}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Medium</p>
                    <p className="font-bold text-gray-900">{distribution.medium}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Large</p>
                    <p className="font-bold text-gray-900">{distribution.large}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Jumbo</p>
                    <p className="font-bold text-gray-900">{distribution.jumbo}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="trays" className="block text-sm font-medium text-gray-700 mb-2">
              Trays Sold
            </label>
            <input
              id="trays"
              type="number"
              step="0.5"
              value={traysSold}
              onChange={(e) => setTraysSold(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
              placeholder="Enter number of trays"
              required
            />
            <p className="text-xs text-gray-600 mt-1">
              Total eggs: {distribution.small + distribution.medium + distribution.large + distribution.jumbo}
            </p>
          </div>

          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-2">
              Price per Egg
            </label>
            <input
              id="price"
              type="number"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
              placeholder="Price per egg"
              required
            />
          </div>

          {currentFarm?.id && (
            <CustomerLookup
              farmId={currentFarm.id}
              initialPhone={buyerPhone}
              onCustomerSelect={(customer) => {
                if (customer) {
                  setCustomerId(customer.id);
                  setBuyerName(customer.name);
                  setBuyerPhone(customer.phone);
                  setBuyerAddress(customer.address || '');
                } else {
                  setCustomerId(null);
                  setBuyerName('');
                  setBuyerPhone('');
                  setBuyerAddress('');
                }
              }}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="buyer-name" className="block text-sm font-medium text-gray-700 mb-2">
                Customer Name
              </label>
              <input
                id="buyer-name"
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="Enter name"
              />
            </div>

            <div>
              <label htmlFor="buyer-address" className="block text-sm font-medium text-gray-700 mb-2">
                Address (Optional)
              </label>
              <input
                id="buyer-address"
                type="text"
                value={buyerAddress}
                onChange={(e) => setBuyerAddress(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="Customer address"
              />
            </div>
          </div>

          <div>
            <label htmlFor="transport" className="block text-sm font-medium text-gray-700 mb-2">
              Transport Cost
            </label>
            <input
              id="transport"
              type="number"
              step="0.01"
              value={transportCost}
              onChange={(e) => setTransportCost(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
              placeholder="0"
            />
          </div>

          <div>
            <label htmlFor="payment-method" className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method
            </label>
            <select
              id="payment-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all resize-none"
              placeholder="Any additional notes..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Photo (Optional)
            </label>
            <label className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-[#3D5F42] transition-colors cursor-pointer">
              <Camera className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-600">
                {photo ? photo.name : 'Upload photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </label>
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
              {loading ? 'Logging...' : 'Log Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
