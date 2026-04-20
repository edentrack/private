import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Save, Package, Droplet } from 'lucide-react';

/** Normalize date to YYYY-MM-DD as local (avoids UTC-midnight shifting to previous day) */
function toLocalDateString(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const parts = String(dateStr).split(/[-T]/);
  if (parts.length < 3) return dateStr;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Format YYYY-MM-DD for display (parse as local to avoid off-by-one) */
function formatDateForDisplay(dateStr: string | undefined): string {
  const norm = toLocalDateString(dateStr);
  if (!norm) return '';
  const [y, m, d] = norm.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Flock } from '../../types/database';
import { getFeedConversionSettings, convertFeedToKg, convertKgToFeedUnit } from '../../utils/feedConversions';

interface FeedWaterRecord {
  id: string;
  date: string;
  quantity: number;
  unit: string;
  type: 'feed' | 'water';
  feed_type_id?: string;
  feed_type_name?: string;
  source?: 'inventory_usage' | 'feed_givings';
  quantityKg?: number;
}

interface EditFeedWaterModalProps {
  isOpen: boolean;
  onClose: () => void;
  flock: Flock | null;
  week: number;
  type: 'feed' | 'water';
  onSuccess: () => void;
  /** Pre-loaded records from chart (ensures modal shows same data chart used) */
  initialRecords?: FeedWaterRecord[];
}

export function EditFeedWaterModal({
  isOpen,
  onClose,
  flock,
  week,
  type,
  onSuccess,
  initialRecords,
}: EditFeedWaterModalProps) {
  const { t } = useTranslation();
  const { currentFarm, currentRole, farmPermissions } = useAuth();
  const [records, setRecords] = useState<FeedWaterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRecord, setNewRecord] = useState<Partial<FeedWaterRecord>>({
    date: '',
    quantity: 0,
    unit: type === 'feed' ? 'bags' : 'liters',
  });
  const [feedTypes, setFeedTypes] = useState<Array<{ id: string; name: string; unit: string; kg_per_unit?: number }>>([]);
  const [selectedFeedType, setSelectedFeedType] = useState<string>('');

  // Check if user can edit
  const canEdit = currentRole === 'owner' || (currentRole === 'manager' && farmPermissions?.managers_can_edit_feed_water);

  useEffect(() => {
    if (isOpen && flock && currentFarm?.id) {
      if (initialRecords !== undefined) {
        setRecords(initialRecords);
        setLoading(false);
      } else {
        loadRecords();
      }
      if (type === 'feed') {
        loadFeedTypes();
      }
      // Pre-fill date with first day of selected week so Add button works
      const arrParts = String(flock.arrival_date).split(/[-T]/);
      const arrivalDate = arrParts.length >= 3
        ? new Date(parseInt(arrParts[0], 10), parseInt(arrParts[1], 10) - 1, parseInt(arrParts[2], 10))
        : new Date(flock.arrival_date);
      arrivalDate.setHours(0, 0, 0, 0);
      const weekStart = new Date(arrivalDate);
      weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
      const yyyy = weekStart.getFullYear();
      const mm = String(weekStart.getMonth() + 1).padStart(2, '0');
      const dd = String(weekStart.getDate()).padStart(2, '0');
      setNewRecord(prev => ({ ...prev, date: `${yyyy}-${mm}-${dd}` }));
    }
  }, [isOpen, flock, week, type, currentFarm?.id, initialRecords]);

  const adjustFeedInventory = async (
    feedTypeId: string,
    deltaInStoredUnit: number
  ): Promise<boolean> => {
    if (!currentFarm?.id || type !== 'feed' || deltaInStoredUnit === 0) return true;
    try {
      const { data: fi } = await supabase
        .from('feed_inventory')
        .select('id, quantity')
        .eq('farm_id', currentFarm.id)
        .eq('feed_type_id', feedTypeId)
        .single();
      if (!fi) return true; // No inventory row, skip (e.g. feed_givings record)
      const current = Number(fi.quantity) || 0;
      const newQty = Math.max(0, current + deltaInStoredUnit);
      const { error } = await supabase
        .from('feed_inventory')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', fi.id);
      return !error;
    } catch {
      return false;
    }
  };

  const loadFeedTypes = async () => {
    if (!currentFarm?.id) return;

    try {
      const { data } = await supabase
        .from('feed_types')
        .select('id, name, unit, kg_per_unit')
        .eq('farm_id', currentFarm.id)
        .order('name');

      if (data) {
        setFeedTypes(data);
        if (data.length > 0 && !selectedFeedType) {
          setSelectedFeedType(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading feed types:', error);
    }
  };

  const loadRecords = async () => {
    if (!flock || !currentFarm?.id) return;

    try {
      setLoading(true);

      // Use same date logic as FeedIntakeChart to ensure parity
      const arrParts = String(flock.arrival_date).split(/[-T]/);
      const arrivalDate = arrParts.length >= 3
        ? new Date(parseInt(arrParts[0], 10), parseInt(arrParts[1], 10) - 1, parseInt(arrParts[2], 10))
        : new Date(flock.arrival_date);
      arrivalDate.setHours(0, 0, 0, 0);

      const feedSettings = await getFeedConversionSettings(currentFarm.id);
      const allRecords: FeedWaterRecord[] = [];

      // Helper: compute week number for a usage date (matches chart exactly, including pre-arrival → week 1)
      const getWeekForDate = (dateStr: string) => {
        const parts = String(dateStr).split(/[-T]/);
        const d = parts.length >= 3
          ? new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
          : new Date(dateStr);
        d.setHours(0, 0, 0, 0);
        const daysSinceArrival = Math.floor((d.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceArrival < 0 ? 1 : Math.floor(daysSinceArrival / 7) + 1;
      };

      // 1. Load inventory_usage from 7 days before arrival (matches chart; pre-arrival records count as week 1)
      const queryStart = new Date(arrivalDate);
      queryStart.setDate(queryStart.getDate() - 7);
      const queryStartStr = queryStart.toISOString().split('T')[0];
      const { data: usageRecords } = await supabase
        .from('inventory_usage')
        .select(`
          id,
          quantity_used,
          usage_date,
          feed_type_id,
          feed_type:feed_types(id, name, unit)
        `)
        .eq('farm_id', currentFarm.id)
        .eq('item_type', type)
        .gte('usage_date', queryStartStr)
        .order('usage_date', { ascending: true });

      if (usageRecords) {
        for (const r: any of usageRecords) {
          if (getWeekForDate(r.usage_date) !== week) continue; // filter to target week
          const storedUnit = type === 'feed' ? (r.feed_type?.unit || feedSettings.feedUnit) : 'liters';
          let displayQuantity = Number(r.quantity_used) || 0;
          let displayUnit = storedUnit;
          if (type === 'feed') {
            const kg = convertFeedToKg(displayQuantity, storedUnit, feedSettings);
            const converted = convertKgToFeedUnit(kg, feedSettings);
            displayQuantity = converted.quantity;
            displayUnit = converted.unit;
          }
          allRecords.push({
            id: r.id,
            date: toLocalDateString(r.usage_date),
            quantity: displayQuantity,
            unit: displayUnit,
            type: type,
            feed_type_id: r.feed_type_id,
            feed_type_name: r.feed_type?.name,
            source: 'inventory_usage',
          });
        }
      }

      // 2. For feed only: load feed_givings from arrival, filter to target week
      if (type === 'feed') {
        const weekStart = new Date(arrivalDate);
        weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const startDateStr = toLocalDateStr(weekStart);
        const endDateStr = toLocalDateStr(weekEnd);
        const startTs = `${startDateStr}T00:00:00`;
        const endTs = `${endDateStr}T23:59:59.999`;

        const { data: givingsRecords } = await supabase
          .from('feed_givings')
          .select(`
            id,
            quantity_given,
            given_at,
            feed_type_id,
            feed_type:feed_types(id, name, unit)
          `)
          .eq('farm_id', currentFarm.id)
          .gte('given_at', startTs)
          .lte('given_at', endTs)
          .order('given_at', { ascending: true });

        if (givingsRecords) {
          for (const r: any of givingsRecords) {
            const storedUnit = r.feed_type?.unit || feedSettings.feedUnit;
            const dateStr = toLocalDateString((r.given_at || '').toString().split('T')[0]);
            if (getWeekForDate(dateStr) !== week) continue;
            let displayQuantity = Number(r.quantity_given) || 0;
            const kg = convertFeedToKg(displayQuantity, storedUnit, feedSettings);
            const converted = convertKgToFeedUnit(kg, feedSettings);
            displayQuantity = converted.quantity;
            const displayUnit = converted.unit;
            allRecords.push({
              id: r.id,
              date: dateStr,
              quantity: displayQuantity,
              unit: displayUnit,
              type: 'feed',
              feed_type_id: r.feed_type_id,
              feed_type_name: r.feed_type?.name,
              source: 'feed_givings',
            });
          }
        }
      }

      // Sort by date
      allRecords.sort((a, b) => a.date.localeCompare(b.date));
      setRecords(allRecords);
    } catch (error) {
      console.error('Error loading records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRecord = async (record: FeedWaterRecord) => {
    if (!currentFarm?.id || !flock) return;

    try {
      setSaving(true);

      const feedSettings = await getFeedConversionSettings(currentFarm.id);
      
      // Convert quantity to storage format: kg for calculations, then to table-specific unit
      const kg = type === 'feed' ? convertFeedToKg(record.quantity, record.unit, feedSettings) : record.quantity;
      const storedUnit = (feedTypes.find(ft => ft.id === record.feed_type_id)?.unit || 'bags').toLowerCase();
      const quantityForStorage = type === 'feed'
        ? (storedUnit === 'bags' || storedUnit === 'bag' ? kg / feedSettings.quantityPerBag : storedUnit === 'g' || storedUnit === 'grams' ? kg * 1000 : kg)
        : kg;

      const source = record.source || 'inventory_usage';
      if (source === 'feed_givings') {
        const givenAt = `${toLocalDateString(record.date)}T12:00:00`;
        const { error } = await supabase
          .from('feed_givings')
          .update({ quantity_given: quantityForStorage, given_at: givenAt })
          .eq('id', record.id);
        if (error) throw error;
      } else {
        if (type === 'feed' && record.feed_type_id) {
          const { data: oldRow } = await supabase
            .from('inventory_usage')
            .select('quantity_used')
            .eq('id', record.id)
            .single();
          const oldStored = Number((oldRow as any)?.quantity_used) || 0;
          const delta = oldStored - quantityForStorage;
          await adjustFeedInventory(record.feed_type_id, delta);
        }
        const { error } = await supabase
          .from('inventory_usage')
          .update({
            quantity_used: quantityForStorage,
            usage_date: toLocalDateString(record.date),
            feed_type_id: type === 'feed' ? record.feed_type_id : null,
          })
          .eq('id', record.id);
        if (error) throw error;
      }

      setEditingId(null);
      await loadRecords();
      onSuccess();
      window.dispatchEvent(new CustomEvent('inventory-updated', { detail: { type: 'feed' } }));
      sessionStorage.setItem('inventory_needs_refresh', Date.now().toString());
    } catch (error) {
      console.error('Error saving record:', error);
      alert(t('common.error_saving') || 'Error saving record');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (record: FeedWaterRecord) => {
    if (!confirm(t('common.confirm_delete') || 'Are you sure you want to delete this record?')) {
      return;
    }

    try {
      const source = record.source || 'inventory_usage';
      if (source === 'inventory_usage' && type === 'feed' && record.feed_type_id) {
        const feedSettings = await getFeedConversionSettings(currentFarm!.id);
        const kg = convertFeedToKg(record.quantity, record.unit, feedSettings);
        const storedUnit = (feedTypes.find(ft => ft.id === record.feed_type_id)?.unit || 'bags').toLowerCase();
        const qtyStored = storedUnit === 'bags' || storedUnit === 'bag'
          ? kg / feedSettings.quantityPerBag
          : storedUnit === 'g' || storedUnit === 'grams'
          ? kg * 1000
          : kg;
        await adjustFeedInventory(record.feed_type_id, qtyStored);
      }
      const table = source === 'feed_givings' ? 'feed_givings' : 'inventory_usage';
      const { error } = await supabase.from(table).delete().eq('id', record.id);

      if (error) throw error;

      await loadRecords();
      onSuccess();
      window.dispatchEvent(new CustomEvent('inventory-updated', { detail: { type: 'feed' } }));
      sessionStorage.setItem('inventory_needs_refresh', Date.now().toString());
    } catch (error) {
      console.error('Error deleting record:', error);
      alert(t('common.error_deleting') || 'Error deleting record');
    }
  };

  const handleAddRecord = async () => {
    if (!currentFarm?.id || !flock || !newRecord.date || !newRecord.quantity || newRecord.quantity <= 0) {
      alert(t('common.fill_all_fields') || 'Please fill all fields');
      return;
    }

    if (type === 'feed' && !selectedFeedType) {
      alert(t('weight.select_feed_type') || 'Please select a feed type');
      return;
    }

    try {
      setSaving(true);

      const feedSettings = await getFeedConversionSettings(currentFarm.id);
      const ft = feedTypes.find(f => f.id === selectedFeedType);
      const storedUnit = (ft?.unit || 'bags').toLowerCase();
      const kgPerUnit = ft?.kg_per_unit != null && ft.kg_per_unit > 0 ? ft.kg_per_unit : feedSettings.quantityPerBag;
      const settingsForStorage = { ...feedSettings, quantityPerBag: kgPerUnit };
      const kg = type === 'feed' ? convertFeedToKg(newRecord.quantity!, newRecord.unit || 'bags', settingsForStorage) : newRecord.quantity!;
      const quantityForStorage = type === 'feed'
        ? (storedUnit === 'bags' || storedUnit === 'bag' ? kg / kgPerUnit : storedUnit === 'g' || storedUnit === 'grams' ? kg * 1000 : kg)
        : kg;

      const { error } = await supabase
        .from('inventory_usage')
        .insert({
          farm_id: currentFarm.id,
          item_type: type,
          quantity_used: quantityForStorage,
          usage_date: toLocalDateString(newRecord.date),
          feed_type_id: type === 'feed' ? selectedFeedType : null,
          recorded_by: (await supabase.auth.getUser()).data.user?.id,
        });

      if (error) throw error;

      if (type === 'feed' && selectedFeedType) {
        await adjustFeedInventory(selectedFeedType, -quantityForStorage);
      }
      setNewRecord({ date: '', quantity: 0, unit: type === 'feed' ? 'bags' : 'liters' });
      await loadRecords();
      await onSuccess();
      window.dispatchEvent(new CustomEvent('inventory-updated', { detail: { type: 'feed' } }));
      sessionStorage.setItem('inventory_needs_refresh', Date.now().toString());
    } catch (error) {
      console.error('Error adding record:', error);
      alert(t('common.error_adding') || 'Error adding record');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Calculate week date range for display (same logic as loadRecords for consistency)
  const arrPartsDisplay = flock ? String(flock.arrival_date).split(/[-T]/) : [];
  const arrivalDateDisplay = arrPartsDisplay.length >= 3
    ? new Date(parseInt(arrPartsDisplay[0], 10), parseInt(arrPartsDisplay[1], 10) - 1, parseInt(arrPartsDisplay[2], 10))
    : flock ? new Date(flock.arrival_date) : new Date();
  arrivalDateDisplay.setHours(0, 0, 0, 0);
  const weekStart = new Date(arrivalDateDisplay);
  weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {type === 'feed' ? (
              <Package className="w-6 h-6 text-green-600" />
            ) : (
              <Droplet className="w-6 h-6 text-blue-600" />
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {type === 'feed' 
                  ? t('weight.edit_feed_records') || 'Edit Feed Records'
                  : t('weight.edit_water_records') || 'Edit Water Records'}
              </h2>
              <p className="text-sm text-gray-600">
                {t('weight.week')} {week} - {weekStart.toLocaleDateString()} to {weekEnd.toLocaleDateString()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
          ) : (
            <>
              {/* Existing Records */}
              <div className="space-y-3 mb-6">
                {records.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    {t('weight.no_records_for_week') || 'No records for this week'}
                  </div>
                ) : (
                  records.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      {editingId === record.id ? (
                        <>
                          <input
                            type="date"
                            value={toLocalDateString(record.date)}
                            onChange={(e) => {
                              setRecords(prev =>
                                prev.map(r =>
                                  r.id === record.id ? { ...r, date: e.target.value } : r
                                )
                              );
                            }}
                            className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={record.quantity}
                            onChange={(e) => {
                              setRecords(prev =>
                                prev.map(r =>
                                  r.id === record.id
                                    ? { ...r, quantity: parseFloat(e.target.value) || 0 }
                                    : r
                                )
                              );
                            }}
                            className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 w-24"
                          />
                          {type === 'feed' && (
                            <select
                              value={record.unit}
                              onChange={(e) => {
                                setRecords(prev =>
                                  prev.map(r =>
                                    r.id === record.id ? { ...r, unit: e.target.value } : r
                                  )
                                );
                              }}
                              className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
                            >
                              <option value="bags">{t('weight.unit_bags')}</option>
                              <option value="kg">{t('weight.unit_kg')}</option>
                              <option value="g">{t('weight.unit_grams')}</option>
                              <option value="tonnes">{t('weight.unit_tonnes')}</option>
                            </select>
                          )}
                          {type === 'water' && (
                            <span className="text-sm text-gray-600">{t('weight.unit_liters')}</span>
                          )}
                          <button
                            onClick={() => handleSaveRecord(record)}
                            disabled={saving}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-1"
                          >
                            <Save className="w-4 h-4" />
                            {t('common.save')}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                          >
                            {t('common.cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-gray-900">
                              {formatDateForDisplay(record.date)}
                            </div>
                            <div className="text-sm text-gray-700 mt-0.5">
                              <span className="font-bold text-green-700">{record.quantity.toFixed(1)}</span> {record.unit}
                              {type === 'feed' && record.quantityKg != null && record.quantityKg > 0 && (
                                <span className="text-gray-500 ml-1">({record.quantityKg >= 1000 ? `${(record.quantityKg / 1000).toFixed(1)} t` : `${record.quantityKg.toFixed(0)} kg`})</span>
                              )}
                              {type === 'feed' && record.feed_type_name && (
                                <span className="text-gray-500 ml-1">· {record.feed_type_name}</span>
                              )}
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditingId(record.id)}
                                className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                                title={t('common.edit')}
                              >
                                <Edit2 className="w-4 h-4 text-blue-600" />
                              </button>
                              <button
                                onClick={() => handleDeleteRecord(record)}
                                className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                                title={t('common.delete')}
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add New Record */}
              {canEdit && (
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    {t('weight.add_new_record') || 'Add New Record'}
                  </h3>
                  <div className="flex items-center gap-3 flex-wrap">
                    <input
                      type="date"
                      value={toLocalDateString(newRecord.date) || ''}
                      onChange={(e) => setNewRecord({ ...newRecord, date: e.target.value })}
                      className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
                      placeholder={t('weight.date') || 'Date'}
                    />
                    {type === 'feed' && (
                      <select
                        value={selectedFeedType}
                        onChange={(e) => setSelectedFeedType(e.target.value)}
                        className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
                      >
                        <option value="">{t('weight.select_feed_type') || 'Select Feed Type'}</option>
                        {feedTypes.map((ft) => (
                          <option key={ft.id} value={ft.id}>
                            {ft.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newRecord.quantity || ''}
                      onChange={(e) => setNewRecord({ ...newRecord, quantity: parseFloat(e.target.value) || 0 })}
                      className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 w-24"
                      placeholder={t('weight.quantity') || 'Quantity'}
                    />
                    {type === 'feed' && (
                      <select
                        value={newRecord.unit}
                        onChange={(e) => setNewRecord({ ...newRecord, unit: e.target.value })}
                        className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
                      >
                        <option value="bags">{t('weight.unit_bags')}</option>
                        <option value="kg">{t('weight.unit_kg')}</option>
                        <option value="g">{t('weight.unit_grams')}</option>
                        <option value="tonnes">{t('weight.unit_tonnes')}</option>
                      </select>
                    )}
                    {type === 'water' && (
                      <span className="text-sm text-gray-600">{t('weight.unit_liters')}</span>
                    )}
                    <button
                      onClick={handleAddRecord}
                      disabled={saving}
                      className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {t('common.add')}
                    </button>
                  </div>
                </div>
              )}

              {!canEdit && (
                <div className="text-center py-4 text-sm text-gray-500 border-t border-gray-200 mt-6">
                  {t('weight.edit_permission_required') || 'Only owners can edit feed/water records. Contact your farm owner to request permission.'}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
