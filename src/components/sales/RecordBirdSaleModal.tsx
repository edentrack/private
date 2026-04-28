import { useState, useEffect } from 'react';
import { X, Bird, DollarSign, Scale, AlertTriangle, Check, Printer, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock } from '../../types/database';
import { shareViaWhatsApp } from '../../utils/whatsappShare';
import { CustomerLookup } from '../customers/CustomerLookup';

interface RecordBirdSaleModalProps {
  flock?: Flock | null;
  onClose: () => void;
  onSuccess: () => void;
  isEmbedded?: boolean;
}

export function RecordBirdSaleModal({ flock, onClose, onSuccess, isEmbedded = false }: RecordBirdSaleModalProps) {
  const { t } = useTranslation();
  const { user, currentFarm, profile } = useAuth();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [selectedFlockId, setSelectedFlockId] = useState(flock?.id || '');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [birdsSold, setBirdsSold] = useState('');
  const [saleMethod, setSaleMethod] = useState<'per_bird' | 'per_kg' | 'lump_sum'>('per_bird');
  const [pricePerBird, setPricePerBird] = useState('2500');
  const [pricePerKg, setPricePerKg] = useState('3000');
  const [totalWeightKg, setTotalWeightKg] = useState('');
  const [lumpSumAmount, setLumpSumAmount] = useState('');
  const [saleType, setSaleType] = useState<'market' | 'pre_order' | 'wholesale' | 'retail'>('market');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'credit'>('paid');
  const [amountPaid, setAmountPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSaleDetails, setLastSaleDetails] = useState<any>(null);

  const currency = profile?.currency_preference || currentFarm?.currency_code || 'XAF';

  useEffect(() => {
    loadFlocks();
  }, [currentFarm?.id]);

  useEffect(() => {
    if (currentFarm) {
      setPricePerBird(String(currentFarm.broiler_price_per_bird || 2500));
      setPricePerKg(String(currentFarm.broiler_price_per_kg || 3000));
    }
  }, [currentFarm]);

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
      if (!selectedFlockId && data.length > 0) {
        setSelectedFlockId(data[0].id);
      }
    }
  };

  const selectedFlock = flocks.find(f => f.id === selectedFlockId);
  const birdsAvailable = selectedFlock?.current_count || 0;
  const numBirdsSold = parseInt(birdsSold) || 0;
  const birdsRemaining = birdsAvailable - numBirdsSold;

  const calculateTotal = (): number => {
    if (saleMethod === 'per_bird') {
      return numBirdsSold * (parseFloat(pricePerBird) || 0);
    } else if (saleMethod === 'per_kg') {
      return (parseFloat(totalWeightKg) || 0) * (parseFloat(pricePerKg) || 0);
    } else {
      return parseFloat(lumpSumAmount) || 0;
    }
  };

  const totalAmount = calculateTotal();
  const pricePerBirdCalculated = numBirdsSold > 0 ? totalAmount / numBirdsSold : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedFlockId) {
      setError(t('sales.please_select_flock'));
      return;
    }

    if (numBirdsSold <= 0) {
      setError(t('sales.please_enter_valid_birds'));
      return;
    }

    if (numBirdsSold > birdsAvailable) {
      setError(`Cannot sell more birds than available (${birdsAvailable})`);
      return;
    }

    if (totalAmount <= 0) {
      setError('Total amount must be greater than 0');
      return;
    }

    setSaving(true);

    try {
      let finalCustomerId = customerId;

      // Auto-save new customer if name and phone provided but no customer selected
      if (customerName && customerPhone && !customerId && currentFarm?.id) {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('farm_id', currentFarm.id)
          .eq('phone', customerPhone)
          .maybeSingle();

        if (existingCustomer) {
          finalCustomerId = existingCustomer.id;
        } else {
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              farm_id: currentFarm.id,
              name: customerName,
              phone: customerPhone,
              address: customerAddress || null,
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

      const saleData = {
        farm_id: currentFarm?.id,
        flock_id: selectedFlockId,
        sale_date: saleDate,
        birds_sold: numBirdsSold,
        sale_method: saleMethod,
        price_per_bird: saleMethod === 'per_bird' ? parseFloat(pricePerBird) : pricePerBirdCalculated,
        price_per_kg: saleMethod === 'per_kg' ? parseFloat(pricePerKg) : null,
        total_weight_kg: saleMethod === 'per_kg' ? parseFloat(totalWeightKg) : null,
        total_amount: totalAmount,
        sale_type: saleType,
        customer_id: finalCustomerId,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        payment_status: paymentStatus,
        amount_paid: paymentStatus === 'paid' ? totalAmount : (paymentStatus === 'partial' ? parseFloat(amountPaid) : 0),
        amount_pending: paymentStatus === 'paid' ? 0 : (paymentStatus === 'partial' ? totalAmount - parseFloat(amountPaid) : totalAmount),
        notes: notes || null,
        recorded_by: user?.id,
      };

      const { error: insertError } = await supabase
        .from('bird_sales')
        .insert(saleData)
        .select()
        .single();

      if (insertError) throw insertError;

      setLastSaleDetails({
        farmName: currentFarm?.name || 'My Farm',
        flockName: selectedFlock?.name,
        birdsSold: numBirdsSold,
        saleDate,
        saleMethod,
        pricePerBird: saleMethod === 'per_bird' ? parseFloat(pricePerBird) : pricePerBirdCalculated,
        pricePerKg: saleMethod === 'per_kg' ? parseFloat(pricePerKg) : null,
        totalWeightKg: saleMethod === 'per_kg' ? parseFloat(totalWeightKg) : null,
        totalAmount,
        saleType,
        customerName,
        customerPhone,
        paymentStatus,
        amountPaid: paymentStatus === 'partial' ? parseFloat(amountPaid) : totalAmount,
        notes,
        currency,
      });

      setShowSuccess(true);
    } catch (err: any) {
      console.error('Error recording sale:', err);
      setError(err.message || 'Failed to record sale');
      setSaving(false);
    }
  };

  const handlePrintReceipt = () => {
    if (!lastSaleDetails) return;

    const receiptContent = `
      BIRD SALE RECEIPT
      Farm: ${lastSaleDetails.farmName}
      ${lastSaleDetails.flockName ? `Flock: ${lastSaleDetails.flockName}` : ''}
      Date: ${lastSaleDetails.saleDate}

      Birds Sold: ${lastSaleDetails.birdsSold}
      ${lastSaleDetails.saleMethod === 'per_bird' ? `Price per Bird: ${lastSaleDetails.pricePerBird.toLocaleString()} ${lastSaleDetails.currency}` : ''}
      ${lastSaleDetails.saleMethod === 'per_kg' ? `Price per Kg: ${lastSaleDetails.pricePerKg?.toLocaleString()} ${lastSaleDetails.currency}\nTotal Weight: ${lastSaleDetails.totalWeightKg} kg` : ''}
      ${lastSaleDetails.saleMethod === 'lump_sum' ? 'Sold as Lump Sum' : ''}

      Total Amount: ${lastSaleDetails.totalAmount.toLocaleString()} ${lastSaleDetails.currency}
      Payment Status: ${lastSaleDetails.paymentStatus}
      ${lastSaleDetails.paymentStatus === 'partial' ? `Amount Paid: ${lastSaleDetails.amountPaid.toLocaleString()} ${lastSaleDetails.currency}` : ''}

      ${lastSaleDetails.customerName ? `Customer: ${lastSaleDetails.customerName}` : ''}
      ${lastSaleDetails.customerPhone ? `Phone: ${lastSaleDetails.customerPhone}` : ''}
      ${lastSaleDetails.notes ? `Notes: ${lastSaleDetails.notes}` : ''}
    `;

    const printWindow = window.open('', '', 'height=600,width=800');
    if (printWindow) {
      const pre = printWindow.document.createElement('pre');
      pre.textContent = receiptContent;
      printWindow.document.title = 'Receipt';
      printWindow.document.body.appendChild(pre);
      printWindow.print();
    }
  };

  const handleSendReceipt = () => {
    if (!lastSaleDetails) return;

    const message = `*BIRD SALE RECEIPT*\n\nFarm: ${lastSaleDetails.farmName}\n${lastSaleDetails.flockName ? `Flock: ${lastSaleDetails.flockName}\n` : ''}Date: ${lastSaleDetails.saleDate}\n\nBirds Sold: ${lastSaleDetails.birdsSold}\n${lastSaleDetails.saleMethod === 'per_bird' ? `Price per Bird: ${lastSaleDetails.pricePerBird.toLocaleString()} ${lastSaleDetails.currency}` : ''}${lastSaleDetails.saleMethod === 'per_kg' ? `\nPrice per Kg: ${lastSaleDetails.pricePerKg?.toLocaleString()} ${lastSaleDetails.currency}\nTotal Weight: ${lastSaleDetails.totalWeightKg} kg` : ''}${lastSaleDetails.saleMethod === 'lump_sum' ? '\nSold as Lump Sum' : ''}\n\nTotal Amount: ${lastSaleDetails.totalAmount.toLocaleString()} ${lastSaleDetails.currency}\nPayment Status: ${lastSaleDetails.paymentStatus}${lastSaleDetails.paymentStatus === 'partial' ? `\nAmount Paid: ${lastSaleDetails.amountPaid.toLocaleString()} ${lastSaleDetails.currency}` : ''}\n\n${lastSaleDetails.customerName ? `Customer: ${lastSaleDetails.customerName}` : ''}${lastSaleDetails.customerPhone ? `\nPhone: ${lastSaleDetails.customerPhone}` : ''}${lastSaleDetails.notes ? `\nNotes: ${lastSaleDetails.notes}` : ''}`;
    shareViaWhatsApp(message);
  };

  const content = showSuccess && lastSaleDetails ? (
    <div className="text-center py-12 px-6">
      <div className="text-6xl mb-4">✅</div>
      <h3 className="text-2xl font-bold mb-2">Sale Recorded!</h3>
      <p className="text-gray-600 mb-8">
        {lastSaleDetails.birdsSold} birds sold for {lastSaleDetails.totalAmount.toLocaleString()} {lastSaleDetails.currency}
      </p>

      <div className="max-w-md mx-auto space-y-3">
        <p className="text-sm text-gray-500 mb-4">Would you like to print or send a receipt?</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handlePrintReceipt}
            className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Print Receipt
          </button>
          <button
            onClick={handleSendReceipt}
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Send className="w-5 h-5" />
            Send via WhatsApp
          </button>
        </div>
        <button
          onClick={() => {
            setShowSuccess(false);
            setLastSaleDetails(null);
            setBirdsSold('');
            setCustomerName('');
            setCustomerPhone('');
            setNotes('');
            setAmountPaid('');
            setTotalWeightKg('');
            setSaleDate(new Date().toISOString().split('T')[0]);
            onSuccess();
          }}
          className="w-full px-4 py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.select_flock')}</label>
            <select
              value={selectedFlockId}
              onChange={(e) => setSelectedFlockId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 text-gray-900 bg-white"
              required
            >
              <option value="">{t('sales.select_flock')}</option>
              {flocks.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name} ({t('sales.available_birds', { count: f.current_count })}) - {f.type}
                </option>
              ))}
            </select>
          </div>

          {selectedFlock && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Bird className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900">{selectedFlock.name}</span>
              </div>
              <p className="text-sm text-gray-600">
                {t('sales.available_birds', { count: birdsAvailable })}
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.sale_date')}</label>
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 text-gray-900 bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.birds_sold')}</label>
              <input
                type="number"
                value={birdsSold}
                onChange={(e) => setBirdsSold(e.target.value)}
                placeholder={t('sales.enter_quantity')}
                min="1"
                max={birdsAvailable}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 text-gray-900 bg-white"
                required
              />
              {numBirdsSold > 0 && (
                <p className={`text-sm mt-1 ${birdsRemaining < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {birdsRemaining >= 0
                    ? t('sales.birds_will_remain', { count: birdsRemaining })
                    : t('sales.exceeds_available')}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.sale_method')}</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'per_bird', label: t('sales.per_bird'), icon: Bird },
                { value: 'per_kg', label: t('sales.per_kg'), icon: Scale },
                { value: 'lump_sum', label: t('sales.lump_sum'), icon: DollarSign },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSaleMethod(value as any)}
                  className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${
                    saleMethod === value
                      ? 'border-neon-500 bg-neon-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${saleMethod === value ? 'text-neon-600' : 'text-gray-400'}`} />
                  <span className={`text-sm font-medium ${saleMethod === value ? 'text-gray-900' : 'text-gray-600'}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {saleMethod === 'per_bird' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.price_per_bird')} ({currency})</label>
              <input
                type="number"
                value={pricePerBird}
                onChange={(e) => setPricePerBird(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 text-gray-900 bg-white"
                required
              />
            </div>
          )}

          {saleMethod === 'per_kg' && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.total_weight_kg')}</label>
                <input
                  type="number"
                  step="0.1"
                  value={totalWeightKg}
                  onChange={(e) => setTotalWeightKg(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 text-gray-900 bg-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.price_per_kg')} ({currency})</label>
                <input
                  type="number"
                  value={pricePerKg}
                  onChange={(e) => setPricePerKg(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 text-gray-900 bg-white"
                  required
                />
              </div>
            </div>
          )}

          {saleMethod === 'lump_sum' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.total_amount')} ({currency})</label>
              <input
                type="number"
                value={lumpSumAmount}
                onChange={(e) => setLumpSumAmount(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 text-gray-900 bg-white"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.sale_type')}</label>
            <select
              value={saleType}
              onChange={(e) => setSaleType(e.target.value as any)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 text-gray-900 bg-white"
            >
              <option value="market">{t('sales.market')}</option>
              <option value="pre_order">{t('sales.pre_order')}</option>
              <option value="wholesale">{t('sales.wholesale')}</option>
              <option value="retail">{t('sales.retail')}</option>
            </select>
          </div>

          {currentFarm?.id && (
            <CustomerLookup
              farmId={currentFarm.id}
              initialPhone={customerPhone}
              onCustomerSelect={(customer) => {
                if (customer) {
                  setCustomerId(customer.id);
                  setCustomerName(customer.name);
                  setCustomerPhone(customer.phone);
                  setCustomerAddress(customer.address || '');
                } else {
                  setCustomerId(null);
                  setCustomerName('');
                  setCustomerPhone('');
                  setCustomerAddress('');
                }
              }}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.customer_name')}</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t('sales.enter_name')}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-gray-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.address_optional')}</label>
              <input
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder={t('sales.customer_address')}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-gray-900 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.payment_status')}</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'paid', label: t('sales.paid_in_full') },
                { value: 'partial', label: t('sales.partial_payment') },
                { value: 'credit', label: t('sales.credit_pay_later') },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPaymentStatus(value as any)}
                  className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    paymentStatus === value
                      ? value === 'paid'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : value === 'partial'
                        ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {paymentStatus === 'partial' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.amount_paid')} ({currency})</label>
              <input
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                max={totalAmount}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 text-gray-900 bg-white"
                required
              />
              {parseFloat(amountPaid) > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  {t('sales.pending')} {(totalAmount - parseFloat(amountPaid)).toLocaleString()} {currency}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.notes_optional')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('sales.notes_placeholder')}
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 resize-none text-gray-900 bg-white"
            />
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3">{t('sales.sale_summary')}</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{t('sales.birds_sold')}</span>
                <span className="font-medium text-gray-900">{numBirdsSold || 0}</span>
              </div>
              {saleMethod !== 'lump_sum' && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('sales.price_per_bird_summary')}</span>
                  <span className="font-medium text-gray-900">
                    {pricePerBirdCalculated.toLocaleString()} {currency}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="font-semibold text-gray-900">{t('sales.total_amount')}</span>
                <span className="font-bold text-green-600 text-lg">
                  {totalAmount.toLocaleString()} {currency}
                </span>
              </div>
              {selectedFlock && numBirdsSold > 0 && (
                <div className="flex justify-between pt-2 text-gray-500">
                  <span>{t('sales.birds_remaining_after_sale')}</span>
                  <span>{birdsRemaining.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            {!isEmbedded && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                {t('sales.cancel')}
              </button>
            )}
            <button
              type="submit"
              disabled={saving || numBirdsSold <= 0 || birdsRemaining < 0}
              className={`${isEmbedded ? 'w-full' : 'flex-1'} px-4 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
            >
              {saving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('sales.recording')}
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  {t('sales.record_sale_button')}
                </>
              )}
            </button>
          </div>
        </form>
  );

  if (isEmbedded) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200">
        {!showSuccess && (
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-xl font-bold text-gray-900">{t('sales.record_bird_sale')}</h2>
            <p className="text-sm text-gray-500">{t('sales.track_bird_sales')}</p>
          </div>
        )}
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t('sales.record_sale')}</h2>
            <p className="text-sm text-gray-500">{t('sales.track_bird_sales')}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
