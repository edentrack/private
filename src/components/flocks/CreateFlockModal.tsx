import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { logActivity, formatActorName, type AuthorRole } from '../../lib/journalLogger';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { FlockType } from '../../types/database';
import { upsertChickExpenses } from '../../utils/flockExpenses';
import { AnimalSpecies, getTypesForSpecies, getSpeciesTerminology } from '../../utils/speciesModules';
import { getMaxBirdsPerFlock, exceedsBirdLimit, getMaxFlocks } from '../../utils/planGating';
import { todayLocal } from '../../utils/dateUtils';

interface CreateFlockModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateFlockModal({ onClose, onCreated }: CreateFlockModalProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const { user, currentFarm, profile, currentRole } = useAuth();

  const farmKind = (currentFarm as any)?.farm_type ?? 'poultry';
  const isAquaculture = farmKind === 'aquaculture';
  const isRabbits = farmKind === 'rabbits';
  const [species] = useState<AnimalSpecies>(
    isAquaculture ? 'aquaculture' : isRabbits ? 'rabbits' : 'poultry'
  );

  const [name, setName] = useState('');
  const [type, setType] = useState<FlockType | null>(null);
  const [startDate, setStartDate] = useState(todayLocal());
  const [arrivalDate, setArrivalDate] = useState(todayLocal());
  const [initialCount, setInitialCount] = useState('');
  const [currentCount, setCurrentCount] = useState('');
  const [purchasePricePerBird, setPurchasePricePerBird] = useState('');
  const [purchaseTransportCost, setPurchaseTransportCost] = useState('');
  const [pondSizeSqm, setPondSizeSqm] = useState('');
  // Age the animals already had when stocked. Default 0 = "freshly hatched/stocked".
  // Most fish farmers buy fingerlings (~6 weeks) and most layer farmers
  // sometimes buy point-of-lay pullets (~18 weeks), so this picker matters.
  const [ageAtArrivalWeeks, setAgeAtArrivalWeeks] = useState(0);
  const [showCustomAge, setShowCustomAge] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const availableTypes = getTypesForSpecies(species);
  const terminology = getSpeciesTerminology(species);

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

      // Enforce active flock count limit
      const tier = profile?.subscription_tier ?? 'free';
      const maxFlocks = getMaxFlocks(tier);
      const { count: activeFlockCount } = await supabase
        .from('flocks')
        .select('id', { count: 'exact', head: true })
        .eq('farm_id', currentFarm!.id)
        .eq('status', 'active');
      if ((activeFlockCount ?? 0) >= maxFlocks) {
        const tierName = tier === 'free' ? 'Starter' : tier === 'pro' ? 'Grower' : 'Farm Boss';
        setError(`Your ${tierName} plan allows up to ${maxFlocks} active flock${maxFlocks !== 1 ? 's' : ''}. Archive an existing flock or upgrade your plan.`);
        setLoading(false);
        return;
      }

      // Enforce bird count limit based on plan
      const plan = (profile?.subscription_tier as any) || 'basic';
      const maxBirds = getMaxBirdsPerFlock(plan);
      if (exceedsBirdLimit(plan, initialCountNum)) {
        const perGroup = isAquaculture
          ? 'fish per pond'
          : isRabbits
            ? 'rabbits per rabbitry'
            : 'birds per flock';
        const upgradeNoun = isAquaculture
          ? 'larger ponds'
          : isRabbits
            ? 'larger rabbitries'
            : 'larger flocks';
        setError(
          `Your ${plan === 'basic' ? 'Starter' : plan === 'pro' ? 'Grower' : 'Farm Boss'} plan allows up to ${maxBirds.toLocaleString()} ${perGroup}. ` +
          `Upgrade your plan to add ${upgradeNoun}.`
        );
        setLoading(false);
        return;
      }
      const purchasePriceNum = parseFloat(purchasePricePerBird) || 0;
      const transportCostNum = parseFloat(purchaseTransportCost) || 0;

      const insertPayload: Record<string, unknown> = {
        user_id: user.id,
        farm_id: currentFarm.id,
        name,
        type,
        species,
        start_date: startDate,
        arrival_date: arrivalDate,
        age_at_arrival_days: Math.max(0, Math.round(ageAtArrivalWeeks * 7)),
        initial_count: initialCountNum,
        current_count: currentCountNum,
        purchase_price_per_bird: purchasePriceNum,
        purchase_transport_cost: transportCostNum,
        status: 'active',
      };
      if (isAquaculture && pondSizeSqm) {
        insertPayload.pond_size_sqm = parseFloat(pondSizeSqm);
        insertPayload.stocking_density = initialCountNum / parseFloat(pondSizeSqm);
      }

      const { data: flockData, error: insertError } = await supabase
        .from('flocks')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) throw insertError;

      if (flockData) {
        await upsertChickExpenses({
          flock: flockData,
          userId: user.id,
          farmId: currentFarm.id,
          currencyCode: currentFarm.currency_code || currentFarm.currency || 'XAF',
        });

        if (initialMortality > 0) {
          await supabase.from('mortality_logs').insert({
            farm_id: currentFarm.id,
            flock_id: flockData.id,
            event_date: arrivalDate,
            count: initialMortality,
            cause: 'Pre-app mortality',
            notes: 'Mortality that occurred before using Edentrack app',
            created_by: user.id,
          });
        }

        // Farm Journal: log the new flock. "Three Samples (owner)
        // created flock 'Layer Pen 1' with 500 birds (broiler)."
        {
          const role: AuthorRole = (currentRole === 'owner' || currentRole === 'manager' || currentRole === 'worker') ? currentRole : 'worker';
          const actor = formatActorName({
            fullName: profile?.full_name,
            email: profile?.email,
            role,
          });
          void logActivity({
            farmId: currentFarm.id,
            flockId: flockData.id,
            entryType: 'flock_created',
            actorRole: role,
            body: `${actor} created flock "${name}" with ${currentCountNum} ${type}`,
            metadata: {
              linked_table: 'flocks',
              flock_name: name,
              type,
              species,
              initial_count: initialCountNum,
            },
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
          <h2 className="text-lg font-bold text-gray-900">
            {isAquaculture
              ? (isFr ? 'Créer un nouvel étang' : 'Create new pond')
              : isRabbits
                ? (isFr ? 'Créer un nouvel élevage' : 'Create new rabbitry')
                : (isFr ? 'Créer un nouveau troupeau' : `${t('flocks.create_new')} flock`)}
          </h2>
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
                  const getDescriptionForType = (animalType: string) => {
                    if (animalType === 'Layer') return t('flocks.egg_production');
                    if (animalType === 'Broiler') return t('flocks.meat_production');
                    if (animalType === 'Meat Rabbits') return t('flocks.meat_production');
                    if (animalType === 'Breeder Rabbits') return t('flocks.breeding');
                    return '';
                  };
                  const isSelected = type === animalType;
                  const getDisplayName = (t: string) => {
                    if (!isFr) return t;
                    if (t === 'Broiler') return 'Poulet de chair';
                    if (t === 'Layer') return 'Pondeuse';
                    if (t === 'Meat Rabbits') return 'Lapins de chair';
                    if (t === 'Breeder Rabbits') return 'Lapins reproducteurs';
                    if (t === 'Catfish') return 'Poisson-chat';
                    if (t === 'Tilapia') return 'Tilapia';
                    if (t === 'Clarias') return 'Clarias';
                    if (t === 'Other Fish') return 'Autre poisson';
                    return t;
                  };
                  return (
                    <button
                      key={animalType}
                      type="button"
                      onClick={() => setType(animalType as FlockType)}
                      className={`px-3 py-3.5 rounded-xl border-2 transition-all bg-[#faf7f2] text-center ${
                        isSelected ? 'border-gray-900 bg-[#f5f0e8] shadow-sm' : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className={`text-sm font-bold tracking-tight leading-tight ${
                        isSelected ? 'text-gray-900' : 'text-gray-800'
                      }`}>
                        {getDisplayName(animalType)}
                      </div>
                      {getDescriptionForType(animalType) && (
                        <div className="text-[11px] italic text-gray-500 mt-1 leading-tight">
                          {getDescriptionForType(animalType)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-xs font-medium text-gray-700 mb-1">
              {isAquaculture
                ? (isFr ? "Nom de l'étang" : 'Pond name')
                : isRabbits
                  ? (isFr ? "Nom de l'élevage" : 'Rabbitry name')
                  : t('flocks.flock_name')}
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-2 py-1.5 text-sm bg-white border border-gray-900 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-400 focus:border-gray-900"
              placeholder={isAquaculture
                ? (isFr ? 'ex. Étang 1 - Poisson-chat' : 'e.g. Pond 1 - Catfish')
                : isRabbits
                  ? (isFr ? 'ex. Bloc clapier A' : 'e.g. Hutch Block A')
                  : t('flocks.flock_name_placeholder')}
            />
          </div>

          {isAquaculture && (
            <div>
              <label htmlFor="pondSize" className="block text-xs font-medium text-gray-700 mb-1">
                {isFr ? "Taille de l'étang (m²)" : 'Pond size (m²)'} <span className="text-gray-400 font-normal">{isFr ? ' - optionnel' : ' - optional'}</span>
              </label>
              <input
                id="pondSize"
                type="number"
                step="0.1"
                min="0"
                value={pondSizeSqm}
                onChange={(e) => setPondSizeSqm(e.target.value)}
                className="w-full px-2 py-1.5 text-sm bg-white border border-gray-900 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-900"
                placeholder="200"
              />
              <p className="text-[10px] text-gray-500 mt-0.5">{isFr ? "Utilisé pour calculer la densité d'empoissonnement (poissons/m²)" : 'Used to calculate stocking density (fish/m²)'}</p>
            </div>
          )}

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

          {/* Age-at-arrival picker — handles point-of-lay pullets, fingerlings,
              and retroactive tracking. Default = 0 (freshly hatched/stocked). */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              {isFr ? "Quel âge avaient-ils à l'arrivée ?" : 'How old were they when you got them?'}
            </label>
            {(() => {
              // Species-specific lifecycle presets — pick the most common
              // entry points so the farmer can tap one chip instead of
              // figuring out the week number.
              const presets: Array<{ label: string; weeks: number; sublabel?: string }> = isAquaculture
                ? [
                    { label: isFr ? 'Larves' : 'Fry', weeks: 1, sublabel: isFr ? '1–2 sem · 0,1–2 g' : '1–2w · 0.1–2g' },
                    { label: isFr ? 'Alevins' : 'Fingerlings', weeks: 6, sublabel: isFr ? '5–8 sem · 5–15 g · le plus courant' : '5–8w · 5–15g · most common' },
                    { label: isFr ? 'Juvéniles' : 'Juveniles', weeks: 12, sublabel: isFr ? '12 sem+ · 50–150 g' : '12w+ · 50–150g' },
                    { label: isFr ? 'Adultes' : 'Adults', weeks: 20, sublabel: isFr ? '20 sem+ · stock adulte' : '20w+ · grown stock' },
                  ]
                : isRabbits
                ? [
                    { label: isFr ? 'Lapereaux (sevrés)' : 'Kits (weaned)', weeks: 4, sublabel: isFr ? '~4 sem · juste sevrés' : '~4w · just weaned' },
                    { label: isFr ? 'Sevrés' : 'Weanlings', weeks: 6, sublabel: isFr ? '~6 sem · achat le plus courant' : '~6w · most common buy-in' },
                    { label: isFr ? 'En croissance' : 'Growers', weeks: 9, sublabel: isFr ? '~9 sem · phase de croissance' : '~9w · growing phase' },
                    { label: isFr ? 'Adultes' : 'Adults', weeks: 16, sublabel: isFr ? '16 sem+ · reproducteurs' : '16w+ · breeding stock' },
                  ]
                : [
                    { label: isFr ? "Poussins d'un jour" : 'Day-old chicks', weeks: 0, sublabel: isFr ? "Frais de l'écloserie" : 'Fresh from hatchery' },
                    { label: isFr ? 'Croissance' : 'Growers', weeks: 6, sublabel: isFr ? '~6 sem' : '~6w old' },
                    { label: isFr ? 'Poulettes' : 'Pullets', weeks: 13, sublabel: isFr ? '~13 sem' : '~13w old' },
                    { label: isFr ? 'Point de ponte' : 'Point-of-lay', weeks: 18, sublabel: isFr ? '~18 sem · prêtes à pondre' : '~18w · ready to lay' },
                  ];
              return (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    {presets.map((p) => {
                      const active = !showCustomAge && ageAtArrivalWeeks === p.weeks;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => { setAgeAtArrivalWeeks(p.weeks); setShowCustomAge(false); }}
                          className={`text-left px-2.5 py-1.5 rounded-lg border transition-all ${
                            active
                              ? 'border-gray-900 bg-[#f5f0e8]'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="text-xs font-semibold text-gray-900">{p.label}</div>
                          {p.sublabel && <div className="text-[10px] text-gray-500 mt-0.5">{p.sublabel}</div>}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCustomAge((v) => !v)}
                    className="mt-1.5 text-[11px] text-gray-600 hover:text-gray-900 underline"
                  >
                    {showCustomAge
                      ? (isFr ? ' - fermer personnalisé' : ' - close custom')
                      : (isFr ? '+ saisir un âge personnalisé' : '+ enter custom age')}
                  </button>
                  {showCustomAge && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="200"
                        step="1"
                        value={ageAtArrivalWeeks}
                        onChange={(e) => setAgeAtArrivalWeeks(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-20 px-2 py-1 text-sm bg-white border border-gray-900 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-400"
                      />
                      <span className="text-xs text-gray-600">weeks old at arrival</span>
                    </div>
                  )}
                  {ageAtArrivalWeeks > 0 && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      Tracking will start at {isAquaculture ? 'pond' : isRabbits ? 'rabbitry' : 'flock'} week {ageAtArrivalWeeks + 1} ·
                      not week 1.
                    </p>
                  )}
                </>
              );
            })()}
          </div>

          <div>
            <label htmlFor="initialCount" className="block text-xs font-medium text-gray-700 mb-1">
              {isAquaculture
                ? (isFr ? "Alevins empoissonnés" : 'Fingerlings stocked')
                : isRabbits
                  ? (isFr ? "Lapins introduits" : 'Rabbits stocked')
                  : t('flocks.initial_count')}
              {!isAquaculture && (
                <span className="ml-1 text-gray-400 font-normal">
                  {isFr
                    ? `(max ${getMaxBirdsPerFlock((profile?.subscription_tier as any) || 'basic').toLocaleString()} selon votre forfait)`
                    : `(max ${getMaxBirdsPerFlock((profile?.subscription_tier as any) || 'basic').toLocaleString()} on your plan)`}
                </span>
              )}
            </label>
            <input
              id="initialCount"
              type="number"
              value={initialCount}
              onChange={(e) => setInitialCount(e.target.value)}
              required
              min="1"
              className="w-full px-2 py-1.5 text-sm bg-white border border-gray-900 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-900"
              placeholder={isAquaculture ? '1000' : '1000'}
            />
            <p className="text-[10px] text-gray-600 mt-0.5">
              {isAquaculture
                ? (isFr ? "Total d'alevins empoissonnés dans cet étang" : 'Total fingerlings you stocked in this pond')
                : isRabbits
                  ? (isFr ? "Total des lapins dans ce bloc clapier" : 'Total rabbits in this hutch block')
                  : t('flocks.total_birds_you_started_with')}
            </p>
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
            {!currentCount && (
              <p className="text-[10px] text-gray-600 mt-0.5">
                {isAquaculture
                  ? (isFr ? "Laissez vide si aucun poisson n'est mort avant d'utiliser cette application" : 'Leave empty if no fish died before using this app')
                  : isRabbits
                    ? (isFr ? "Laissez vide si aucun lapin n'est mort avant d'utiliser cette application" : 'Leave empty if no rabbits died before using this app')
                    : t('flocks.leave_empty_if_no_deaths')}
              </p>
            )}
          </div>

          <div className="p-3 bg-[#faf7f2] border border-gray-200 rounded-lg space-y-3">
            <h3 className="font-semibold text-gray-900 text-xs">{t('flocks.purchase_costs_optional')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="purchasePricePerBird" className="block text-xs font-medium text-gray-700 mb-1">
                  {isAquaculture
                    ? (isFr ? 'Prix par alevin' : 'Price per fingerling')
                    : isRabbits
                      ? (isFr ? 'Prix par lapin' : 'Price per rabbit')
                      : t('flocks.price_per_bird')}
                </label>
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
              <p className="text-xs text-gray-900">{t('flocks.total_purchase_cost')} {(parseFloat(purchasePricePerBird) * parseFloat(initialCount)).toLocaleString()} {currentFarm?.currency_code || currentFarm?.currency || 'XAF'}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-[#faf7f2] bg-white">
              {t('flocks.cancel')}
            </button>
            <button type="submit" disabled={loading || !species || !type} className="flex-1 px-4 py-2.5 text-sm border-2 border-gray-900 text-gray-900 rounded-lg font-medium hover:bg-[#faf7f2] bg-white disabled:opacity-50 disabled:cursor-not-allowed">
              {loading
                ? (isFr ? 'Création…' : (isAquaculture ? 'Creating…' : isRabbits ? 'Creating…' : t('flocks.creating')))
                : (isAquaculture
                    ? (isFr ? 'Créer un étang' : 'Create Pond')
                    : isRabbits
                      ? (isFr ? 'Créer un élevage' : 'Create Rabbitry')
                      : (isFr ? 'Créer un troupeau' : t('flocks.create_flock')))}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
