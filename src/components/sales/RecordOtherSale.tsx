import { useState } from 'react';
import { Package, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';

/**
 * Record a non-livestock sale — manure, bedding, hay/fodder, breeder
 * stock, equipment, services, or "other".
 *
 * Feeds the `other_sales` table; a Postgres trigger then writes a
 * matching row into `revenues` so the Expenses page's Revenue
 * Generated panel + any P&L view picks it up automatically.
 *
 * Why this exists (May 2026 user request): farmers earn real money
 * from rabbit manure, used wood-shavings, hay surplus, etc. — but the
 * existing sales surfaces only covered live animals (bird/egg/rabbit/
 * fish). This form is the generic non-livestock revenue capture.
 */
interface Props {
  farmId: string;
  onSuccess?: () => void;
}

type Category =
  | 'manure'
  | 'bedding'
  | 'hay_fodder'
  | 'breeder'
  | 'equipment'
  | 'service'
  | 'other';

function categoryLabels(isFr: boolean): Array<{ value: Category; label: string; emoji: string }> {
  return [
    { value: 'manure',     emoji: '🪴', label: isFr ? 'Fumier'             : 'Manure / droppings' },
    { value: 'bedding',    emoji: '🪵', label: isFr ? 'Litière usée'        : 'Used bedding'       },
    { value: 'hay_fodder', emoji: '🌾', label: isFr ? 'Foin / fourrage'    : 'Hay / fodder'       },
    { value: 'breeder',    emoji: '🧬', label: isFr ? 'Reproducteur'       : 'Breeder stock'      },
    { value: 'equipment',  emoji: '🔧', label: isFr ? 'Équipement'         : 'Equipment'          },
    { value: 'service',    emoji: '🤝', label: isFr ? 'Service'             : 'Service'           },
    { value: 'other',      emoji: '📦', label: isFr ? 'Autre'               : 'Other'              },
  ];
}

export function RecordOtherSale({ farmId, onSuccess }: Props) {
  const { user, currentFarm } = useAuth();
  const toast = useToast();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const currency = currentFarm?.currency_code ?? 'XAF';

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const [category, setCategory] = useState<Category>('manure');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending' | 'partial'>('paid');
  const [soldAt, setSoldAt] = useState(today);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Auto-compute total when quantity × unit_price is set, unless the
  // user has typed a manual total. Manual wins over auto so the farmer
  // can override (e.g., a discount).
  const autoTotal = (() => {
    const q = parseFloat(quantity);
    const p = parseFloat(unitPrice);
    if (Number.isFinite(q) && Number.isFinite(p)) {
      return (q * p).toFixed(0);
    }
    return '';
  })();
  const displayTotal = totalAmount || autoTotal;

  const handleSave = async () => {
    if (!itemName.trim()) {
      toast.error(isFr ? "Donnez un nom à l'article" : 'Give the item a name');
      return;
    }
    const total = parseFloat(displayTotal);
    if (!Number.isFinite(total) || total <= 0) {
      toast.error(isFr ? 'Saisissez un montant total' : 'Enter a total amount');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('other_sales').insert({
      farm_id: farmId,
      user_id: user?.id ?? null,
      sold_at: soldAt,
      category,
      item_name: itemName.trim(),
      quantity: quantity ? parseFloat(quantity) : null,
      unit: unit.trim() || null,
      unit_price: unitPrice ? parseFloat(unitPrice) : null,
      total_amount: total,
      currency,
      buyer_name: buyerName.trim() || null,
      payment_status: paymentStatus,
      notes: notes.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast.error(isFr ? `Échec : ${error.message}` : `Failed: ${error.message}`);
      return;
    }
    toast.success(isFr ? 'Vente enregistrée' : 'Sale recorded');
    // Reset form (keep category/date so a farmer logging multiple
    // similar sales doesn't repeat themselves).
    setItemName('');
    setQuantity('');
    setUnit('');
    setUnitPrice('');
    setTotalAmount('');
    setBuyerName('');
    setNotes('');
    onSuccess?.();
  };

  const categories = categoryLabels(isFr);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
          <Package className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {isFr ? 'Vendre autre chose' : 'Sell something else'}
          </h2>
          <p className="text-xs text-gray-500">
            {isFr
              ? 'Fumier, litière, foin, reproducteurs, équipement, services…'
              : 'Manure, bedding, hay, breeders, equipment, services…'}
          </p>
        </div>
      </div>

      {/* Category — pill grid */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
          {isFr ? 'Catégorie' : 'Category'}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {categories.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                category === c.value
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="text-lg">{c.emoji}</span>
              <span className="text-center leading-tight">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isFr ? 'Article *' : 'Item *'}
          </label>
          <input
            type="text"
            value={itemName}
            onChange={e => setItemName(e.target.value)}
            placeholder={isFr ? 'ex. Fumier de lapin, sac 50 kg' : 'e.g. Rabbit manure, 50 kg bag'}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isFr ? 'Date de vente *' : 'Sale date *'}
          </label>
          <input
            type="date"
            value={soldAt}
            max={today}
            onChange={e => setSoldAt(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isFr ? 'Quantité' : 'Quantity'}
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            placeholder="10"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isFr ? 'Unité' : 'Unit'}
          </label>
          <input
            type="text"
            value={unit}
            onChange={e => setUnit(e.target.value)}
            placeholder={isFr ? 'sacs, kg, h…' : 'bags, kg, h…'}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isFr ? `Prix unitaire (${currency})` : `Unit price (${currency})`}
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={unitPrice}
            onChange={e => setUnitPrice(e.target.value)}
            placeholder="1000"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isFr ? `Total (${currency}) *` : `Total (${currency}) *`}
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={displayTotal}
            onChange={e => setTotalAmount(e.target.value)}
            placeholder={autoTotal || '0'}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 font-semibold"
          />
          {autoTotal && !totalAmount && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              {isFr ? `Auto : ${autoTotal} ${currency}` : `Auto: ${autoTotal} ${currency}`}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isFr ? 'Acheteur' : 'Buyer'}
          </label>
          <input
            type="text"
            value={buyerName}
            onChange={e => setBuyerName(e.target.value)}
            placeholder={isFr ? 'ex. M. Tchouala' : 'e.g. Mr Tchouala'}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isFr ? 'Paiement' : 'Payment'}
          </label>
          <select
            value={paymentStatus}
            onChange={e => setPaymentStatus(e.target.value as 'paid' | 'pending' | 'partial')}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="paid">{isFr ? 'Payé' : 'Paid'}</option>
            <option value="pending">{isFr ? 'En attente' : 'Pending'}</option>
            <option value="partial">{isFr ? 'Partiel' : 'Partial'}</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {isFr ? 'Notes' : 'Notes'}
        </label>
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={isFr ? 'Optionnel' : 'Optional'}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {isFr ? 'Enregistrer la vente' : 'Save sale'}
      </button>
    </div>
  );
}

export default RecordOtherSale;
