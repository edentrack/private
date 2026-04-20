import { useState, useEffect } from 'react';
import { DollarSign, CheckCircle, AlertTriangle, Package, Printer, Send } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/currency';
import { escapeHtml } from '../../utils/escapeHtml';
import { shareViaWhatsApp } from '../../utils/whatsappShare';

interface RecordEggSaleProps {
  farmId: string;
  onSuccess?: () => void;
}

interface EggInventory {
  small_eggs: number;
  medium_eggs: number;
  large_eggs: number;
  jumbo_eggs: number;
}

export function RecordEggSale({ farmId, onSuccess }: RecordEggSaleProps) {
  const { t } = useTranslation();
  const { profile, currentFarm } = useAuth();
  const [loading, setLoading] = useState(false);
  const [eggsPerTray, setEggsPerTray] = useState(30);
  const [inputMode, setInputMode] = useState<'eggs' | 'trays'>('eggs');
  const [trayEggType, setTrayEggType] = useState<'small' | 'medium' | 'large' | 'jumbo' | 'mixed'>('large');
  const [mixedRatioMode, setMixedRatioMode] = useState<'auto' | 'custom'>('auto');
  const [customRatios, setCustomRatios] = useState({
    small: 25,
    medium: 25,
    large: 25,
    jumbo: 25,
  });
  const [inventory, setInventory] = useState<EggInventory | null>(null);
  const [successMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSaleDetails, setLastSaleDetails] = useState<any>(null);
  const [formData, setFormData] = useState({
    sale_date: new Date().toISOString().split('T')[0],
    customer_name: '',
    customer_phone: '',
    small_eggs_sold: 0,
    medium_eggs_sold: 0,
    large_eggs_sold: 0,
    jumbo_eggs_sold: 0,
    trays_sold: 0,
    small_price: 0,
    medium_price: 0,
    large_price: 0,
    jumbo_price: 0,
    price_per_tray: 0,
    payment_status: 'paid',
    payment_method: 'cash',
    notes: '',
  });

  useEffect(() => {
    loadInventory();
    loadFarmSettings();
  }, [farmId]);

  async function loadFarmSettings() {
    const { data } = await supabase
      .from('farms')
      .select('eggs_per_tray')
      .eq('id', farmId)
      .single();

    if (data?.eggs_per_tray) {
      setEggsPerTray(data.eggs_per_tray);
    }
  }

  async function loadInventory() {
    const { data } = await supabase
      .from('egg_inventory')
      .select('*')
      .eq('farm_id', farmId)
      .maybeSingle();

    setInventory(data);
  }

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

  const handleTraysChange = (trays: number) => {
    const distribution = calculateEggDistribution(trays);
    setFormData({
      ...formData,
      trays_sold: trays,
      small_eggs_sold: distribution.small,
      medium_eggs_sold: distribution.medium,
      large_eggs_sold: distribution.large,
      jumbo_eggs_sold: distribution.jumbo,
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      if (formData.small_eggs_sold > (inventory?.small_eggs || 0)) {
        setErrorMessage(`Not enough small eggs! Only ${inventory?.small_eggs || 0} in stock`);
        setTimeout(() => setErrorMessage(null), 3000);
        setLoading(false);
        return;
      }
      if (formData.medium_eggs_sold > (inventory?.medium_eggs || 0)) {
        setErrorMessage(`Not enough medium eggs! Only ${inventory?.medium_eggs || 0} in stock`);
        setTimeout(() => setErrorMessage(null), 3000);
        setLoading(false);
        return;
      }
      if (formData.large_eggs_sold > (inventory?.large_eggs || 0)) {
        setErrorMessage(`Not enough large eggs! Only ${inventory?.large_eggs || 0} in stock`);
        setTimeout(() => setErrorMessage(null), 3000);
        setLoading(false);
        return;
      }
      if (formData.jumbo_eggs_sold > (inventory?.jumbo_eggs || 0)) {
        setErrorMessage(`Not enough jumbo eggs! Only ${inventory?.jumbo_eggs || 0} in stock`);
        setTimeout(() => setErrorMessage(null), 3000);
        setLoading(false);
        return;
      }

      const totalAmount =
        (formData.small_eggs_sold * formData.small_price) +
        (formData.medium_eggs_sold * formData.medium_price) +
        (formData.large_eggs_sold * formData.large_price) +
        (formData.jumbo_eggs_sold * formData.jumbo_price);

      const totalEggs =
        formData.small_eggs_sold +
        formData.medium_eggs_sold +
        formData.large_eggs_sold +
        formData.jumbo_eggs_sold;

      if (totalEggs === 0) {
        setErrorMessage('Please enter at least some eggs to sell');
        setTimeout(() => setErrorMessage(null), 3000);
        setLoading(false);
        return;
      }

      const { error: saleError } = await supabase
        .from('egg_sales')
        .insert({
          farm_id: farmId,
          sold_on: formData.sale_date,
          sale_date: formData.sale_date,
          trays: formData.trays_sold,
          unit_price: formData.small_price || formData.medium_price || formData.large_price || formData.jumbo_price,
          customer_name: formData.customer_name || null,
          customer_phone: formData.customer_phone || null,
          small_eggs_sold: formData.small_eggs_sold,
          medium_eggs_sold: formData.medium_eggs_sold,
          large_eggs_sold: formData.large_eggs_sold,
          jumbo_eggs_sold: formData.jumbo_eggs_sold,
          small_price: formData.small_price,
          medium_price: formData.medium_price,
          large_price: formData.large_price,
          jumbo_price: formData.jumbo_price,
          total_eggs: totalEggs,
          total_amount: totalAmount,
          payment_status: formData.payment_status,
          payment_method: formData.payment_method,
          sold_by: profile?.id,
          notes: formData.notes || null,
        });

      if (saleError) throw saleError;

      // Deduct sold eggs from egg_inventory (fetch current row so it can't drift)
      const { data: invRow } = await supabase
        .from('egg_inventory')
        .select('small_eggs, medium_eggs, large_eggs, jumbo_eggs')
        .eq('farm_id', farmId)
        .maybeSingle();

      const curSmall = Number(invRow?.small_eggs ?? 0) || 0;
      const curMedium = Number(invRow?.medium_eggs ?? 0) || 0;
      const curLarge = Number(invRow?.large_eggs ?? 0) || 0;
      const curJumbo = Number(invRow?.jumbo_eggs ?? 0) || 0;

      if (invRow) {
        await supabase
          .from('egg_inventory')
          .update({
            small_eggs: Math.max(0, curSmall - formData.small_eggs_sold),
            medium_eggs: Math.max(0, curMedium - formData.medium_eggs_sold),
            large_eggs: Math.max(0, curLarge - formData.large_eggs_sold),
            jumbo_eggs: Math.max(0, curJumbo - formData.jumbo_eggs_sold),
            last_updated: new Date().toISOString(),
          })
          .eq('farm_id', farmId);
      } else {
        await supabase.from('egg_inventory').insert({
          farm_id: farmId,
          small_eggs: Math.max(0, curSmall - formData.small_eggs_sold),
          medium_eggs: Math.max(0, curMedium - formData.medium_eggs_sold),
          large_eggs: Math.max(0, curLarge - formData.large_eggs_sold),
          jumbo_eggs: Math.max(0, curJumbo - formData.jumbo_eggs_sold),
          last_updated: new Date().toISOString(),
        });
      }

      const currencyCode = currentFarm?.currency_code || 'XAF';

      await supabase
        .from('revenues')
        .insert({
          farm_id: farmId,
          flock_id: null,
          source_type: 'egg_sale',
          source_id: null,
          amount: totalAmount,
          currency: currencyCode,
          description: formData.customer_name
            ? `Egg sale to ${formData.customer_name} - ${totalEggs} eggs`
            : `Egg sale - ${totalEggs} eggs`,
          revenue_date: formData.sale_date,
        });

      setLastSaleDetails({
        farmName: currentFarm?.name || 'My Farm',
        totalEggs,
        totalAmount,
        currencyCode,
        sale_date: formData.sale_date,
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        small_eggs_sold: formData.small_eggs_sold,
        medium_eggs_sold: formData.medium_eggs_sold,
        large_eggs_sold: formData.large_eggs_sold,
        jumbo_eggs_sold: formData.jumbo_eggs_sold,
        small_price: formData.small_price,
        medium_price: formData.medium_price,
        large_price: formData.large_price,
        jumbo_price: formData.jumbo_price,
        payment_status: formData.payment_status,
        payment_method: formData.payment_method,
        notes: formData.notes,
        inputMode,
        trays_sold: formData.trays_sold,
        eggsPerTray,
        trayEggType,
      });
      setShowSuccess(true);

      setFormData({
        sale_date: new Date().toISOString().split('T')[0],
        customer_name: '',
        customer_phone: '',
        small_eggs_sold: 0,
        medium_eggs_sold: 0,
        large_eggs_sold: 0,
        jumbo_eggs_sold: 0,
        trays_sold: 0,
        small_price: 0,
        medium_price: 0,
        large_price: 0,
        jumbo_price: 0,
        price_per_tray: 0,
        payment_status: 'paid',
        payment_method: 'cash',
        notes: '',
      });
      setInputMode('eggs');

      loadInventory();

    } catch (error) {
      console.error('Error recording sale:', error);
      setErrorMessage(t('sales.failed_to_record') || 'Failed to record sale. Please try again.');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setLoading(false);
    }
  }

  const totalAmount =
    (formData.small_eggs_sold * formData.small_price) +
    (formData.medium_eggs_sold * formData.medium_price) +
    (formData.large_eggs_sold * formData.large_price) +
    (formData.jumbo_eggs_sold * formData.jumbo_price);

  const totalEggs =
    formData.small_eggs_sold +
    formData.medium_eggs_sold +
    formData.large_eggs_sold +
    formData.jumbo_eggs_sold;

  const formatStockAsTrays = (eggs: number) => {
    if (eggsPerTray <= 0) return `${eggs.toLocaleString()} eggs`;
    const trays = eggs / eggsPerTray;
    const trayText = Number.isInteger(trays) ? trays.toLocaleString() : trays.toFixed(1);
    return `${trayText} trays (${eggs.toLocaleString()})`;
  };

  const currencyCode = currentFarm?.currency_code || 'XAF';

  const handlePrintReceipt = () => {
    if (!lastSaleDetails) return;

    let itemsSold = '';
    if (lastSaleDetails.inputMode === 'trays') {
      itemsSold = `Trays Sold: ${lastSaleDetails.trays_sold} trays (${lastSaleDetails.eggsPerTray} eggs/tray)`;
      if (lastSaleDetails.trayEggType !== 'mixed') {
        itemsSold += `\n      Type: ${lastSaleDetails.trayEggType.charAt(0).toUpperCase() + lastSaleDetails.trayEggType.slice(1)}`;
      }
    } else {
      if (lastSaleDetails.small_eggs_sold > 0) itemsSold += `Small: ${lastSaleDetails.small_eggs_sold} @ ${lastSaleDetails.small_price} ${lastSaleDetails.currencyCode}\n      `;
      if (lastSaleDetails.medium_eggs_sold > 0) itemsSold += `Medium: ${lastSaleDetails.medium_eggs_sold} @ ${lastSaleDetails.medium_price} ${lastSaleDetails.currencyCode}\n      `;
      if (lastSaleDetails.large_eggs_sold > 0) itemsSold += `Large: ${lastSaleDetails.large_eggs_sold} @ ${lastSaleDetails.large_price} ${lastSaleDetails.currencyCode}\n      `;
      if (lastSaleDetails.jumbo_eggs_sold > 0) itemsSold += `Jumbo: ${lastSaleDetails.jumbo_eggs_sold} @ ${lastSaleDetails.jumbo_price} ${lastSaleDetails.currencyCode}\n      `;
    }

    const receiptContent = `
      EGG SALE RECEIPT
      Farm: ${lastSaleDetails.farmName}
      Date: ${lastSaleDetails.sale_date}

      ${itemsSold}
      Total Eggs: ${lastSaleDetails.totalEggs}

      Total Amount: ${lastSaleDetails.totalAmount.toLocaleString()} ${lastSaleDetails.currencyCode}
      Payment Status: ${lastSaleDetails.payment_status}
      Payment Method: ${lastSaleDetails.payment_method}

      ${lastSaleDetails.customer_name ? `Customer: ${lastSaleDetails.customer_name}` : ''}
      ${lastSaleDetails.customer_phone ? `Phone: ${lastSaleDetails.customer_phone}` : ''}
      ${lastSaleDetails.notes ? `Notes: ${lastSaleDetails.notes}` : ''}
    `;

    const printWindow = window.open('', '', 'height=600,width=800');
    if (printWindow) {
      const safeContent = escapeHtml(receiptContent);
      printWindow.document.write('<html><head><title>Receipt</title></head><body>');
      printWindow.document.write('<pre>' + safeContent + '</pre>');
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleSendReceipt = () => {
    if (!lastSaleDetails) return;

    let itemsSold = '';
    if (lastSaleDetails.inputMode === 'trays') {
      itemsSold = `Trays Sold: ${lastSaleDetails.trays_sold} trays (${lastSaleDetails.eggsPerTray} eggs/tray)`;
      if (lastSaleDetails.trayEggType !== 'mixed') {
        itemsSold += `\nType: ${lastSaleDetails.trayEggType.charAt(0).toUpperCase() + lastSaleDetails.trayEggType.slice(1)}`;
      }
    } else {
      itemsSold = 'Eggs Sold:\n';
      if (lastSaleDetails.small_eggs_sold > 0) itemsSold += `Small: ${lastSaleDetails.small_eggs_sold} @ ${lastSaleDetails.small_price} ${lastSaleDetails.currencyCode}\n`;
      if (lastSaleDetails.medium_eggs_sold > 0) itemsSold += `Medium: ${lastSaleDetails.medium_eggs_sold} @ ${lastSaleDetails.medium_price} ${lastSaleDetails.currencyCode}\n`;
      if (lastSaleDetails.large_eggs_sold > 0) itemsSold += `Large: ${lastSaleDetails.large_eggs_sold} @ ${lastSaleDetails.large_price} ${lastSaleDetails.currencyCode}\n`;
      if (lastSaleDetails.jumbo_eggs_sold > 0) itemsSold += `Jumbo: ${lastSaleDetails.jumbo_eggs_sold} @ ${lastSaleDetails.jumbo_price} ${lastSaleDetails.currencyCode}\n`;
    }

    const message = `*EGG SALE RECEIPT*\n\nFarm: ${lastSaleDetails.farmName}\nDate: ${lastSaleDetails.sale_date}\n\n${itemsSold}\nTotal Eggs: ${lastSaleDetails.totalEggs}\n\nTotal Amount: ${lastSaleDetails.totalAmount.toLocaleString()} ${lastSaleDetails.currencyCode}\nPayment Status: ${lastSaleDetails.payment_status}\nPayment Method: ${lastSaleDetails.payment_method}\n\n${lastSaleDetails.customer_name ? `Customer: ${lastSaleDetails.customer_name}` : ''}${lastSaleDetails.customer_phone ? `\nPhone: ${lastSaleDetails.customer_phone}` : ''}${lastSaleDetails.notes ? `\nNotes: ${lastSaleDetails.notes}` : ''}`;
    shareViaWhatsApp(message);
  };

  if (showSuccess && lastSaleDetails) {
    return (
      <div className="bg-white rounded-2xl shadow-soft p-6">
        <div className="text-center py-12 px-6">
          <div className="text-6xl mb-4">✅</div>
          <h3 className="text-2xl font-bold mb-2">{t('sales.sale_recorded') || 'Sale Recorded!'}</h3>
          <p className="text-gray-600 mb-8">
            {lastSaleDetails.totalEggs} {t('sales.eggs').toLowerCase()} {t('sales.sold_for') || 'sold for'} {lastSaleDetails.totalAmount.toLocaleString()} {lastSaleDetails.currencyCode}
          </p>

          <div className="max-w-md mx-auto space-y-3">
            <p className="text-sm text-gray-500 mb-4">{t('sales.print_or_send_receipt') || 'Would you like to print or send a receipt?'}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handlePrintReceipt}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="w-5 h-5" />
                {t('sales.print_receipt') || 'Print Receipt'}
              </button>
              <button
                onClick={handleSendReceipt}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Send className="w-5 h-5" />
                {t('sales.send_via_whatsapp') || 'Send via WhatsApp'}
              </button>
            </div>
            <button
              onClick={() => {
                setShowSuccess(false);
                setLastSaleDetails(null);
                onSuccess?.();
              }}
              className="w-full px-4 py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              {t('common.done') || 'Done'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-soft p-6">
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border-2 border-green-200 rounded-xl flex items-start gap-3 animate-fade-in">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-green-900">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-3 animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-red-900">{errorMessage}</p>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
          <DollarSign className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">{t('sales.record_egg_sale')}</h3>
      </div>

      {inventory && (
        <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-semibold text-blue-900">{t('sales.current_stock')}:</p>
          </div>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="bg-white rounded-lg p-2 text-center">
              <p className="font-bold text-blue-900">{formatStockAsTrays(Number(inventory.small_eggs || 0))}</p>
              <p className="text-xs text-gray-600">{t('sales.small')}</p>
            </div>
            <div className="bg-white rounded-lg p-2 text-center">
              <p className="font-bold text-blue-900">{formatStockAsTrays(Number(inventory.medium_eggs || 0))}</p>
              <p className="text-xs text-gray-600">{t('sales.medium')}</p>
            </div>
            <div className="bg-white rounded-lg p-2 text-center">
              <p className="font-bold text-blue-900">{formatStockAsTrays(Number(inventory.large_eggs || 0))}</p>
              <p className="text-xs text-gray-600">{t('sales.large')}</p>
            </div>
            <div className="bg-white rounded-lg p-2 text-center">
              <p className="font-bold text-blue-900">{formatStockAsTrays(Number(inventory.jumbo_eggs || 0))}</p>
              <p className="text-xs text-gray-600">{t('sales.jumbo')}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            {t('sales.sale_date')}
          </label>
          <input
            type="date"
            value={formData.sale_date}
            onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all text-gray-900 bg-white"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t('sales.customer_name')} <span className="text-gray-500 font-normal">({t('common.optional')})</span>
            </label>
            <input
              type="text"
              value={formData.customer_name}
              onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all text-gray-900 bg-white"
              placeholder={t('sales.customer_name')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t('sales.customer_phone')} <span className="text-gray-500 font-normal">({t('common.optional')})</span>
            </label>
            <input
              type="tel"
              value={formData.customer_phone}
              onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all text-gray-900 bg-white"
              placeholder={t('sales.phone')}
            />
          </div>
        </div>

        <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setInputMode('eggs')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              inputMode === 'eggs'
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('sales.by_eggs')}
          </button>
          <button
            type="button"
            onClick={() => setInputMode('trays')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              inputMode === 'trays'
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('sales.by_trays')}
          </button>
        </div>

        {inputMode === 'trays' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                {t('sales.egg_size')}
              </label>
              <select
                value={trayEggType}
                onChange={(e) => {
                  const newType = e.target.value as 'small' | 'medium' | 'large' | 'jumbo' | 'mixed';
                  setTrayEggType(newType);
                  handleTraysChange(formData.trays_sold);
                }}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all text-gray-900 bg-white"
              >
                <option value="small">{t('sales.small_eggs_only')}</option>
                <option value="medium">{t('sales.medium_eggs_only')}</option>
                <option value="large">{t('sales.large_eggs_only')}</option>
                <option value="jumbo">{t('sales.jumbo_eggs_only')}</option>
                <option value="mixed">{t('sales.mixed_sizes')}</option>
              </select>
            </div>

            {trayEggType === 'mixed' && (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-3">
                <label className="block text-sm font-semibold text-gray-900">
                  {t('sales.mixed_eggs_distribution')}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMixedRatioMode('auto');
                      handleTraysChange(formData.trays_sold);
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      mixedRatioMode === 'auto'
                        ? 'bg-white text-blue-700 shadow-sm border-2 border-blue-300'
                        : 'text-gray-600 hover:text-gray-900 border-2 border-transparent'
                    }`}
                  >
                    {t('sales.auto_equal')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMixedRatioMode('custom');
                      handleTraysChange(formData.trays_sold);
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      mixedRatioMode === 'custom'
                        ? 'bg-white text-blue-700 shadow-sm border-2 border-blue-300'
                        : 'text-gray-600 hover:text-gray-900 border-2 border-transparent'
                    }`}
                  >
                    {t('sales.custom')} {t('sales.ratio') || 'Ratio'}
                  </button>
                </div>

                {mixedRatioMode === 'custom' && (
                  <div className="space-y-2 mt-3">
                    <p className="text-xs text-gray-600 font-medium">{t('sales.ratio_percentages')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">{t('sales.small')} %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={customRatios.small}
                          onChange={(e) => {
                            setCustomRatios({ ...customRatios, small: Number(e.target.value) });
                            handleTraysChange(formData.trays_sold);
                          }}
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm text-gray-900 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">{t('sales.medium')} %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={customRatios.medium}
                          onChange={(e) => {
                            setCustomRatios({ ...customRatios, medium: Number(e.target.value) });
                            handleTraysChange(formData.trays_sold);
                          }}
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm text-gray-900 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">{t('sales.large')} %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={customRatios.large}
                          onChange={(e) => {
                            setCustomRatios({ ...customRatios, large: Number(e.target.value) });
                            handleTraysChange(formData.trays_sold);
                          }}
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm text-gray-900 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">{t('sales.jumbo')} %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={customRatios.jumbo}
                          onChange={(e) => {
                            setCustomRatios({ ...customRatios, jumbo: Number(e.target.value) });
                            handleTraysChange(formData.trays_sold);
                          }}
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm text-gray-900 bg-white"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Total: {customRatios.small + customRatios.medium + customRatios.large + customRatios.jumbo}%
                    </p>
                  </div>
                )}

                <div className="bg-white rounded-lg p-3 mt-3">
                  <p className="text-xs font-semibold text-gray-700 mb-2">{t('sales.distribution_preview')}:</p>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <p className="text-gray-600">{t('sales.small')}</p>
                      <p className="font-bold text-gray-900">{formData.small_eggs_sold}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">{t('sales.medium')}</p>
                      <p className="font-bold text-gray-900">{formData.medium_eggs_sold}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">{t('sales.large')}</p>
                      <p className="font-bold text-gray-900">{formData.large_eggs_sold}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">{t('sales.jumbo')}</p>
                      <p className="font-bold text-gray-900">{formData.jumbo_eggs_sold}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                {t('sales.number_of_trays')} ({eggsPerTray} {t('sales.eggs')} {t('sales.per_tray') || 'per tray'})
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={formData.trays_sold}
                onChange={(e) => handleTraysChange(Number(e.target.value))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all text-gray-900 bg-white"
              />
              <p className="text-xs text-gray-600 mt-1">
                {t('sales.total_eggs') || 'Total eggs'}: {formData.small_eggs_sold + formData.medium_eggs_sold + formData.large_eggs_sold + formData.jumbo_eggs_sold}
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                {t('sales.price_per_tray')}
              </label>
              <input
                type="number"
                min="0"
                value={formData.price_per_tray}
                onChange={(e) => {
                  const pricePerTray = Number(e.target.value);
                  const pricePerEgg = pricePerTray / eggsPerTray;
                  setFormData({
                    ...formData,
                    price_per_tray: pricePerTray,
                    small_price: pricePerEgg,
                    medium_price: pricePerEgg,
                    large_price: pricePerEgg,
                    jumbo_price: pricePerEgg,
                  });
                }}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all text-gray-900 bg-white"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">{t('sales.eggs_sold')}</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t('sales.small_eggs_quantity')}
              </label>
              <input
                type="number"
                min="0"
                max={inventory?.small_eggs || 0}
                value={formData.small_eggs_sold}
                onChange={(e) => setFormData({ ...formData, small_eggs_sold: Number(e.target.value) })}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all text-sm text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t('sales.price_per_egg')} ({currencyCode})
              </label>
              <input
                type="number"
                min="0"
                value={formData.small_price}
                onChange={(e) => setFormData({ ...formData, small_price: Number(e.target.value) })}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all text-sm text-gray-900 bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t('sales.medium_eggs_quantity')}
              </label>
              <input
                type="number"
                min="0"
                max={inventory?.medium_eggs || 0}
                value={formData.medium_eggs_sold}
                onChange={(e) => setFormData({ ...formData, medium_eggs_sold: Number(e.target.value) })}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all text-sm text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t('sales.price_per_egg')} ({currencyCode})
              </label>
              <input
                type="number"
                min="0"
                value={formData.medium_price}
                onChange={(e) => setFormData({ ...formData, medium_price: Number(e.target.value) })}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all text-sm text-gray-900 bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t('sales.large_eggs_quantity')}
              </label>
              <input
                type="number"
                min="0"
                max={inventory?.large_eggs || 0}
                value={formData.large_eggs_sold}
                onChange={(e) => setFormData({ ...formData, large_eggs_sold: Number(e.target.value) })}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all text-sm text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t('sales.price_per_egg')} ({currencyCode})
              </label>
              <input
                type="number"
                min="0"
                value={formData.large_price}
                onChange={(e) => setFormData({ ...formData, large_price: Number(e.target.value) })}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all text-sm text-gray-900 bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t('sales.jumbo_eggs_quantity')}
              </label>
              <input
                type="number"
                min="0"
                max={inventory?.jumbo_eggs || 0}
                value={formData.jumbo_eggs_sold}
                onChange={(e) => setFormData({ ...formData, jumbo_eggs_sold: Number(e.target.value) })}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all text-sm text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t('sales.price_per_egg')} ({currencyCode})
              </label>
              <input
                type="number"
                min="0"
                value={formData.jumbo_price}
                onChange={(e) => setFormData({ ...formData, jumbo_price: Number(e.target.value) })}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all text-sm text-gray-900 bg-white"
              />
            </div>
          </div>
        </div>
        )}

        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-green-900">{t('sales.total_eggs')}: {totalEggs}</p>
            <p className="text-xl font-bold text-green-900">{formatCurrency(totalAmount, currencyCode)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t('sales.payment_status')}
            </label>
            <select
              value={formData.payment_status}
              onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all text-gray-900 bg-white"
            >
              <option value="paid">{t('sales.paid')}</option>
              <option value="pending">{t('sales.pending')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t('sales.payment_method')}
            </label>
            <select
              value={formData.payment_method}
              onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all text-gray-900 bg-white"
            >
              <option value="cash">{t('sales.cash')}</option>
              <option value="card">{t('sales.card')}</option>
              <option value="mobile_money">{t('sales.mobile_money')}</option>
              <option value="bank_transfer">{t('sales.bank_transfer')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            {t('sales.notes')} <span className="text-gray-500 font-normal">({t('common.optional')})</span>
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all resize-none text-gray-900 bg-white"
            placeholder={t('sales.additional_notes_placeholder')}
          />
        </div>

        <button
          type="submit"
          disabled={loading || totalAmount === 0}
          className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-semibold hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 transition-all shadow-sm hover:shadow-md"
        >
          {loading ? t('sales.recording') : `${t('sales.record_sale')} (${formatCurrency(totalAmount, currencyCode)})`}
        </button>
      </div>
    </form>
  );
}
