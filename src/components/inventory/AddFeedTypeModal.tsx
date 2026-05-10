import { useState } from 'react';
import { X, ScanLine, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Capacitor } from '@capacitor/core';
import { scanBarcode, tapLight, tapSuccess, tapWarning } from '../../lib/capacitorNative';
import { todayLocal } from '../../utils/dateUtils';
import type { Currency } from '../../types/database';

interface AddFeedTypeModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * AddFeedTypeModal — used both for "create a new feed type" and "log a
 * fresh purchase of feed". The cost capture turns this into an inventory
 * + expenses unified entry: when the farmer scans a feed bag at the
 * supplier, we want one form that:
 *   1. Adds the feed to inventory (quantity), AND
 *   2. Logs the purchase as an expense (amount + currency + date),
 * so they don't have to remember to do it twice.
 *
 * The barcode scan is a quick-fill helper. Barcodes don't carry price
 * data — only an identifier — so the farmer still types the amount
 * paid. But the scan saves typing the feed-name from scratch and helps
 * disambiguate brands when they have multiple suppliers.
 */
export function AddFeedTypeModal({ onClose, onSuccess }: AddFeedTypeModalProps) {
  const { currentFarm, profile, user } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  // Feed-type fields
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('bags');
  const [initialStock, setInitialStock] = useState('');
  const [notes, setNotes] = useState('');
  // Expense fields — opt-in by default when amount is entered. We default
  // currency to the farm's currency but allow override (some farmers buy
  // imported feed in USD even on a XAF farm).
  const farmCurrency = (currentFarm?.currency_code || currentFarm?.currency || 'XAF') as Currency;
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState<Currency>(farmCurrency);
  const [purchaseDate, setPurchaseDate] = useState(todayLocal());
  const [logExpense, setLogExpense] = useState(true);
  // Scan tracking — once we've scanned a barcode, surface a small chip so
  // the farmer can see what was captured (helpful if the auto-fill chose
  // wrong and they've since edited the name).
  const [scannedRef, setScannedRef] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  /**
   * Open the camera scanner and pre-fill the name field with whatever
   * the barcode/QR encoded. For UPC/EAN barcodes that's just digits,
   * which isn't a great feed-type name on its own, so we prefix with
   * "Feed " and let the farmer rename. For QR codes that often encode
   * a brand+SKU string, we use the value directly.
   */
  const handleScan = async () => {
    setError('');
    const raw = await scanBarcode();
    if (!raw) return; // user cancelled
    await tapLight();
    setScannedRef(raw);
    if (!name) {
      // Heuristic: 8–14 digits looks like a UPC/EAN barcode, not a name.
      // Anything else (QR with text) we treat as a brand string.
      const isNumeric = /^\d{8,14}$/.test(raw);
      setName(isNumeric ? `Feed ${raw.slice(-6)}` : raw);
    }
    // Capture the raw value in notes so we never lose it, even if the
    // farmer edits the name field manually later.
    setNotes(prev => prev ? `${prev}\n[Scanned] ${raw}` : `[Scanned] ${raw}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFarm?.id) return;

    if (!name.trim()) {
      setError(isFr ? "Veuillez saisir un nom de type d'aliment" : 'Please enter a feed type name');
      await tapWarning();
      return;
    }

    const stockNum = parseFloat(initialStock);
    if (!initialStock || isNaN(stockNum) || stockNum <= 0) {
      setError(isFr ? 'Veuillez saisir une quantité de stock initial valide (supérieure à 0)' : 'Please enter a valid initial stock quantity (greater than 0)');
      await tapWarning();
      return;
    }

    // Cost is optional — but if logExpense is on, it must be > 0.
    const costNum = costAmount ? parseFloat(costAmount) : 0;
    if (logExpense && costAmount && (isNaN(costNum) || costNum < 0)) {
      setError(isFr ? 'Le coût doit être un nombre positif' : 'Cost must be a positive number');
      await tapWarning();
      return;
    }

    setError('');
    setLoading(true);

    try {
      // 1. Create the feed type row.
      const { data: feedType, error: feedTypeError } = await supabase
        .from('feed_types')
        .insert({
          farm_id: currentFarm.id,
          name: name.trim(),
          unit: unit || 'bags',
          description: notes.trim() || null,
        })
        .select()
        .single();

      if (feedTypeError) throw feedTypeError;

      // 2. Create the inventory row with initial stock.
      if (stockNum > 0) {
        const { error: inventoryError } = await supabase
          .from('feed_inventory')
          .insert({
            farm_id: currentFarm.id,
            feed_type_id: feedType.id,
            quantity: stockNum,
          });

        if (inventoryError) throw inventoryError;
      }

      // 3. If the farmer entered a cost AND opted into expense-logging,
      //    create the matching expense row. Linked to the inventory item
      //    so the expense view shows "X bags of Layer Mash @ Y XAF".
      if (logExpense && costNum > 0 && user?.id && profile?.id) {
        const expensePayload = {
          user_id: user.id,
          farm_id: currentFarm.id,
          flock_id: null,
          category: 'feed' as const,
          amount: costNum,
          currency: costCurrency,
          description: `${stockNum} ${unit} ${name.trim()}${scannedRef ? ` (scanned: ${scannedRef})` : ''}`,
          incurred_on: purchaseDate,
          inventory_link_type: 'existing',
          inventory_item_id: feedType.id,
          inventory_quantity: stockNum,
          inventory_unit: unit,
          paid_from_profit: false,
        };
        // Best-effort: if the expense insert fails, the inventory row is
        // still in place. We surface a soft warning rather than rolling
        // back the feed addition (the inventory data is still useful).
        const { error: expenseError } = await supabase.from('expenses').insert(expensePayload);
        if (expenseError) {
          console.warn('[AddFeedTypeModal] Expense not saved:', expenseError);
          await tapWarning();
          setError(isFr
            ? "Type d'aliment ajouté, mais la dépense n'a pas pu être enregistrée. Vous pouvez l'ajouter manuellement."
            : 'Feed type added, but the expense couldn\'t be saved. You can add it manually.');
          // Don't return early — still call onSuccess so the inventory
          // shows up. The user sees the warning above the closing modal.
        }
      }

      await tapSuccess();
      onSuccess();
    } catch (err) {
      await tapWarning();
      setError(err instanceof Error ? err.message : (isFr ? "Échec de l'ajout du type d'aliment" : 'Failed to add feed type'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{isFr ? "Ajouter un type d'aliment" : 'Add Feed Type'}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Scan barcode — only on native (camera). Pre-fills the name
              field if it's empty, and stamps the scan ref into notes. */}
          {isNative && (
            <button
              type="button"
              onClick={handleScan}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-[#3D5F42]/30 text-[#3D5F42] rounded-lg text-sm font-semibold hover:bg-[#3D5F42]/5 transition-colors"
            >
              <ScanLine className="w-4 h-4" />
              {isFr ? "Scanner le code-barres du sac" : 'Scan feed bag barcode'}
            </button>
          )}
          {scannedRef && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              {isFr ? 'Code scanné' : 'Scanned code'}: <span className="font-mono">{scannedRef}</span>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              {isFr ? "Nom du type d'aliment" : 'Feed Type Name'} <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
              placeholder={isFr ? 'ex. Aliment pondeuse 50 kg' : 'e.g., Layer Mash 50kg'}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-2">
                {isFr ? 'Unité' : 'Unit'}
              </label>
              <select
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
              >
                <option value="bags">{isFr ? 'Sacs' : 'Bags'}</option>
                <option value="kg">{isFr ? 'Kilogrammes (kg)' : 'Kilograms (kg)'}</option>
                <option value="tonnes">{isFr ? 'Tonnes' : 'Tonnes'}</option>
                <option value="sacks">{isFr ? 'Sacs (sacks)' : 'Sacks'}</option>
              </select>
            </div>
            <div>
              <label htmlFor="initialStock" className="block text-sm font-medium text-gray-700 mb-2">
                {isFr ? 'Quantité' : 'Quantity'} <span className="text-red-500">*</span>
              </label>
              <input
                id="initialStock"
                type="number"
                step="0.01"
                min="0.01"
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
                placeholder="100"
                required
              />
            </div>
          </div>

          {/* Cost capture — drives the auto-expense. Empty = inventory-only.
              Filled = inventory + matching expense row. */}
          <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <DollarSign className="w-4 h-4 text-amber-700" />
                {isFr ? 'Coût payé (optionnel)' : 'Cost paid (optional)'}
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={logExpense}
                  onChange={(e) => setLogExpense(e.target.checked)}
                  className="rounded"
                />
                {isFr ? 'Enregistrer comme dépense' : 'Log as expense'}
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={costAmount}
                onChange={(e) => setCostAmount(e.target.value)}
                placeholder="0.00"
                className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-500"
              />
              <select
                value={costCurrency}
                onChange={(e) => setCostCurrency(e.target.value as Currency)}
                className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="XAF">XAF</option>
                <option value="XOF">XOF</option>
                <option value="NGN">NGN</option>
                <option value="GHS">GHS</option>
                <option value="KES">KES</option>
                <option value="ZAR">ZAR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            {logExpense && costAmount && (
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-500"
              />
            )}
            <p className="text-xs text-gray-500 leading-relaxed">
              {isFr
                ? "Si vous saisissez un montant, il sera également enregistré dans Dépenses, lié à cet article d'inventaire."
                : 'If you enter an amount, it will also be saved to Expenses, linked to this inventory item.'}
            </p>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              {isFr ? 'Notes (Optionnel)' : 'Notes (Optional)'}
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all resize-none"
              placeholder={isFr ? "Informations supplémentaires..." : 'Additional information...'}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4632] transition-colors font-medium disabled:opacity-50"
            >
              {loading ? (isFr ? 'Ajout...' : 'Adding...') : (isFr ? "Enregistrer" : 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
