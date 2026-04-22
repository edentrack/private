import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { FlockType } from '../../types/database';
import { upsertChickExpenses } from '../../utils/flockExpenses';
import { AnimalSpecies, getTypesForSpecies, getSpeciesTerminology } from '../../utils/speciesModules';
import { getMaxBirdsPerFlock, exceedsBirdLimit } from '../../utils/planGating';

interface CreateFlockModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateFlockModal({ onClose, onCreated }: CreateFlockModalProps) {
  const { t } = useTranslation();
  const { user, currentFarm, profile } = useAuth();
  const [species] = useState<AnimalSpecies | null>('poultry'); // Auto-select poultry
  const [name, setName] = useState('');
  const [type, setType] = useState<FlockType | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().split('T')[0]);
  const [initialCount, setInitialCount] = useState('');
  const [currentCount, setCurrentCount] = useState('');
  const [purchasePricePerBird, setPurchasePricePerBird] = useState('');
  const [purchaseTransportCost, setPurchaseTransportCost] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const availableTypes = species ? getTypesForSpecies(species) : [];
  const terminology = species ? getSpeciesTerminology(species) : null;

  const initialMortality = (parseInt(initialCount) || 0) - (parseInt(currentCount || initialCount) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!species) {
      setError(t('flocks.please_select_species'));
      return;
    }
    if (!type) {
      setError(t('flocks.please_select_type'));
      return;
    }

    if (!currentFarm?.id || !user?.id) {
      setError('Unable to create flock. Please try again.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const initialCountNum = parseInt(initialCount);
      const currentCountNum = parseInt(currentCount || initialCount);

      // Enforce bird count limit based on plan
      const plan = (profile?.subscription_tier as any) || 'basic';
      const maxBirds = getMaxBirdsPerFlock(plan);
      if (exceedsBirdLimit(plan, initialCountNum)) {
        setError(
          `Your ${plan === 'basic' ? 'Starter' : plan === 'pro' ? 'Grower' : 'Farm Boss'} plan allows up to ${maxBirds.toLocaleString()} birds per flock. ` +
          `Upgrade your plan to add larger flocks.`
        );
        setLoading(false);
        return;
      }
      const purchasePriceNum = parseFloat(purchasePricePerBird) || 0;
      const transportCostNum = parseFloat(purchaseTransportCost) || 0;

      const { data: flockData, error: insertError } = await supabase
        .from('flocks')
        .insert({
          user_id: user.id,
          farm_id: currentFarm.id,
          name,
          type,
          species: species || 'poultry',
          start_date: startDate,
          arrival_date: arrivalDate,
          initial_count: initialCountNum,
          current_count: currentCountNum,
          purchase_price_per_bird: purchasePriceNum,
          purchase_transport_cost: transportCostNum,
          status: 'active',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (flockData) {
        await upsertChickExpenses({
          flock: flockData,
          userId: user.id,
          farmId: currentFarm.id,
          currencyCode: currentFarm.currency_code || currentFarm.currency || 'CFA',
        });

        if (initialMortality > 0) {
          await supabase.from('mortality_logs').insert({
            farm_id: currentFarm.id,
            flock_id: flockData.id,
            event_date: arrivalDate,
            count: initialMortality,
            cause: 'Pre-app mortality',
            notes: 'Mortality that occurred before using Ebenezer Farm app',
            created_by: user.id,
          });
        }
      }

      await supabase.from('activity_logs').insert({
        farm_id: currentFarm.id,
        user_id: user.id,
        action: `Created ${type} ${terminology?.group?.toLowerCase() || 'flock'}: ${name} with ${initialCountNum} ${terminology?.animals?.toLowerCase() || 'birds'}`,
        entity_type: 'flock',
        entity_id: flockData?.id,
        details: {
          name,
          type,
          initial_count: initialCountNum,
          purchase_price: purchasePriceNum,
          transport_cost: transportCostNum
        }
      });

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flock');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4"
      style={{ overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}
    >
      <div
        className="bg-[#f5f0e8] rounded-2xl max-w-xl w-full shadow-xl my-4"
        style={{
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-gray-200/60">
          <h2 className="text-lg font-bold text-gray-900">{t('flocks.create_new')} flock</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#e8e0d4] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3"
          style={{
            minHeight: 0,
            flex: '1 1 0%',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-xs">
              {error}
            </div>
          )}


          {species && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">{t('flocks.select_type')}</label>
              <div className={`grid gap-2 ${availableTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {availableTypes.map((animalType) => {
                  const getImageForType = (t: string) => {
                    if (t === 'Layer') return '/layer.jpg';
                    if (t === 'Broiler') return '/broiler.png';
                    if (t === 'Tilapia') return '/tilapia.jpg';
                    if (t === 'Catfish') return '/catfish.png';
                    if (t === 'Other Fish') return '/other-fish.avif';
                    if (t === 'Meat Rabbits' || t === 'Breeder Rabbits') return '/rabbit.avif';
                    return '/broiler.png';
                  };
                  const getDescriptionForType = (animalType: string) => {
                    if (animalType === 'Layer') return t('flocks.egg_production');
                    if (animalType === 'Broiler') return t('flocks.meat_production');
                    if (animalType === 'Meat Rabbits') return t('flocks.meat_production');
                    if (animalType === 'Breeder Rabbits') return t('flocks.breeding');
                    return '';
                  };
                  return (
                    <button
                      key={animalType}
                      type="button"
                      onClick={() => setType(animalType as FlockType)}
                      className={`p-2 rounded-xl border-2 transition-all bg-[#faf7f2] text-left ${
                        type === animalType ? 'border-gray-900 bg-[#f5f0e8]' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <img
                        src={getImageForType(animalType)}
                        alt={animalType}
                        className={`w-10 h-10 object-contain mx-auto mb-1 mix-blend-multiply ${
                          (animalType === 'Other Fish' || animalType === 'Meat Rabbits' || animalType === 'Breeder Rabbits') ? 'image-remove-white' : ''
                        }`}
                        style={{ backgroundColor: 'transparent' }}
                      />
                      <div className="text-xs font-bold text-gray-900 leading-tight">{animalType}</div>
                      {getDescriptionForType(animalType) && (
                        <div className="text-[10px] text-gray-600 mt-0.5">{getDescriptionForType(animalType)}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-xs font-medium text-gray-700 mb-1">{t('flocks.flock_name')}</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-2 py-1.5 text-sm bg-white border border-gray-900 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-400 focus:border-gray-900"
              placeholder={t('flocks.flock_name_placeholder')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="startDate" className="block text-xs font-medium text-gray-700 mb-1">{t('flocks.start_date')}</label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full px-2 py-1.5 text-sm bg-white border border-gray-900 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-900"
              />
            </div>
            <div>
              <label htmlFor="arrivalDate" className="block text-xs font-medium text-gray-700 mb-1">{t('flocks.arrival_date')}</label>
              <input
                id="arrivalDate"
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
                required
                className="w-full px-2 py-1.5 text-sm bg-white border border-gray-900 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="initialCount" className="block text-xs font-medium text-gray-700 mb-1">
              {t('flocks.initial_count')}
              <span className="ml-1 text-gray-400 font-normal">
                (max {getMaxBirdsPerFlock((profile?.subscription_tier as any) || 'basic').toLocaleString()} on your plan)
              </span>
            </label>
            <input
              id="initialCount"
              type="number"
              value={initialCount}
              onChange={(e) => setInitialCount(e.target.value)}
              required
              min="1"
              className="w-full px-2 py-1.5 text-sm bg-white border border-gray-900 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-900"
              placeholder="1000"
            />
            <p className="text-[10px] text-gray-600 mt-0.5">{t('flocks.total_birds_you_started_with')}</p>
          </div>

          <div>
            <label htmlFor="currentCount" className="block text-xs font-medium text-gray-700 mb-1">{t('flocks.current_count_optional')}</label>
            <input
              id="currentCount"
              type="number"
              value={currentCount}
              onChange={(e) => setCurrentCount(e.target.value)}
              min="0"
              max={initialCount}
              className="w-full px-2 py-1.5 text-sm bg-white border border-gray-900 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-900"
              placeholder={initialCount || t('flocks.current_count_placeholder')}
            />
            {initialCount && currentCount && initialMortality > 0 && (
              <p className="text-xs text-amber-600 mt-1 bg-amber-50 px-2 py-1 rounded">{t('flocks.pre_app_mortality_notice', { count: initialMortality, animals: terminology?.animals?.toLowerCase() || 'birds' })}</p>
            )}
            {!currentCount && <p className="text-[10px] text-gray-600 mt-0.5">{t('flocks.leave_empty_if_no_deaths')}</p>}
          </div>

          <div className="p-3 bg-[#faf7f2] border border-gray-200 rounded-lg space-y-3">
            <h3 className="font-semibold text-gray-900 text-xs">{t('flocks.purchase_costs_optional')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="purchasePricePerBird" className="block text-xs font-medium text-gray-700 mb-1">{t('flocks.price_per_bird')}</label>
                <input
                  id="purchasePricePerBird"
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchasePricePerBird}
                  onChange={(e) => setPurchasePricePerBird(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-white border border-gray-900 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-900"
                  placeholder="250"
                />
              </div>
              <div>
                <label htmlFor="purchaseTransportCost" className="block text-xs font-medium text-gray-700 mb-1">{t('flocks.transport_cost')}</label>
                <input
                  id="purchaseTransportCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseTransportCost}
                  onChange={(e) => setPurchaseTransportCost(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-white border border-gray-900 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-900"
                  placeholder="50000"
                />
              </div>
            </div>
            {purchasePricePerBird && initialCount && (
              <p className="text-xs text-gray-900">{t('flocks.total_purchase_cost')} {(parseFloat(purchasePricePerBird) * parseFloat(initialCount)).toLocaleString()} {currentFarm?.currency_code || currentFarm?.currency || 'CFA'}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-[#faf7f2] bg-white">
              {t('flocks.cancel')}
            </button>
            <button type="submit" disabled={loading || !species || !type} className="flex-1 px-4 py-2.5 text-sm border-2 border-gray-900 text-gray-900 rounded-lg font-medium hover:bg-[#faf7f2] bg-white disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? t('flocks.creating') : t('flocks.create_flock')}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
