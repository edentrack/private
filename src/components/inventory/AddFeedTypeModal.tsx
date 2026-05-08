import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

interface AddFeedTypeModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AddFeedTypeModal({ onClose, onSuccess }: AddFeedTypeModalProps) {
  const { currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('bags');
  const [initialStock, setInitialStock] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFarm?.id) return;

    if (!name.trim()) {
      setError(isFr ? "Veuillez saisir un nom de type d'aliment" : 'Please enter a feed type name');
      return;
    }

    const stockNum = parseFloat(initialStock);
    if (!initialStock || isNaN(stockNum) || stockNum <= 0) {
      setError(isFr ? 'Veuillez saisir une quantité de stock initial valide (supérieure à 0)' : 'Please enter a valid initial stock quantity (greater than 0)');
      return;
    }

    setError('');
    setLoading(true);

    try {
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

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isFr ? "Échec de l'ajout du type d'aliment" : 'Failed to add feed type'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{isFr ? "Ajouter un type d'aliment" : 'Add Feed Type'}</h2>
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
              {isFr ? 'Stock initial' : 'Initial Stock'} <span className="text-red-500">*</span>
            </label>
            <input
              id="initialStock"
              type="number"
              step="0.01"
              min="0.01"
              value={initialStock}
              onChange={(e) => setInitialStock(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
              placeholder="e.g., 100"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {isFr ? `Saisissez la quantité initiale en ${unit}` : `Enter the initial quantity in ${unit}`}
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
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all resize-none"
              placeholder={isFr ? "Informations supplémentaires sur ce type d'aliment..." : 'Additional information about this feed type...'}
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
              {loading ? (isFr ? 'Ajout...' : 'Adding...') : (isFr ? "Ajouter le type d'aliment" : 'Add Feed Type')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
