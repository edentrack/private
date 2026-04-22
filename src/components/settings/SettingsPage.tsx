import { useEffect, useState, useCallback } from 'react';
import { Save, Building2, DollarSign, ArrowLeft, Egg, Globe, MapPin, Shield, TrendingUp, Users, Package, ListChecks, AlertTriangle, RefreshCw, CheckCircle, HelpCircle, LayoutDashboard } from 'lucide-react';
import { resetTour } from '../onboarding/OnboardingTour';
import { useSimpleMode } from '../../contexts/SimpleModeContext';
import { getDeadLetterCount } from '../../lib/offlineDB';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Farm } from '../../types/database';
import { SUPPORTED_COUNTRIES, getCurrencyForCountry, getCurrencySymbol } from '../../utils/currency';
import { FarmPermissionsSettings } from './FarmPermissionsSettings';
import { FarmLocationSettings } from './FarmLocationSettings';
import { TeamContactsSettings } from './TeamContactsSettings';
import { FlockTargetsSettings } from './FlockTargetsSettings';
import { DailyReportSettings } from './DailyReportSettings';
import { ReferralSection } from './ReferralSection';
import { CollapsibleSection } from './CollapsibleSection';

interface SettingsPageProps {
  onNavigate: (view: string) => void;
}

export function SettingsPage({ onNavigate }: SettingsPageProps) {
  const { t, i18n } = useTranslation();
  const { setLanguage } = useLanguage();
  const { showToast } = useToast();
  const language = (i18n.language || 'en') as 'en' | 'fr';
  const { user, currentFarm, currentRole, refreshSession } = useAuth();

  const isOwner = currentRole === 'owner';
  const isManager = currentRole === 'manager';
  const isWorker = currentRole === 'worker';
  const { simpleMode, toggleSimpleMode } = useSimpleMode();

  const [farm, setFarm] = useState<Farm | null>(null);
  const [farmName, setFarmName] = useState('');
  const [country, setCountry] = useState('Cameroon');
  const [currencyCode, setCurrencyCode] = useState('XAF');
  const [isCustomCurrency, setIsCustomCurrency] = useState(false);
  const [customCurrencyCode, setCustomCurrencyCode] = useState('');
  const [customCurrencySymbol, setCustomCurrencySymbol] = useState('');
  const [eggsPerTray, setEggsPerTray] = useState('30');
  const [costPerEggOverride, setCostPerEggOverride] = useState('');
  // exchangeRate = how many local currency units per 1 USD
  const [exchangeRate, setExchangeRate] = useState('655.957');
  const [rateLastFetched, setRateLastFetched] = useState('');
  const [fetchingRate, setFetchingRate] = useState(false);
  const [viewMode, setViewMode] = useState<'compact' | 'comfortable'>('comfortable');
  const [feedUnit, setFeedUnit] = useState('bags');
  const [feedQuantityPerBag, setFeedQuantityPerBag] = useState('50');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deadLetterCount, setDeadLetterCount] = useState(0);

  useEffect(() => {
    if (currentFarm?.id) loadSettings();
    getDeadLetterCount().then(setDeadLetterCount);
  }, [currentFarm?.id]);

  const loadSettings = async () => {
    if (!currentFarm?.id) return;
    try {
      const { data: farmData } = await supabase
        .from('farms')
        .select('*')
        .eq('id', currentFarm.id)
        .single();

      if (farmData) {
        setFarm(farmData);
        setFarmName(farmData.name ?? '');
        const farmCountry = farmData.country || 'Cameroon';
        setCountry(farmCountry);
        const code = farmData.currency_code || farmData.currency || 'XAF';
        setCurrencyCode(code);
        setEggsPerTray(farmData.eggs_per_tray?.toString() || '30');
        setCostPerEggOverride(farmData.cost_per_egg_override?.toString() || '');
        setFeedUnit(farmData.feed_unit || 'bags');
        setFeedQuantityPerBag(farmData.feed_quantity_per_bag?.toString() || '50');

        const mappedCurrency = getCurrencyForCountry(farmCountry);
        if (mappedCurrency !== code && farmCountry !== 'Other / Custom') {
          setIsCustomCurrency(true);
          setCustomCurrencyCode(code);
        }
      }

      if (user) {
        const { data: prefsData } = await supabase
          .from('user_preferences')
          .select('exchange_rate, view_mode, rate_last_fetched')
          .eq('id', user.id)
          .maybeSingle();

        if (prefsData) {
          if (prefsData.exchange_rate) setExchangeRate(prefsData.exchange_rate);
          if (prefsData.view_mode === 'compact' || prefsData.view_mode === 'comfortable') {
            setViewMode(prefsData.view_mode);
          }
          if (prefsData.rate_last_fetched) setRateLastFetched(prefsData.rate_last_fetched);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    if (newCountry === 'Other / Custom') {
      setIsCustomCurrency(true);
      setCurrencyCode(customCurrencyCode || 'USD');
    } else {
      setIsCustomCurrency(false);
      const newCurrency = getCurrencyForCountry(newCountry);
      setCurrencyCode(newCurrency);
      setCustomCurrencyCode('');
      setCustomCurrencySymbol('');
    }
  };

  const handleFetchRate = useCallback(async () => {
    setFetchingRate(true);
    try {
      // Free, no-API-key currency API (CDN-hosted, no rate limits)
      const res = await fetch(
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json'
      );
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      const rates = data.usd as Record<string, number>;
      const code = (isCustomCurrency ? customCurrencyCode : currencyCode).toLowerCase();
      const rate = rates[code];

      if (rate) {
        const rounded = rate.toFixed(4);
        setExchangeRate(rounded);
        const now = new Date().toLocaleString();
        setRateLastFetched(now);
        showToast(`Live rate fetched: 1 USD = ${parseFloat(rounded).toLocaleString()} ${currencyCode}`, 'success');
      } else {
        showToast(`Rate not found for ${currencyCode}. Please enter manually.`, 'warning');
      }
    } catch {
      showToast('Could not fetch live rate. Check your connection or enter manually.', 'error');
    } finally {
      setFetchingRate(false);
    }
  }, [currencyCode, customCurrencyCode, isCustomCurrency, showToast]);

  const handleSave = async () => {
    if (!currentFarm?.id) return;

    if (isWorker) {
      setSaving(true);
      try {
        await supabase.from('user_preferences').upsert({
          id: user!.id,
          updated_at: new Date().toISOString(),
        });
        showToast(t('settings.settings_saved') || 'Settings saved', 'success');
      } catch {
        showToast(t('settings.save_failed') || 'Failed to save', 'error');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!farm) return;
    setSaving(true);

    try {
      const eggsPerTrayNum = parseFloat(eggsPerTray);
      const costPerEggOverrideNum = costPerEggOverride ? parseFloat(costPerEggOverride) : null;
      const finalCurrencyCode = isCustomCurrency ? (customCurrencyCode || currencyCode) : currencyCode;

      if (isOwner) {
        const feedQuantityPerBagNum = parseFloat(feedQuantityPerBag) || 50;
        const { error: farmError } = await supabase
          .from('farms')
          .update({
            name: farmName,
            country: isCustomCurrency ? 'Other / Custom' : country,
            currency_code: finalCurrencyCode,
            eggs_per_tray: eggsPerTrayNum,
            cost_per_egg_override: costPerEggOverrideNum,
            feed_unit: feedUnit,
            feed_quantity_per_bag: feedQuantityPerBagNum,
            updated_at: new Date().toISOString(),
          })
          .eq('id', farm.id);
        if (farmError) throw farmError;
      }

      const { error: prefsError } = await supabase
        .from('user_preferences')
        .upsert({
          id: user!.id,
          exchange_rate: exchangeRate,
          view_mode: viewMode,
          rate_last_fetched: rateLastFetched || null,
          updated_at: new Date().toISOString(),
        });

      if (prefsError && import.meta.env.DEV) console.warn('Preferences save error:', prefsError);

      await refreshSession();
      showToast(t('settings.settings_saved') || 'Settings saved', 'success');
    } catch (error) {
      showToast(t('settings.save_failed') || 'Failed to save settings', 'error');
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const rateAsFloat = parseFloat(exchangeRate) || 0;
  const usdEquivalent = rateAsFloat > 0 ? (1 / rateAsFloat) : 0;
  const effectiveCurrency = isCustomCurrency ? (customCurrencyCode || currencyCode) : currencyCode;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-neon-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => onNavigate('home')} className="p-2 hover:bg-white rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('settings.title') || 'Settings'}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t('settings.manage_preferences') || 'Manage your farm preferences'}</p>
        </div>
      </div>

      {/* Farm Information - Owners Only */}
      {isOwner && (
        <div className="bg-white rounded-2xl p-4 shadow-sm animate-fade-in-up">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-neon-500/20 text-neon-700">
              <Building2 className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{t('settings.farm_information') || 'Farm Information'}</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="farmName" className="block text-xs font-medium text-gray-700 mb-1.5">
                {t('settings.farm_name') || 'Farm Name'}
              </label>
              <input
                id="farmName"
                type="text"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
                placeholder={t('settings.farm_name_placeholder') || 'Enter farm name'}
              />
            </div>

            <div>
              <label htmlFor="country" className="block text-xs font-medium text-gray-700 mb-1.5">
                {t('settings.country') || 'Country'}
              </label>
              <select
                id="country"
                value={country}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
              >
                {SUPPORTED_COUNTRIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="Other / Custom">Other / Custom</option>
              </select>
            </div>

            {isCustomCurrency && (
              <div className="space-y-3 border-t border-gray-200 pt-3">
                <div className="bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
                  {t('settings.custom_currency_selected') || 'Custom currency selected. Please specify your currency details.'}
                </div>
                <div>
                  <label htmlFor="customCurrencyCode" className="block text-xs font-medium text-gray-700 mb-1.5">
                    {t('settings.currency_code') || 'Currency Code'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="customCurrencyCode"
                    type="text"
                    value={customCurrencyCode}
                    onChange={(e) => {
                      const code = e.target.value.toUpperCase();
                      setCustomCurrencyCode(code);
                      setCurrencyCode(code);
                    }}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
                    placeholder="e.g., JPY, MXN, THB"
                    maxLength={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('settings.currency_code_desc') || '3-letter ISO currency code'}</p>
                </div>
                <div>
                  <label htmlFor="customCurrencySymbol" className="block text-xs font-medium text-gray-700 mb-1.5">
                    {t('settings.currency_symbol_optional') || 'Currency Symbol (Optional)'}
                  </label>
                  <input
                    id="customCurrencySymbol"
                    type="text"
                    value={customCurrencySymbol}
                    onChange={(e) => setCustomCurrencySymbol(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
                    placeholder="e.g., ¥, $, ฿"
                    maxLength={5}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Currency & Exchange Rate - Owners Only */}
      {isOwner && (
        <div className="bg-white rounded-2xl p-4 shadow-sm animate-fade-in-up">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-100 text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {t('settings.currency_settings') || 'Currency & Exchange Rate'}
              </h3>
              <p className="text-xs text-gray-500">
                {t('settings.currency_auto_set') || 'Currency set by country — enter rate to see USD equivalent'}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Live rate summary card */}
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">
                    {t('settings.farm_currency') || 'Farm currency'}
                  </p>
                  <p className="text-base font-bold text-gray-900">
                    {effectiveCurrency} — {getCurrencySymbol(effectiveCurrency)}
                  </p>
                </div>
                {rateAsFloat > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-gray-500 mb-0.5">Exchange rate</p>
                    <p className="text-sm font-semibold text-gray-900">
                      1 USD = {rateAsFloat.toLocaleString(undefined, { maximumFractionDigits: 2 })} {effectiveCurrency}
                    </p>
                    <p className="text-xs text-gray-400">
                      1 {effectiveCurrency} = ${usdEquivalent.toFixed(5)}
                    </p>
                  </div>
                )}
              </div>
              {rateLastFetched && (
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-200">
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                  <p className="text-xs text-gray-400">Live rate fetched: {rateLastFetched}</p>
                </div>
              )}
            </div>

            {/* Auto-fetch button */}
            <button
              type="button"
              onClick={handleFetchRate}
              disabled={fetchingRate}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {fetchingRate ? (
                <>
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  {language === 'fr' ? 'Récupération du taux en cours...' : 'Fetching live rate...'}
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  {language === 'fr' ? 'Récupérer le taux de change en direct' : 'Auto-fetch live exchange rate'}
                </>
              )}
            </button>

            {/* Manual entry */}
            <div>
              <label htmlFor="exchangeRate" className="block text-xs font-medium text-gray-700 mb-1.5">
                {language === 'fr'
                  ? `Saisie manuelle — 1 USD = ? ${effectiveCurrency}`
                  : `Manual entry — 1 USD = ? ${effectiveCurrency}`}
              </label>
              <input
                id="exchangeRate"
                type="number"
                step="0.001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
                placeholder="e.g., 655.957 for XAF"
              />
              <p className="text-xs text-gray-500 mt-1">
                {language === 'fr'
                  ? `Utilisé pour convertir les montants en USD dans les rapports et analyses`
                  : `Used to convert amounts to USD in reports and analytics`}
              </p>
            </div>

            {/* Quick conversion preview */}
            {rateAsFloat > 0 && (
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-xs font-medium text-emerald-800 mb-2">
                  {language === 'fr' ? '💡 Aperçu de conversion' : '💡 Conversion preview'}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[10000, 50000, 100000, 500000].map(amount => (
                    <div key={amount} className="flex justify-between text-emerald-700">
                      <span>{amount.toLocaleString()} {effectiveCurrency}</span>
                      <span className="font-medium">${(amount / rateAsFloat).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Layer Farm Settings - Owners Only */}
      {isOwner && (
        <CollapsibleSection
          icon={<Egg className="w-4 h-4" />}
          title={t('settings.layer_farm_settings') || 'Layer Farm Settings'}
          defaultExpanded={false}
        >
          <div>
            <label htmlFor="eggsPerTray" className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('settings.eggs_per_tray') || 'Eggs per Tray'}
            </label>
            <input
              id="eggsPerTray"
              type="number"
              min="1"
              value={eggsPerTray}
              onChange={(e) => setEggsPerTray(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
              placeholder="30"
            />
            <p className="text-xs text-gray-500 mt-1">
              {t('settings.eggs_per_tray_desc') || 'Number of eggs in one tray (typically 30)'}
            </p>
          </div>

          <div>
            <label htmlFor="costPerEggOverride" className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('settings.cost_per_egg_override', { currency: effectiveCurrency }) || `Cost per Egg Override (${effectiveCurrency})`}
            </label>
            <input
              id="costPerEggOverride"
              type="number"
              step="0.01"
              min="0"
              value={costPerEggOverride}
              onChange={(e) => setCostPerEggOverride(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
              placeholder={t('settings.cost_per_egg_override_placeholder') || 'Leave empty to calculate automatically'}
            />
            <p className="text-xs text-gray-500 mt-1">
              {t('settings.cost_per_egg_override_desc') || 'Override automatic cost calculation (leave empty for automatic)'}
            </p>
          </div>
        </CollapsibleSection>
      )}

      {/* Feed Settings - Owners Only */}
      {isOwner && (
        <CollapsibleSection
          icon={<Package className="w-4 h-4" />}
          title={t('settings.feed_settings') || 'Feed Settings'}
          defaultExpanded={false}
        >
          <div>
            <label htmlFor="feedUnit" className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('settings.feed_unit') || 'Feed Unit'}
            </label>
            <select
              id="feedUnit"
              value={feedUnit}
              onChange={(e) => setFeedUnit(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
            >
              <option value="bags">{language === 'fr' ? 'Sacs' : 'Bags'}</option>
              <option value="kg">{language === 'fr' ? 'Kilogrammes (kg)' : 'Kilograms (kg)'}</option>
              <option value="g">{language === 'fr' ? 'Grammes (g)' : 'Grams (g)'}</option>
              <option value="tonnes">{language === 'fr' ? 'Tonnes' : 'Tonnes'}</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {t('settings.feed_unit_desc') || 'The unit used to measure feed quantities'}
            </p>
          </div>

          <div>
            <label htmlFor="feedQuantityPerBag" className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('settings.feed_quantity_per_bag') || 'Weight per Bag (kg)'}
            </label>
            <input
              id="feedQuantityPerBag"
              type="number"
              min="0.1"
              step="0.1"
              value={feedQuantityPerBag}
              onChange={(e) => setFeedQuantityPerBag(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
              placeholder="50"
            />
            <p className="text-xs text-gray-500 mt-1">
              {t('settings.feed_quantity_per_bag_desc') || 'Weight of one bag in kilograms'}
            </p>
          </div>
        </CollapsibleSection>
      )}

      {/* Language - All Roles */}
      <CollapsibleSection
        icon={<Globe className="w-4 h-4" />}
        title={t('settings.language')}
        defaultExpanded={false}
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`p-3 rounded-xl border-2 transition-all text-left flex items-center gap-2.5 ${
              language === 'en' ? 'border-[#3D5F42] bg-[#3D5F42]/5' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <span className="text-xl">🇬🇧</span>
            <div>
              <div className="font-semibold text-sm text-gray-900">English</div>
              <div className="text-xs text-gray-500">{t('settings.change_to_english') || 'Switch to English'}</div>
            </div>
            {language === 'en' && <div className="ml-auto text-[#3D5F42] text-lg">✓</div>}
          </button>

          <button
            type="button"
            onClick={() => setLanguage('fr')}
            className={`p-3 rounded-xl border-2 transition-all text-left flex items-center gap-2.5 ${
              language === 'fr' ? 'border-[#3D5F42] bg-[#3D5F42]/5' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <span className="text-xl">🇫🇷</span>
            <div>
              <div className="font-semibold text-sm text-gray-900">Français</div>
              <div className="text-xs text-gray-500">{t('settings.change_to_french') || 'Passer au français'}</div>
            </div>
            {language === 'fr' && <div className="ml-auto text-[#3D5F42] text-lg">✓</div>}
          </button>
        </div>
      </CollapsibleSection>

      {/* Farm Location - Owners Only */}
      {isOwner && (
        <CollapsibleSection icon={<MapPin className="w-4 h-4" />} title={t('settings.farm_location')} defaultExpanded={false}>
          <FarmLocationSettings />
        </CollapsibleSection>
      )}

      {/* Manager Permissions - Owners Only */}
      {isOwner && (
        <CollapsibleSection icon={<Shield className="w-4 h-4" />} title={t('settings.manager_permissions')} defaultExpanded={false}>
          <FarmPermissionsSettings />
        </CollapsibleSection>
      )}

      {/* Team Contacts - Owners Only */}
      {isOwner && (
        <CollapsibleSection icon={<Users className="w-4 h-4" />} title={t('settings.team_contacts')} defaultExpanded={false}>
          <TeamContactsSettings />
        </CollapsibleSection>
      )}

      {/* Growth Targets - Owners and Managers */}
      {(isOwner || isManager) && (
        <CollapsibleSection
          icon={<TrendingUp className="w-4 h-4" />}
          title={t('settings.flock_targets_title') || 'Flock Growth Targets & Lifecycle'}
          defaultExpanded={false}
        >
          <FlockTargetsSettings />
        </CollapsibleSection>
      )}

      {/* Task Settings - Owners and Managers */}
      {(isOwner || isManager) && (
        <CollapsibleSection
          icon={<ListChecks className="w-4 h-4" />}
          title={t('settings.task_settings') || 'Task Settings'}
          defaultExpanded={false}
        >
          <div className="text-sm text-gray-600">
            {language === 'fr'
              ? 'Configurer le mode intervalle des œufs et les modèles de tâches.'
              : 'Configure egg interval mode and task templates.'}
          </div>
          <div className="pt-3">
            <button type="button" onClick={() => onNavigate('tasks')} className="btn-primary w-full inline-flex items-center justify-center gap-2">
              {language === 'fr' ? 'Ouvrir les tâches' : 'Open Tasks'}
            </button>
          </div>
        </CollapsibleSection>
      )}

      {/* Weekly Report Email - Owners Only */}
      {isOwner && (
        <div className="bg-white rounded-2xl p-4 shadow-sm animate-fade-in-up">
          <DailyReportSettings />
        </div>
      )}

      {/* Referral Program */}
      <div className="animate-fade-in-up">
        <ReferralSection />
      </div>

      {/* Simple Mode toggle */}
      <div className="animate-fade-in-up">
        <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">Simple Mode</p>
            <p className="text-xs text-gray-500">Hide advanced features — keep the essentials only</p>
          </div>
          <button
            type="button"
            onClick={toggleSimpleMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${simpleMode ? 'bg-emerald-500' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${simpleMode ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* App tour */}
      <div className="animate-fade-in-up">
        <button
          type="button"
          onClick={() => { resetTour(); window.location.reload(); }}
          className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
            <HelpCircle className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Replay app tour</p>
            <p className="text-xs text-gray-500">See the guided walkthrough of all features again</p>
          </div>
        </button>
      </div>

      {/* Dead letter warning */}
      {deadLetterCount > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {deadLetterCount} offline {deadLetterCount === 1 ? 'record' : 'records'} could not sync
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Some data saved while offline failed to upload. Contact support to recover your data.
            </p>
          </div>
        </div>
      )}

      {!isWorker && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-5 py-2.5"
          >
            <Save className="w-4 h-4" />
            {saving ? t('settings.saving') : t('settings.save_settings')}
          </button>
        </div>
      )}
    </div>
  );
}
