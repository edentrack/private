import { useEffect, useState } from 'react';
import { Save, Building2, DollarSign, ArrowLeft, Egg, Globe, MapPin, Shield, TrendingUp, Users, Package, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Currency, Farm } from '../../types/database';
import { SUPPORTED_COUNTRIES, getCurrencyForCountry, getCurrencySymbol } from '../../utils/currency';
import { FarmPermissionsSettings } from './FarmPermissionsSettings';
import { FarmLocationSettings } from './FarmLocationSettings';
import { TeamContactsSettings } from './TeamContactsSettings';
import { FlockTargetsSettings } from './FlockTargetsSettings';
import { CollapsibleSection } from './CollapsibleSection';

interface SettingsPageProps {
  onNavigate: (view: string) => void;
}

const CURRENCIES: Currency[] = ['XAF', 'CFA', 'USD', 'NGN', 'GHS', 'KES', 'ZAR'];

export function SettingsPage({ onNavigate }: SettingsPageProps) {
  const { t, i18n } = useTranslation();
  const { setLanguage } = useLanguage();
  const language = (i18n.language || 'en') as 'en' | 'fr';
  const { user, currentFarm, currentRole, refreshSession } = useAuth();
  
  // Determine which sections to show based on role
  const isOwner = currentRole === 'owner';
  const isManager = currentRole === 'manager';
  const isWorker = currentRole === 'worker';
  const [farm, setFarm] = useState<Farm | null>(null);
  const [farmName, setFarmName] = useState('');
  const [country, setCountry] = useState('Cameroon');
  const [currencyCode, setCurrencyCode] = useState('XAF');
  const [currency, setCurrency] = useState<Currency>('CFA');
  const [isCustomCurrency, setIsCustomCurrency] = useState(false);
  const [customCurrencyCode, setCustomCurrencyCode] = useState('');
  const [customCurrencySymbol, setCustomCurrencySymbol] = useState('');
  const [eggsPerTray, setEggsPerTray] = useState('30');
  const [costPerEggOverride, setCostPerEggOverride] = useState('');
  const [exchangeRate, setExchangeRate] = useState('655.957');
  const [viewMode, setViewMode] = useState<'compact' | 'comfortable'>('comfortable');
  const [feedUnit, setFeedUnit] = useState('bags');
  const [feedQuantityPerBag, setFeedQuantityPerBag] = useState('50');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (currentFarm?.id) {
      loadSettings();
    }
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
        setCurrencyCode(farmData.currency_code || farmData.currency || 'XAF');
        setEggsPerTray(farmData.eggs_per_tray?.toString() || '30');
        setCostPerEggOverride(farmData.cost_per_egg_override?.toString() || '');
        setCurrency(farmData.currency_code || farmData.currency || 'XAF');
        setFeedUnit(farmData.feed_unit || 'bags');
        setFeedQuantityPerBag(farmData.feed_quantity_per_bag?.toString() || '50');

        const mappedCurrency = getCurrencyForCountry(farmCountry);
        if (mappedCurrency !== farmData.currency_code && farmCountry !== 'Other / Custom') {
          setIsCustomCurrency(true);
          setCustomCurrencyCode(farmData.currency_code ?? '');
        }
      }

      if (user) {
        const { data: prefsData } = await supabase
          .from('user_preferences')
          .select('exchange_rate, view_mode')
          .eq('id', user.id)
          .maybeSingle();

        if (prefsData) {
          if (prefsData.exchange_rate) {
            setExchangeRate(prefsData.exchange_rate);
          }
          if (prefsData.view_mode === 'compact' || prefsData.view_mode === 'comfortable') {
            setViewMode(prefsData.view_mode);
          }
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

  const handleSave = async () => {
    if (!currentFarm?.id) return;
    
    // Workers can only save language preference
    if (isWorker) {
      setSaving(true);
      setMessage('');
      try {
        const { error: prefsError } = await supabase
          .from('user_preferences')
          .upsert({
            id: user!.id,
            updated_at: new Date().toISOString(),
          });

        if (prefsError && import.meta.env.DEV) console.warn('Preferences save error:', prefsError);

        setMessage(t('settings.settings_saved') || 'Settings saved successfully');
        setTimeout(() => setMessage(''), 3000);
      } catch (error) {
        setMessage(t('settings.save_failed') || 'Failed to save settings');
        console.error('Error saving settings:', error);
      } finally {
        setSaving(false);
      }
      return;
    }

    // Owners and managers can save farm settings
    if (!farm) return;

    setSaving(true);
    setMessage('');

    try {
      const eggsPerTrayNum = parseFloat(eggsPerTray);
      const costPerEggOverrideNum = costPerEggOverride ? parseFloat(costPerEggOverride) : null;

      const finalCurrencyCode = isCustomCurrency
        ? (customCurrencyCode || currencyCode)
        : currencyCode;

      // Only owners can update farm-level settings
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
            updated_at: new Date().toISOString()
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
          updated_at: new Date().toISOString(),
        });

      if (prefsError && import.meta.env.DEV) console.warn('Preferences save error:', prefsError);

      // Only attempt to write activity logs in production; ignore failures entirely
      if (isOwner && import.meta.env.PROD) {
        try {
          await supabase.from('activity_logs').insert({
            user_id: user!.id,
            action: 'Updated farm settings',
            entity_type: 'settings',
            entity_id: farm.id,
            details: {
              farm_name: farmName,
              currency,
            },
          });
        } catch {
          // Non‑critical: failure to log should never block settings saving
        }
      }

      await refreshSession();

      setMessage(t('settings.settings_saved') || 'Settings saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(t('settings.save_failed') || 'Failed to save settings');
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

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
        <button
          onClick={() => onNavigate('home')}
          className="p-2 hover:bg-white rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('settings.title') || 'Settings'}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t('settings.manage_preferences') || 'Manage your farm preferences'}</p>
        </div>
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-xl text-sm font-medium ${
          message.includes('success')
            ? 'bg-green-50 text-green-600'
            : 'bg-red-50 text-red-600'
        }`}>
          {message}
        </div>
      )}

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
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:bg-white focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
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
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 transition-all focus:bg-white focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
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
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:bg-white focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
                  placeholder="e.g., JPY, MXN, THB"
                  maxLength={3}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('settings.currency_code_desc') || '3-letter ISO currency code (e.g., JPY for Japanese Yen)'}
                </p>
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
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:bg-white focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
                  placeholder="e.g., ¥, $, ฿"
                  maxLength={5}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('settings.currency_symbol_desc') || 'Symbol to display with amounts (optional, defaults to currency code)'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Currency Settings - Owners Only */}
      {isOwner && (
        <div className="bg-white rounded-2xl p-4 shadow-sm animate-fade-in-up">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-100 text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{t('settings.currency_settings') || 'Currency Settings'}</h3>
          </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('settings.farm_currency') || 'Farm Currency'}
            </label>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{t('settings.based_on_country') || 'Based on country'}</span>
                <span className="text-lg font-bold text-gray-900">
                  {currencyCode} ({getCurrencySymbol(currencyCode)})
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {t('settings.currency_auto_set') || 'Currency is automatically set based on your country'}
            </p>
          </div>

          <div>
            <label htmlFor="currency" className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('settings.legacy_currency_display') || 'Legacy Currency Display'}
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 transition-all focus:bg-white focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
            >
              {CURRENCIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {t('settings.legacy_currency_desc') || 'For backward compatibility with older expenses'}
            </p>
          </div>

          <div>
            <label htmlFor="exchangeRate" className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('settings.exchange_rate', { currency: currencyCode }) || `Exchange Rate (${currencyCode} to USD)`}
            </label>
            <input
              id="exchangeRate"
              type="number"
              step="0.001"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:bg-white focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
              placeholder={t('settings.exchange_rate_placeholder') || 'Enter exchange rate'}
            />
            <p className="text-xs text-gray-500 mt-1">
              {t('settings.exchange_rate_desc', { currency: currencyCode }) || `Used for currency conversions in reports (1 ${currencyCode} = ? USD)`}
            </p>
          </div>
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
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:bg-white focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
            placeholder="30"
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('settings.eggs_per_tray_desc') || 'Number of eggs in one tray (typically 30)'}
          </p>
        </div>

        <div>
          <label htmlFor="costPerEggOverride" className="block text-xs font-medium text-gray-700 mb-1.5">
            {t('settings.cost_per_egg_override', { currency: currencyCode }) || `Cost per Egg Override (${currencyCode})`}
          </label>
          <input
            id="costPerEggOverride"
            type="number"
            step="0.01"
            min="0"
            value={costPerEggOverride}
            onChange={(e) => setCostPerEggOverride(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:bg-white focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
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
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:bg-white focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
          >
            <option value="bags">Bags</option>
            <option value="kg">Kilograms (kg)</option>
            <option value="g">Grams (g)</option>
            <option value="tonnes">Tonnes</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {t('settings.feed_unit_desc') || 'The unit used to measure feed quantities'}
          </p>
        </div>

        <div>
          <label htmlFor="feedQuantityPerBag" className="block text-xs font-medium text-gray-700 mb-1.5">
            {t('settings.feed_quantity_per_bag') || 'Quantity per Bag (kg)'}
          </label>
          <input
            id="feedQuantityPerBag"
            type="number"
            min="0.1"
            step="0.1"
            value={feedQuantityPerBag}
            onChange={(e) => setFeedQuantityPerBag(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:bg-white focus:border-neon-500 focus:ring-2 focus:ring-neon-500/10 focus:outline-none"
            placeholder="50"
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('settings.feed_quantity_per_bag_desc') || 'Weight of one bag in kilograms (e.g., 50 for 50kg bags)'}
          </p>
        </div>
      </CollapsibleSection>
      )}

      {/* Language Settings - All Roles */}
      <CollapsibleSection
        icon={<Globe className="w-4 h-4" />}
        title={t('settings.language')}
        defaultExpanded={false}
      >
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            {t('settings.language')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`p-3 rounded-xl border-2 transition-all text-left flex items-center gap-2.5 ${
                language === 'en'
                  ? 'border-[#3D5F42] bg-[#3D5F42]/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="text-xl">🇬🇧</span>
              <div>
                <div className="font-semibold text-sm text-gray-900">English</div>
                <div className="text-xs text-gray-500">{t('settings.change_to_english') || 'Change to English'}</div>
              </div>
              {language === 'en' && (
                <div className="ml-auto text-[#3D5F42] text-lg">✓</div>
              )}
            </button>

            <button
              type="button"
              onClick={() => setLanguage('fr')}
              className={`p-3 rounded-xl border-2 transition-all text-left flex items-center gap-2.5 ${
                language === 'fr'
                  ? 'border-[#3D5F42] bg-[#3D5F42]/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="text-xl">🇫🇷</span>
              <div>
                <div className="font-semibold text-sm text-gray-900">Français</div>
                <div className="text-xs text-gray-500">{t('settings.change_to_french') || 'Changer en français'}</div>
              </div>
              {language === 'fr' && (
                <div className="ml-auto text-[#3D5F42] text-lg">✓</div>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {t('page_reload_notice')}
          </p>
        </div>
      </CollapsibleSection>

      {/* Farm Location - Owners Only */}
      {isOwner && (
        <CollapsibleSection
          icon={<MapPin className="w-4 h-4" />}
          title={t('settings.farm_location')}
          defaultExpanded={false}
        >
          <FarmLocationSettings />
        </CollapsibleSection>
      )}

      {/* Manager Permissions - Owners Only */}
      {isOwner && (
        <CollapsibleSection
          icon={<Shield className="w-4 h-4" />}
          title={t('settings.manager_permissions')}
          defaultExpanded={false}
        >
          <FarmPermissionsSettings />
        </CollapsibleSection>
      )}

      {/* Team Contacts - Owners Only */}
      {isOwner && (
        <CollapsibleSection
          icon={<Users className="w-4 h-4" />}
          title={t('settings.team_contacts')}
          defaultExpanded={false}
        >
          <TeamContactsSettings />
        </CollapsibleSection>
      )}

      {/* Growth Targets & Lifecycle - Owners and Managers */}
      {(isOwner || isManager) && (
        <CollapsibleSection
          icon={<TrendingUp className="w-4 h-4" />}
          title={t('settings.flock_targets_title') || 'Flock Growth Targets & Lifecycle'}
          defaultExpanded={false}
        >
          <FlockTargetsSettings />
        </CollapsibleSection>
      )}

      {/* Task Templates / Egg Interval Mode */}
      {(isOwner || isManager) && (
        <CollapsibleSection
          icon={<ListChecks className="w-4 h-4" />}
          title={t('settings.task_settings') || 'Task Settings'}
          defaultExpanded={false}
        >
          <div className="text-sm text-gray-600">
            Configure egg interval mode (hourly vs every-2-hours) and other task templates.
          </div>
          <div className="pt-3">
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="btn-primary w-full inline-flex items-center justify-center gap-2"
            >
              Open Tasks
            </button>
          </div>
        </CollapsibleSection>
      )}

      {/* Hide Save button for workers - they only have language which saves immediately */}
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
