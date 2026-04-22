import { useState, useEffect } from 'react';
import { Package, AlertTriangle, RefreshCw, X, Minus, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useOfflineWrite } from '../../hooks/useOfflineWrite';

interface FeedItem {
  id: string;
  feed_type_id: string;
  name: string;
  quantity: number;
  unit: string;
  type: 'feed';
}

interface OtherItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  type: 'other';
}

interface WaterItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  type: 'water';
}

type InventoryItem = FeedItem | OtherItem | WaterItem;

interface FeedPrediction {
  dailyUsage: number;
  daysUntilEmpty: number | null;
  lastGiven: string | null;
  nextFeedingEstimate: string | null;
}

export function InventoryUsageWidget() {
  const { t } = useTranslation();
  const { profile, currentFarm } = useAuth();
  const { tryWrite, isNetworkError } = useOfflineWrite();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [activeFlocks, setActiveFlocks] = useState<{ id: string; name: string }[]>([]);
  const [selectedFlockId, setSelectedFlockId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [usageDate, setUsageDate] = useState(new Date().toISOString().split('T')[0]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set());
  const [feedPredictions, setFeedPredictions] = useState<Record<string, FeedPrediction>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!currentFarm?.id) return;
    supabase
      .from('flocks')
      .select('id, name')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        setActiveFlocks(data || []);
        if (data && data.length === 1) setSelectedFlockId(data[0].id);
      });
  }, [currentFarm?.id]);

  useEffect(() => {
    if (profile?.id && currentFarm?.id) {
      loadHiddenItems();
    }
  }, [profile?.id, currentFarm?.id]);

  useEffect(() => {
    if (profile?.id) {
      loadInventoryItems();
    }
  }, [profile?.id, hiddenItems, currentFarm?.id]);

  // Refresh when mounting if inventory was modified from another view (e.g. Weight page)
  useEffect(() => {
    const needsRefresh = sessionStorage.getItem('inventory_needs_refresh');
    if (needsRefresh && profile?.id) {
      const ts = parseInt(needsRefresh, 10);
      if (Date.now() - ts < 5 * 60 * 1000) {
        loadInventoryItems();
        loadFeedPredictions();
      }
      sessionStorage.removeItem('inventory_needs_refresh');
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id && currentFarm?.id) {
      loadFeedPredictions();
    }
  }, [profile?.id, currentFarm?.id, items]);

  // Listen for inventory-updated (from EditFeedWaterModal, etc.) to refresh stock
  useEffect(() => {
    const handleInventoryUpdate = () => {
      if (profile?.id) {
        loadInventoryItems();
        loadFeedPredictions();
      }
    };
    window.addEventListener('inventory-updated', handleInventoryUpdate);
    return () => window.removeEventListener('inventory-updated', handleInventoryUpdate);
  }, [profile?.id]);

  // Listen for storage changes to update when items are hidden/shown from Inventory page
  useEffect(() => {
    if (!currentFarm?.id) return;
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `hidden_inventory_items_${currentFarm.id}`) {
        loadHiddenItems();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically in case of same-tab updates (every 10s to avoid excessive re-renders)
    const interval = setInterval(() => {
      loadHiddenItems();
    }, 10000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [currentFarm?.id]);

  const loadHiddenItems = () => {
    if (!currentFarm?.id) return;
    const storageKey = `hidden_inventory_items_${currentFarm.id}`;
    const stored = localStorage.getItem(storageKey);
    let newHidden: Set<string>;
    try {
      newHidden = stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (e) {
      console.error('Error parsing hidden items:', e);
      return;
    }
    setHiddenItems(prev => {
      if (prev.size !== newHidden.size) return newHidden;
      const prevArr = [...prev];
      if (prevArr.some(x => !newHidden.has(x)) || [...newHidden].some(x => !prev.has(x))) {
        return newHidden;
      }
      return prev;
    });
  };

  const getItemKey = (type: 'feed' | 'other', name: string) => {
    return `${type}:${name}`;
  };

  async function loadInventoryItems() {
    if (!profile?.id) return;

    try {
      // Use app's current farm so workers see the same farm as the rest of the dashboard
      let farmId = currentFarm?.id ?? null;
      if (!farmId) {
        const { data: members } = await supabase
          .from('farm_members')
          .select('farm_id, role')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .order('joined_at', { ascending: false })
          .limit(10);
        const row = members?.find((r: { role: string }) => r.role !== 'owner') ?? members?.[0];
        farmId = row?.farm_id ?? null;
      }
      if (!farmId) {
        setLoading(false);
        return;
      }

      const [feedResult, otherResult] = await Promise.all([
        supabase
          .from('feed_inventory')
          .select(`
            id,
            quantity,
            feed_type:feed_types(id, name, unit)
          `)
          .eq('farm_id', farmId),
        supabase
          .from('other_inventory_items')
          .select('id, name, category, quantity, unit')
          .eq('farm_id', farmId)
      ]);

      const feedItems: FeedItem[] = (feedResult.data || [])
        .map((item: any): FeedItem | null => {
          const feedType = Array.isArray(item.feed_type) ? item.feed_type[0] : item.feed_type;
          if (!feedType?.id) return null;
          return {
            id: item.id,
            feed_type_id: feedType.id,
            name: feedType.name,
            quantity: Number(item.quantity) || 0,
            unit: feedType.unit || 'bags',
            type: 'feed' as const,
          };
        })
        .filter((item): item is FeedItem => item !== null)
        .filter((item) => {
          const key = getItemKey('feed', item.name);
          return !hiddenItems.has(key);
        });

      const otherItems: OtherItem[] = (otherResult.data || [])
        .filter(item =>
          item.category !== 'Equipment' &&
          !item.name.toLowerCase().includes('camera') // Cameras are reusable equipment
        )
        .map(item => ({
          id: item.id,
          name: item.name,
          category: item.category,
          quantity: Number(item.quantity) || 0,
          unit: item.unit || 'units',
          type: 'other' as const
        }))
        .filter(item => {
          const key = getItemKey('other', item.name);
          return !hiddenItems.has(key);
        });

      // Add water as a special tracking item (not from inventory)
      const waterItem: WaterItem = {
        id: 'water-tracking',
        name: 'Water',
        quantity: 0, // Water doesn't have inventory, it's just tracked
        unit: 'liters',
        type: 'water'
      };

      // Order: feed items, then water, then other inventory items
      setItems([...feedItems, waterItem, ...otherItems]);
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadFeedPredictions() {
    if (!profile?.id) return;

    try {
      const farmId = currentFarm?.id ?? null;
      if (!farmId) return;
      const predictions: Record<string, FeedPrediction> = {};

      // Get all feed items
      const feedItems = items.filter(item => item.type === 'feed') as FeedItem[];

      // Get feed conversion settings
      const { getFeedConversionSettings, convertFeedToKg, convertKgToFeedUnit } = await import('../../utils/feedConversions');
      const feedSettings = await getFeedConversionSettings(farmId);

      for (const feedItem of feedItems) {
        // Get last 30 days of inventory usage to calculate average daily usage
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];

        const { data: usageRecords } = await supabase
          .from('inventory_usage')
          .select(`
            quantity_used,
            usage_date,
            feed_type:feed_types(unit)
          `)
          .eq('farm_id', farmId)
          .eq('item_type', 'feed')
          .eq('feed_type_id', feedItem.feed_type_id)
          .gte('usage_date', startDate)
          .order('usage_date', { ascending: false });

        if (!usageRecords || usageRecords.length === 0) {
          predictions[feedItem.id] = {
            dailyUsage: 0,
            daysUntilEmpty: null,
            lastGiven: null,
            nextFeedingEstimate: null,
          };
          continue;
        }

        // Calculate total usage and days covered
        let totalUsageInKg = 0;
        const dates = new Set<string>();
        
        for (const record of usageRecords) {
          const quantity = Number(record.quantity_used) || 0;
          const unit = (record.feed_type as any)?.unit || feedSettings.feedUnit;
          
          // Convert to kg using feed conversion settings
          const kg = convertFeedToKg(quantity, unit, feedSettings);
          totalUsageInKg += kg;
          dates.add(record.usage_date);
        }

        // Calculate days covered (from first to last usage date)
        const sortedDates = Array.from(dates).sort();
        const firstDate = new Date(sortedDates[0]);
        const lastDate = new Date(sortedDates[sortedDates.length - 1]);
        const daysCovered = Math.max(1, Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

        // Calculate average daily usage in kg, then convert back to feed unit
        const dailyUsageKg = totalUsageInKg / daysCovered;
        const { quantity: dailyUsage } = convertKgToFeedUnit(dailyUsageKg, feedSettings);

        const lastGiven = sortedDates[sortedDates.length - 1];
        const daysUntilEmpty = dailyUsage > 0 && feedItem.quantity > 0
          ? Math.floor(feedItem.quantity / dailyUsage)
          : null;

        // Estimate next feeding based on average days between usage
        const avgDaysBetween = dates.size > 1 && daysCovered > 1
          ? daysCovered / (dates.size - 1)
          : 1;
        
        const nextFeedingEstimate = lastGiven
          ? new Date(new Date(lastGiven).getTime() + avgDaysBetween * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : null;

        predictions[feedItem.id] = {
          dailyUsage,
          daysUntilEmpty,
          lastGiven,
          nextFeedingEstimate,
        };
      }

      setFeedPredictions(predictions);
    } catch (error) {
      console.error('Error loading feed predictions:', error);
    }
  }

  function openRecordCard(item: InventoryItem) {
    setSelectedItem(item);
    setQuantity('');
    setNotes('');
    setUsageDate(new Date().toISOString().split('T')[0]); // Reset to today when opening
    setErrorMessage(null);
  }

  function closeRecordCard() {
    setSelectedItem(null);
    setQuantity('');
    setNotes('');
    setUsageDate(new Date().toISOString().split('T')[0]); // Reset to today when closing
    setErrorMessage(null);
  }

  async function recordUsage() {
    if (!profile?.id || !selectedItem) return;

    // Prevent recording usage for Equipment
    if (selectedItem.type === 'other' && (selectedItem as OtherItem).category === 'Equipment') {
      setErrorMessage('Equipment cannot be tracked in inventory usage');
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    const quantityNum = Number(quantity);

    if (!quantity || isNaN(quantityNum)) {
      setErrorMessage('Please enter a valid quantity');
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    if (quantityNum <= 0) {
      setErrorMessage('Quantity must be positive');
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    // Water doesn't have inventory, skip stock check
    if (selectedItem.type !== 'water' && quantityNum > selectedItem.quantity) {
      setErrorMessage(`Not enough stock! Only ${Number(selectedItem.quantity).toFixed(1)} ${selectedItem.unit} available`);
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    setRecording(selectedItem.id);

    try {
      const farmId = currentFarm?.id ?? null;
      if (!farmId) {
        throw new Error('No active farm membership');
      }

      const usagePayload = {
        farm_id: farmId,
        flock_id: selectedFlockId || null,
        item_type: selectedItem.type,
        feed_type_id: selectedItem.type === 'feed' ? (selectedItem as FeedItem).feed_type_id : null,
        other_item_id: selectedItem.type === 'other' ? selectedItem.id : null,
        quantity_used: quantityNum,
        usage_date: usageDate,
        recorded_by: profile.id,
        notes: notes || null,
      };

      // Regular usage recording with selected date (allows backdating)
      const { error: usageError } = await supabase
        .from('inventory_usage')
        .insert(usagePayload);

      if (usageError) {
        if (isNetworkError(usageError)) {
          // Queue for offline sync
          await tryWrite('inventory_usage', 'insert', usagePayload);
        } else {
          throw usageError;
        }
      }

      // Water doesn't have inventory to update
      if (selectedItem.type === 'water') {
        // tracked via inventory_usage only
      } else {
        const newQuantity = selectedItem.quantity - quantityNum;
        const updatePayload = {
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        };

        if (selectedItem.type === 'feed') {
          const { error: updateError } = await supabase
            .from('feed_inventory')
            .update(updatePayload)
            .eq('id', selectedItem.id);

          if (updateError) {
            if (isNetworkError(updateError)) {
              await tryWrite('feed_inventory', 'update', updatePayload, selectedItem.id);
            } else {
              throw updateError;
            }
          }
        } else {
          const { error: updateError } = await supabase
            .from('other_inventory_items')
            .update(updatePayload)
            .eq('id', selectedItem.id);

          if (updateError) {
            if (isNetworkError(updateError)) {
              await tryWrite('other_inventory_items', 'update', updatePayload, selectedItem.id);
            } else {
              throw updateError;
            }
          }
        }
      }

      let message = t('dashboard.recorded_usage', { quantity: quantityNum.toFixed(1), unit: selectedItem.unit, item: selectedItem.name });
      if (selectedItem.type !== 'water' && selectedItem.quantity - quantityNum <= 10) {
        const newQuantity = selectedItem.quantity - quantityNum;
        message += ` • ${t('dashboard.low_stock_remaining', { quantity: Number(newQuantity).toFixed(1), unit: selectedItem.unit })}`;
      }

      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(null), 4000);

      await loadInventoryItems();
      await loadFeedPredictions();
      closeRecordCard();
      
      // Dispatch event to notify other components (like DailySummaryCard) to refresh
      window.dispatchEvent(new CustomEvent('inventory-updated', { 
        detail: { type: 'feed', itemId: selectedItem.id } 
      }));

    } catch (error) {
      console.error('Error recording usage:', error);
      const msg =
        (error as any)?.message ||
        (error as any)?.error_description ||
        t('dashboard.failed_to_record_usage');
      setErrorMessage(`${t('dashboard.failed_to_record_usage')} ${msg ? `(${msg})` : ''}`.trim());
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setRecording(null);
    }
  }

  const grouped = items.reduce((acc, item) => {
    let category = t('dashboard.feed');
    if (item.type === 'water') {
      category = 'Water';
    } else if (item.type === 'other') {
      const categoryName = (item as OtherItem).category || 'Other';
      if (categoryName === 'Medication') {
        category = t('dashboard.medication');
      } else {
        category = categoryName;
      }
    }
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);
  const categoryEntries = Object.entries(grouped);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !(prev[category] ?? false) }));
  };

  const getCategoryTone = (category: string) => {
    const key = category.toLowerCase();
    if (key.includes('feed')) return 'border-amber-200 bg-amber-50/80';
    if (key.includes('water')) return 'border-cyan-200 bg-cyan-50/80';
    if (key.includes('med')) return 'border-emerald-200 bg-emerald-50/80';
    return 'border-gray-200 bg-gray-50/80';
  };

  if (loading) {
    return (
      <div className="rounded-2xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">{t('dashboard.daily_inventory_usage')}</h3>
            <p className="text-sm text-gray-600">{t('dashboard.loading_inventory')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">{t('dashboard.daily_inventory_usage')}</h3>
            <p className="text-sm text-gray-600">{t('dashboard.no_inventory_items')}</p>
          </div>
        </div>
        <p className="text-center text-gray-500 py-4">{t('dashboard.add_feed_to_start')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-3 bg-gray-50/80 border border-gray-200/80">
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

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-[#3D5F42] rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">{t('dashboard.daily_inventory_usage')}</h3>
            <p className="text-xs text-gray-500">{t('dashboard.quick_record_usage')}</p>
          </div>
        </div>

        <button
          onClick={loadInventoryItems}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Refresh inventory list"
        >
          <RefreshCw className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      <div className="space-y-2.5 max-h-[320px] overflow-y-auto border border-gray-200 rounded-xl p-1.5">
        {categoryEntries.map(([category, categoryItems]) => (
          <div key={category} className={`border rounded-lg p-1.5 ${getCategoryTone(category)}`}>
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between mb-1 px-2 py-1 rounded-md hover:bg-gray-100/70 transition-colors"
            >
              <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                {category}
              </p>
              <div className="flex items-center gap-1.5 text-gray-500">
                <span className="text-[10px] font-medium">{categoryItems.length}</span>
                {expandedCategories[category] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </div>
            </button>

            {(expandedCategories[category] ?? false) && (
              <div className="space-y-1">
                {categoryItems.map(item => {
                const isLowStock = item.type !== 'water' && item.quantity <= 10;
                const isWater = item.type === 'water';

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-gray-200 bg-gray-50/80 hover:bg-gray-100/70 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {!isWater && (
                          <p className="text-xs text-gray-600">
                            {t('dashboard.stock')}: <span className="font-semibold text-gray-800">{Number(item.quantity).toFixed(1)} {item.unit}</span>
                          </p>
                        )}
                        {isWater && <p className="text-xs text-gray-500">Track daily water consumption</p>}
                        {item.type === 'feed' && feedPredictions[item.id] && feedPredictions[item.id].dailyUsage > 0 && (
                          <span className="text-xs text-gray-600">
                            ~{feedPredictions[item.id].dailyUsage.toFixed(1)} {item.unit}/day
                            {feedPredictions[item.id].daysUntilEmpty !== null && (
                              <span className="ml-1">
                                - {feedPredictions[item.id].daysUntilEmpty} {t('dashboard.days_left')}
                              </span>
                            )}
                          </span>
                        )}
                        {isLowStock && (
                          <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
                            <AlertTriangle className="w-3 h-3" />
                            {t('dashboard.low_stock')}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => openRecordCard(item)}
                      disabled={recording === item.id}
                      className="ml-3 px-2.5 py-1.5 bg-[#3D5F42] text-white rounded-lg text-xs font-semibold hover:bg-[#2F4A34] disabled:bg-gray-400 transition-all shadow-sm hover:shadow-md whitespace-nowrap"
                      title={`${t('dashboard.record_usage_for')} ${item.name}`}
                    >
                      {recording === item.id ? t('dashboard.recording') : t('dashboard.record_usage')}
                    </button>
                  </div>
                );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in-up">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <Minus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900">{t('dashboard.record_usage')}</h3>
                  <p className="text-sm text-gray-600">{selectedItem.name}</p>
                </div>
              </div>
              <button
                onClick={closeRecordCard}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="space-y-4">
              {errorMessage && (
                <div className="p-3 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-red-900">{errorMessage}</p>
                </div>
              )}

              {selectedItem.type === 'feed' && feedPredictions[selectedItem.id] && (
                <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Current Stock</span>
                    <span className="text-lg font-bold text-gray-900">
                      {Number(selectedItem.quantity).toFixed(1)} {selectedItem.unit}
                    </span>
                  </div>
                  {feedPredictions[selectedItem.id].dailyUsage > 0 && (
                    <>
                      <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                        <span className="text-sm text-gray-600">Estimated Daily Usage</span>
                        <span className="text-sm font-semibold text-blue-700">
                          ~{feedPredictions[selectedItem.id].dailyUsage.toFixed(1)} {selectedItem.unit}/day
                        </span>
                      </div>
                      {feedPredictions[selectedItem.id].daysUntilEmpty !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Days Until Empty</span>
                          <span className={`text-sm font-semibold ${
                            feedPredictions[selectedItem.id].daysUntilEmpty! <= 3 ? 'text-red-600' : 
                            feedPredictions[selectedItem.id].daysUntilEmpty! <= 7 ? 'text-orange-600' : 
                            'text-green-600'
                          }`}>
                            {feedPredictions[selectedItem.id].daysUntilEmpty} days
                          </span>
                        </div>
                      )}
                      {feedPredictions[selectedItem.id].nextFeedingEstimate && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Next Feeding Estimate</span>
                          <span className="text-sm font-semibold text-gray-700">
                            {new Date(feedPredictions[selectedItem.id].nextFeedingEstimate!).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {selectedItem.type === 'water' ? (
                <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-100">
                  <p className="text-sm text-blue-700 font-medium">
                    Water has no stock tracking. Record how much you used.
                  </p>
                </div>
              ) : (
                (selectedItem.type !== 'feed' || !feedPredictions[selectedItem.id] || feedPredictions[selectedItem.id].dailyUsage === 0) && (
                  <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Current Stock</span>
                      <span className="text-lg font-bold text-gray-900">
                        {Number(selectedItem.quantity).toFixed(1)} {selectedItem.unit}
                      </span>
                    </div>
                  </div>
                )
              )}

              {activeFlocks.length > 1 && selectedItem?.type === 'feed' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Flock (for FCR tracking)
                  </label>
                  <select
                    value={selectedFlockId}
                    onChange={(e) => setSelectedFlockId(e.target.value)}
                    className="w-full px-4 py-3 bg-white text-gray-900 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                  >
                    <option value="">— All / Unknown —</option>
                    {activeFlocks.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  {t('dashboard.usage_date', 'Usage Date')}
                </label>
                <input
                  type="date"
                  value={usageDate}
                  onChange={(e) => setUsageDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]} // Allow past dates, prevent future dates
                  className="w-full px-4 py-3 bg-white text-gray-900 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                />
                {usageDate < new Date().toISOString().split('T')[0] && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {t('dashboard.backdating_note', 'Backdating: This will record usage for a past date')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Quantity Used
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Enter quantity"
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-3 pr-20 bg-white text-gray-900 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    autoFocus
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium pointer-events-none">
                    {selectedItem.unit}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this usage..."
                  rows={2}
                  className="w-full px-4 py-3 bg-white text-gray-900 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeRecordCard}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={recordUsage}
                  disabled={!quantity || recording === selectedItem.id}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 transition-all shadow-sm hover:shadow-md"
                  title={t('dashboard.record_usage_and_update_inventory')}
                >
                  {recording === selectedItem.id 
                    ? t('dashboard.recording')
                    : t('dashboard.record_usage')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
