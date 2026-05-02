import { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, AlertTriangle, Plus, Receipt, Pencil, Trash2, Info, Eye, EyeOff, Egg, X, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { Farm, Expense } from '../../types/database';
import { AddFeedTypeModal } from './AddFeedTypeModal';
import { EditEggCollectionModal, type EggCollectionRecord } from '../eggs/EditEggCollectionModal';
import { EditEggSaleModal, type EggSaleRecord } from '../eggs/EditEggSaleModal';

interface InventoryPageProps {
  onNavigate: (page: string) => void;
}

interface FeedItem {
  id: string;
  feed_type: string;
  current_stock_bags: number;
  unit: string;
  last_updated: string | null;
}

interface OtherItem {
  id: string;
  item_name: string;
  category: string;
  quantity: number;
  unit: string;
  last_updated: string | null;
  notes?: string;
}

type OtherCategory = 'Medication' | 'Equipment' | 'Supplies';

interface FlockBasic {
  id: string;
  name: string;
  type?: string;
  purpose?: string;
}

export function InventoryPage({ onNavigate }: InventoryPageProps) {
  const { t } = useTranslation();
  const { currentFarm, currentRole } = useAuth();
  const { farmPermissions } = usePermissions();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [eggsPerTray, setEggsPerTray] = useState(30);
  const [feedStock, setFeedStock] = useState<FeedItem[]>([]);
  const [otherInventory, setOtherInventory] = useState<OtherItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [flocks, setFlocks] = useState<FlockBasic[]>([]);
  const [eggCollections, setEggCollections] = useState<EggCollectionRecord[]>([]);
  const [eggSales, setEggSales] = useState<EggSaleRecord[]>([]);
  const [eggInventory, setEggInventory] = useState<{ small_eggs: number; medium_eggs: number; large_eggs: number; jumbo_eggs: number } | null>(null);
  const [damagedEggsTotal, setDamagedEggsTotal] = useState(0);
  const [damagedEggEntries, setDamagedEggEntries] = useState<Array<{ id: string; date: string; damaged: number; flock_id: string | null }>>([]);
  const [showDamagedEggsModal, setShowDamagedEggsModal] = useState(false);
  const [selectedDamagedDate, setSelectedDamagedDate] = useState<string>('');
  const [showEggStockModal, setShowEggStockModal] = useState(false);
  const [eggStockField, setEggStockField] = useState<'small_eggs' | 'medium_eggs' | 'large_eggs' | 'jumbo_eggs' | null>(null);
  const [eggStockAdjustment, setEggStockAdjustment] = useState('');
  const [eggStockMode, setEggStockMode] = useState<'eggs' | 'trays'>('eggs');
  const [eggStockTrays, setEggStockTrays] = useState('');
  const [eggStockLoose, setEggStockLoose] = useState('');
  const [eggStockSaving, setEggStockSaving] = useState(false);
  const [editingCollection, setEditingCollection] = useState<EggCollectionRecord | null>(null);
  const [editingSale, setEditingSale] = useState<EggSaleRecord | null>(null);
  const [showEggAdjustModal, setShowEggAdjustModal] = useState(false);
  const [expandedCollectionDates, setExpandedCollectionDates] = useState<Set<string>>(new Set());
  const [expandedSaleDates, setExpandedSaleDates] = useState<Set<string>>(new Set());
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [showAddFeedModal, setShowAddFeedModal] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState<FeedItem | null>(null);
  const [adjustment, setAdjustment] = useState('');
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [relatedExpenses, setRelatedExpenses] = useState<Expense[]>([]);
  const [relatedFeedUsage, setRelatedFeedUsage] = useState<Array<{ usage_date: string; quantity_used: number; unit?: string }>>([]);
  const [selectedItemName, setSelectedItemName] = useState('');
  const [selectedItemUnit, setSelectedItemUnit] = useState('bags');
  const [showOtherModal, setShowOtherModal] = useState(false);
  const [editingOtherItem, setEditingOtherItem] = useState<OtherItem | null>(null);
  const [otherCategory, setOtherCategory] = useState<OtherCategory>('Medication');
  const [otherName, setOtherName] = useState('');
  const [otherQuantity, setOtherQuantity] = useState('');
  const [otherUnit, setOtherUnit] = useState('units');
  const [otherError, setOtherError] = useState('');
  const [otherSaving, setOtherSaving] = useState(false);
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set());

  const loadEggRecords = useCallback(async () => {
    if (!currentFarm?.id) return;
    const { data: collections } = await supabase
      .from('egg_collections')
      .select('*')
      .eq('farm_id', currentFarm.id)
      .order('collection_date', { ascending: false })
      .limit(50);
    const { data: sales } = await supabase
      .from('egg_sales')
      .select('*')
      .eq('farm_id', currentFarm.id)
      .order('sale_date', { ascending: false })
      .limit(50);
    setEggCollections((collections as EggCollectionRecord[]) || []);
    setEggSales((sales as EggSaleRecord[]) || []);
  }, [currentFarm?.id]);

  const loadEggInventory = useCallback(async () => {
    if (!currentFarm?.id) return;
    const [{ data: inv }, { data: damagedRows }] = await Promise.all([
      supabase.from('egg_inventory').select('small_eggs, medium_eggs, large_eggs, jumbo_eggs').eq('farm_id', currentFarm.id).maybeSingle(),
      supabase.from('egg_collections').select('id, flock_id, collection_date, collected_on, damaged_eggs, broken').eq('farm_id', currentFarm.id),
    ]);
    setEggInventory(inv || null);
    const damagedTotal = (damagedRows || []).reduce((sum: number, r: any) => {
      const v = Number(r.damaged_eggs ?? r.broken ?? 0) || 0;
      return sum + v;
    }, 0);
    setDamagedEggsTotal(damagedTotal);

    const entries = (damagedRows || [])
      .map((r: any) => {
        const damaged = Number(r.damaged_eggs ?? r.broken ?? 0) || 0;
        const date = (r.collection_date || r.collected_on || '').toString().slice(0, 10);
        return { id: String(r.id), date, damaged, flock_id: (r.flock_id as string | null) ?? null };
      })
      .filter((e: any) => e.damaged > 0 && e.date)
      .sort((a: any, b: any) => b.date.localeCompare(a.date))
      .slice(0, 20);
    setDamagedEggEntries(entries);
  }, [currentFarm?.id]);

  useEffect(() => {
    if (currentFarm?.id) {
      loadInventory();
      loadHiddenItems();
    }
  }, [currentFarm?.id]);

  useEffect(() => {
    if (!currentFarm?.id) return;
    supabase
      .from('flocks')
      .select('id, name, type, purpose')
      .eq('farm_id', currentFarm.id)
      .then(({ data }) => {
        setFlocks((data as FlockBasic[]) || []);
      });
  }, [currentFarm?.id]);

  useEffect(() => {
    const hasLayer = (flocks || []).some(
      (f) => f.type?.toLowerCase() === 'layer' || f.purpose?.toLowerCase() === 'layer' || f.purpose?.toLowerCase() === 'layers'
    );
    if (currentFarm?.id && hasLayer) {
      loadEggRecords();
      loadEggInventory();
    }
  }, [currentFarm?.id, flocks, loadEggRecords, loadEggInventory]);

  useEffect(() => {
    if (!showDamagedEggsModal) return;
    if (!damagedEggEntries.length) return;
    const topDate = damagedEggEntries[0]?.date;
    if (topDate && selectedDamagedDate !== topDate) {
      setSelectedDamagedDate(topDate);
    }
  }, [showDamagedEggsModal, damagedEggEntries, selectedDamagedDate]);

  const collectionsByDate = useMemo(() => {
    const m = new Map<string, EggCollectionRecord[]>();
    eggCollections.forEach((c) => {
      const d = (c.collection_date || c.collected_on || '').toString().slice(0, 10);
      if (!d) return;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(c);
    });
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [eggCollections]);
  const salesByDate = useMemo(() => {
    const m = new Map<string, EggSaleRecord[]>();
    eggSales.forEach((s) => {
      const d = (s.sale_date || s.sold_on || '').toString().slice(0, 10);
      if (!d) return;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(s);
    });
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [eggSales]);

  const canManageInventory =
    currentRole === 'owner' ||
    (currentRole === 'manager' && !!farmPermissions?.managers_can_manage_inventory);

  const canEditInventory = canManageInventory;

  const canEditEggs =
    currentRole === 'owner' ||
    (currentRole === 'manager' && !!farmPermissions?.managers_can_edit_eggs);

  const openEggStockModal = (field: 'small_eggs' | 'medium_eggs' | 'large_eggs' | 'jumbo_eggs') => {
    setEggStockField(field);
    setEggStockAdjustment('');
    setEggStockMode('eggs');
    setEggStockTrays('');
    setEggStockLoose('');
    setShowEggStockModal(true);
  };

  const handleEggStockAdjustment = async () => {
    if (!currentFarm?.id || !eggStockField || !canEditEggs) return;
    setEggStockSaving(true);
    try {
      const { data: inv } = await supabase
        .from('egg_inventory')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .maybeSingle();

      const currentValue = Number(inv?.[eggStockField] ?? eggInventory?.[eggStockField] ?? 0) || 0;
      let nextValue = currentValue;

      if (eggStockMode === 'trays') {
        const traysNum = Number(eggStockTrays) || 0;
        const looseNum = Number(eggStockLoose) || 0;
        nextValue = Math.max(0, Math.round(traysNum * eggsPerTray + looseNum));
      } else {
        const raw = eggStockAdjustment.trim();
        const parsed = parseFloat(raw);
        if (Number.isNaN(parsed)) return;
        const isDelta = raw.startsWith('+') || raw.startsWith('-');
        nextValue = Math.max(0, isDelta ? currentValue + parsed : parsed);
      }

      if (inv) {
        await supabase
          .from('egg_inventory')
          .update({ [eggStockField]: nextValue, last_updated: new Date().toISOString() } as any)
          .eq('farm_id', currentFarm.id);
      } else {
        await supabase
          .from('egg_inventory')
          .insert({ farm_id: currentFarm.id, [eggStockField]: nextValue, last_updated: new Date().toISOString() } as any);
      }

      await loadEggInventory();
      setShowEggStockModal(false);
      setEggStockField(null);
      setEggStockAdjustment('');
      setEggStockTrays('');
      setEggStockLoose('');
    } catch (e) {
      console.error('Error adjusting egg stock:', e);
    } finally {
      setEggStockSaving(false);
    }
  };

  const loadHiddenItems = () => {
    if (!currentFarm?.id) return;
    const storageKey = `hidden_inventory_items_${currentFarm.id}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const hidden = JSON.parse(stored);
        setHiddenItems(new Set(hidden));
      } catch (e) {
        console.error('Error loading hidden items:', e);
      }
    }
  };

  const toggleItemVisibility = (itemKey: string) => {
    if (!currentFarm?.id) return;
    const newHidden = new Set(hiddenItems);
    if (newHidden.has(itemKey)) {
      newHidden.delete(itemKey);
    } else {
      newHidden.add(itemKey);
    }
    setHiddenItems(newHidden);
    const storageKey = `hidden_inventory_items_${currentFarm.id}`;
    localStorage.setItem(storageKey, JSON.stringify(Array.from(newHidden)));
  };

  const getItemKey = (type: 'feed' | 'other', name: string) => {
    return `${type}:${name}`;
  };

  const loadInventory = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const { data: farmData } = await supabase
        .from('farms')
        .select('*')
        .eq('id', currentFarm.id)
        .single();

      if (farmData) {
        setFarm(farmData);
        if ((farmData as any).eggs_per_tray) setEggsPerTray(Number((farmData as any).eggs_per_tray) || 30);
      }

      // Load feed stock from unified feed_inventory table (joined with feed_types)
      const { data: feeds } = await supabase
        .from('feed_inventory')
        .select(`
          id,
          quantity,
          updated_at,
          feed_type:feed_types(id, name, unit)
        `)
        .eq('farm_id', currentFarm.id)
        .order('feed_type(name)');

      if (feeds) {
        const mappedFeeds: FeedItem[] = (feeds as any[])
          .map((row) => {
            const ft = Array.isArray(row.feed_type) ? row.feed_type[0] : row.feed_type;
            if (!ft?.name) return null;
            return {
              id: row.id as string,
              feed_type: ft.name as string,
              current_stock_bags: Number(row.quantity) || 0,
              unit: (ft.unit as string) || 'bags',
              last_updated: (row.updated_at as string | null) ?? null,
            } as FeedItem;
          })
          .filter((f): f is FeedItem => f !== null);

        setFeedStock(mappedFeeds);
      }

      // Load other inventory from legacy other_inventory table (source of truth for UI)
      const { data: otherItems } = await supabase
        .from('other_inventory')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .order('item_name');

      if (otherItems) {
        const mapped: OtherItem[] = (otherItems as any[]).map((row) => ({
          id: row.id,
          item_name: (row.item_name ?? row.name) as string,
          category: row.category as string,
          quantity: Number(row.quantity) ?? 0,
          unit: (row.unit as string) ?? 'units',
          last_updated: (row.last_updated ?? row.updated_at ?? null) as string | null,
        }));
        // Deduplicate by (item_name, category): one card per logical item, sum quantities so UI never shows doubled/wrong totals
        const byKey = new Map<string, OtherItem>();
        for (const item of mapped) {
          const key = `${item.item_name.trim().toLowerCase()}|${item.category}`;
          const existing = byKey.get(key);
          if (!existing) {
            byKey.set(key, { ...item });
          } else {
            existing.quantity += item.quantity;
            if (item.last_updated && (!existing.last_updated || item.last_updated > existing.last_updated)) {
              existing.last_updated = item.last_updated;
            }
          }
        }
        setOtherInventory(Array.from(byKey.values()));
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFeedItem = async (feed: FeedItem) => {
    if (!currentFarm?.id || !canManageInventory) return;
    const confirmed = window.confirm(
      t('inventory.confirm_delete_feed_item', { name: feed.feed_type }) ||
        `Delete feed item "${feed.feed_type}"?`
    );
    if (!confirmed) return;

    try {
      await supabase
        .from('feed_inventory')
        .delete()
        .eq('id', feed.id)
        .eq('farm_id', currentFarm.id);
      await loadInventory();
    } catch (error) {
      console.error('Error deleting feed item:', error);
    }
  };

  const handleDeleteOtherItem = async (item: OtherItem) => {
    if (!currentFarm?.id || !canManageInventory) return;
    const confirmed = window.confirm(
      t('inventory.confirm_delete_item', { name: item.item_name }) ||
        `Delete item "${item.item_name}"?`
    );
    if (!confirmed) return;

    try {
      await supabase
        .from('other_inventory')
        .delete()
        .eq('id', item.id)
        .eq('farm_id', currentFarm.id);
      await loadInventory();
    } catch (error) {
      console.error('Error deleting inventory item:', error);
    }
  };

  const loadRelatedExpenses = async (itemId: string, itemName: string, isFeed = false, unit = 'bags') => {
    if (!currentFarm?.id) return;

    try {
      let expenseIds: string[] = [itemId];
      let feedTypeId: string | null = null;
      if (isFeed) {
        const { data: fi } = await supabase
          .from('feed_inventory')
          .select('feed_type_id')
          .eq('id', itemId)
          .single();
        if (fi?.feed_type_id) {
          feedTypeId = fi.feed_type_id;
          expenseIds = [itemId, fi.feed_type_id];
        }
      }
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .in('inventory_item_id', expenseIds)
        .order('incurred_on', { ascending: false });

      setRelatedExpenses(data || []);
      setSelectedItemName(itemName);
      setSelectedItemUnit(unit);

      if (isFeed && feedTypeId) {
        const { data: usage } = await supabase
          .from('inventory_usage')
          .select('usage_date, quantity_used, feed_type:feed_types(unit)')
          .eq('farm_id', currentFarm.id)
          .eq('feed_type_id', feedTypeId)
          .eq('item_type', 'feed')
          .order('usage_date', { ascending: false })
          .limit(50);
        const records = (usage || []).map((r: any) => ({
          usage_date: r.usage_date,
          quantity_used: Number(r.quantity_used) || 0,
          unit: r.feed_type?.unit || unit,
        }));
        setRelatedFeedUsage(records);
      } else {
        setRelatedFeedUsage([]);
      }
      setShowExpensesModal(true);
    } catch (error) {
      console.error('Error loading related expenses:', error);
    }
  };

  const handleFeedAdjustment = async () => {
    if (!selectedFeed || !adjustment) return;

    const raw = adjustment.trim();
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return;

    try {
      const current = Number(selectedFeed.current_stock_bags) || 0;
      // If the user types +10 / -5 treat it as an adjustment; otherwise treat as "set stock"
      const isDelta = raw.startsWith('+') || raw.startsWith('-');
      const newStock = Math.max(0, isDelta ? current + parsed : parsed);

      await supabase
        .from('feed_inventory')
        .update({
          quantity: newStock,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedFeed.id);

      setShowFeedModal(false);
      setSelectedFeed(null);
      setAdjustment('');
      loadInventory();
    } catch (error) {
      console.error('Error updating feed stock:', error);
    }
  };

  const openOtherModal = (category: OtherCategory, item?: OtherItem | null) => {
    setOtherCategory(category);
    if (item) {
      setEditingOtherItem(item);
      setOtherName(item.item_name);
      setOtherQuantity(String(item.quantity));
      setOtherUnit(item.unit || (category === 'Medication' ? 'grams' : 'units'));
    } else {
      setEditingOtherItem(null);
      setOtherName('');
      setOtherQuantity('');
      setOtherUnit(category === 'Medication' ? 'grams' : 'units');
    }
    setOtherError('');
    setShowOtherModal(true);
  };

  const handleOtherSubmit = async () => {
    if (!currentFarm?.id) return;
    if (!otherName.trim()) {
      setOtherError('Please enter a name');
      return;
    }
    const qty = parseFloat(otherQuantity);
    if (Number.isNaN(qty) || qty < 0) {
      setOtherError('Please enter a valid quantity');
      return;
    }

    setOtherSaving(true);
    setOtherError('');
    try {
      const nameTrimmed = otherName.trim();
      const now = new Date().toISOString();

      const consolidateDuplicates = async (keepId: string) => {
        const { data: duplicates } = await supabase
          .from('other_inventory_items')
          .select('id')
          .eq('farm_id', currentFarm.id)
          .eq('name', nameTrimmed)
          .eq('category', otherCategory)
          .neq('id', keepId);
        if (duplicates?.length) {
          for (const row of duplicates) {
            await supabase.from('other_inventory_items').delete().eq('id', row.id);
          }
        }
      };

      if (editingOtherItem) {
        const { error: updateError } = await supabase
          .from('other_inventory_items')
          .update({
            name: nameTrimmed,
            quantity: qty,
            unit: otherUnit || 'units',
            updated_at: now,
          })
          .eq('id', editingOtherItem.id);
        if (updateError) throw updateError;
        await consolidateDuplicates(editingOtherItem.id);
        setEditingOtherItem(null);
        setShowOtherModal(false);
        loadInventory();
        return;
      }

      const { data: existing } = await supabase
        .from('other_inventory')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .eq('item_name', nameTrimmed)
        .eq('category', otherCategory)
        .maybeSingle();

      if (existing) {
        const existingId = existing.id as string;
        await supabase
          .from('other_inventory_items')
          .update({
            name: nameTrimmed,
            quantity: qty,
            unit: otherUnit || (existing as any).unit || 'units',
            updated_at: now,
          })
          .eq('id', existingId);
        await consolidateDuplicates(existingId);
      } else {
        const { error: insertError } = await supabase
          .from('other_inventory')
          .insert({
            farm_id: currentFarm.id,
            item_name: nameTrimmed,
            category: otherCategory,
            quantity: qty,
            unit: otherUnit || 'units',
          });
        if (insertError) throw insertError;
      }
      setShowOtherModal(false);
      loadInventory();
    } catch (error: any) {
      setOtherError(error?.message || 'Failed to add item');
    } finally {
      setOtherSaving(false);
    }
  };

  const lowStockThreshold = 10;
  const hasLayerFlocks = (flocks || []).some(
    (f) => f.type?.toLowerCase() === 'layer' || f.purpose?.toLowerCase() === 'layer' || f.purpose?.toLowerCase() === 'layers'
  );
  // Note: canEditEggs defined above (used for egg stock + record edits)

  const isCameraItem = (item: OtherItem) =>
    item.item_name.toLowerCase().includes('camera');

  const medicationItems = otherInventory.filter(
    (item) => item.category === 'Medication' && !isCameraItem(item)
  );
  const equipmentItems = otherInventory.filter(
    (item) => item.category === 'Equipment' || isCameraItem(item)
  );
  const suppliesItems = otherInventory.filter(
    (item) => item.category === 'Supplies' && !isCameraItem(item)
  );

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return t('inventory.not_available');
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-neon-500 rounded-full animate-spin" />
        </div>
      ) : (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('inventory.title')}</h1>
          <p className="text-[#3D5F42] mt-1 font-medium">{t('inventory.subtitle')}</p>
        </div>
      </div>

      {/* Feed Section */}
      <div className="bg-white rounded-3xl shadow-soft p-6 animate-fade-in-up">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-xl">
              🌾
            </div>
            <h2 className="text-xl font-bold text-gray-900">{t('inventory.feed')} <span className="text-gray-500 font-normal">({feedStock.length})</span></h2>
          </div>
          {canEditInventory && (
            <button
              onClick={() => setShowAddFeedModal(true)}
              className="px-4 py-2 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2F4A34] transition-colors text-sm font-medium inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('inventory.add')}
            </button>
          )}
        </div>

        {feedStock.length === 0 ? (
          <div className="text-center py-8">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">{t('inventory.no_feed_stock')}</p>
            <p className="text-sm text-gray-400">{t('inventory.click_add_to_start')}</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {feedStock.map((feed) => {
              const currentStock = feed.current_stock_bags || 0;
              const isLowStock = currentStock < lowStockThreshold;
              return (
                <div
                  key={feed.id}
                  className={`border-2 rounded-2xl p-3 ${
                    isLowStock ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-bold text-gray-900 text-sm">{feed.feed_type}</h3>
                    {isLowStock && (
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm text-gray-600">{t('inventory.stock')}:</span>
                    <div className="text-right">
                      <span className={`text-xl font-bold ${isLowStock ? 'text-red-600' : 'text-green-600'}`}>
                        {currentStock.toFixed(1)}
                      </span>
                      <span className="text-sm text-gray-500 ml-1">{feed.unit || 'bags'}</span>
                    </div>
                  </div>
                  {isLowStock && (
                    <p className="text-xs text-red-600 font-medium mb-1">{t('inventory.low_stock')}</p>
                  )}
                  <p className="text-xs text-gray-500 mb-2">{t('inventory.last_updated')}: {formatDate(feed.last_updated)}</p>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleItemVisibility(getItemKey('feed', feed.feed_type))}
                      className={`px-3 py-2 rounded-lg transition-colors ${
                        hiddenItems.has(getItemKey('feed', feed.feed_type))
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={hiddenItems.has(getItemKey('feed', feed.feed_type)) ? t('inventory.show_in_dashboard') : t('inventory.hide_from_dashboard')}
                    >
                      {hiddenItems.has(getItemKey('feed', feed.feed_type)) ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedFeed(feed);
                        setAdjustment('');
                        setShowFeedModal(true);
                      }}
                      disabled={currentRole === 'viewer'}
                      className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
                      title={t('inventory.adjust_stock_quantity')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteFeedItem(feed)}
                      disabled={!canManageInventory}
                      className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                      title={t('inventory.delete_feed_item')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {(currentRole === 'owner' || currentRole === 'manager') && (
                      <button
                        onClick={() => loadRelatedExpenses(feed.id, feed.feed_type, true, feed.unit || 'bags')}
                        className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        title={t('inventory.view_related_expenses')}
                      >
                        <Receipt className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Medication Section */}
      <div className="bg-white rounded-3xl shadow-soft p-6 animate-fade-in-up">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-xl">
              💊
            </div>
            <h2 className="text-xl font-bold text-gray-900">{t('inventory.medication')} <span className="text-gray-500 font-normal">({medicationItems.length})</span></h2>
          </div>
          {canEditInventory && (
            <button
              onClick={() => openOtherModal('Medication')}
              className="px-4 py-2 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2F4A34] transition-colors text-sm font-medium inline-flex items-center gap-2"
              title={t('inventory.add_new_medication_item')}
            >
              <Plus className="w-4 h-4" />
              {t('inventory.add')}
            </button>
          )}
        </div>

        {medicationItems.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-6xl mx-auto mb-4 text-center">💊</div>
            <p className="text-gray-500">{t('inventory.no_medication_items')}</p>
            <p className="text-sm text-gray-400 mt-1">{t('inventory.click_add_medication')}</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {medicationItems.map((item) => (
              <div key={item.id} className="border-2 border-gray-200 rounded-2xl p-4">
                <h3 className="font-bold text-gray-900 mb-2">{item.item_name}</h3>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm text-gray-600">{t('inventory.stock')}:</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-green-600">{item.quantity.toFixed(1)}</span>
                    <span className="text-sm text-gray-500 ml-1">{item.unit}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-3">{t('inventory.last_updated')}: {formatDate(item.last_updated)}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleItemVisibility(getItemKey('other', item.item_name))}
                    className={`flex-1 px-3 py-2 rounded-lg transition-colors ${
                      hiddenItems.has(getItemKey('other', item.item_name))
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={hiddenItems.has(getItemKey('other', item.item_name)) ? t('inventory.show_in_dashboard') : t('inventory.hide_from_dashboard')}
                  >
                    {hiddenItems.has(getItemKey('other', item.item_name)) ? (
                      <EyeOff className="w-4 h-4 mx-auto" />
                    ) : (
                      <Eye className="w-4 h-4 mx-auto" />
                    )}
                  </button>
                  <button 
                    onClick={() => openOtherModal('Medication', item)}
                    disabled={!canManageInventory}
                    className="flex-1 px-3 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
                    title={t('inventory.edit_item')}
                  >
                    <Pencil className="w-4 h-4 mx-auto" />
                  </button>
                  <button 
                    onClick={() => handleDeleteOtherItem(item)}
                    disabled={!canManageInventory}
                    className="flex-1 px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                    title={t('inventory.delete_item')}
                  >
                    <Trash2 className="w-4 h-4 mx-auto" />
                  </button>
                  {(currentRole === 'owner' || currentRole === 'manager') && (
                    <button
                      onClick={() => loadRelatedExpenses(item.id, item.item_name)}
                      className="flex-1 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                      title={t('inventory.view_related_expenses')}
                    >
                      <Receipt className="w-4 h-4 mx-auto" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Equipment Section */}
      <div className="bg-white rounded-3xl shadow-soft p-6 animate-fade-in-up">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl">
              🔧
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{t('inventory.equipment')}</h2>
              <span className="text-sm text-gray-500">{t('inventory.equipment_reusable')}</span>
              <Info className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500 font-normal">({equipmentItems.length})</span>
            </div>
          </div>
          {canEditInventory && (
            <button
              onClick={() => openOtherModal('Equipment')}
              className="px-4 py-2 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2F4A34] transition-colors text-sm font-medium inline-flex items-center gap-2"
              title={t('inventory.add_new_equipment_item')}
            >
              <Plus className="w-4 h-4" />
              {t('inventory.add')}
            </button>
          )}
        </div>

        {equipmentItems.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-6xl mx-auto mb-4 text-center">🔧</div>
            <p className="text-gray-500">{t('inventory.no_equipment_items')}</p>
            <p className="text-sm text-gray-400 mt-1">{t('inventory.click_add_equipment')}</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {equipmentItems.map((item) => (
              <div key={item.id} className="border-2 border-gray-200 rounded-2xl p-4">
                <h3 className="font-bold text-gray-900 mb-2">{item.item_name}</h3>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm text-gray-600">{t('inventory.stock')}:</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-green-600">{item.quantity.toFixed(1)}</span>
                    <span className="text-sm text-gray-500 ml-1">{item.unit}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-3">{t('inventory.last_updated')}: {formatDate(item.last_updated)}</p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => openOtherModal('Equipment', item)}
                    disabled={!canManageInventory}
                    className="flex-1 px-3 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
                    title={t('inventory.edit_item')}
                  >
                    <Pencil className="w-4 h-4 mx-auto" />
                  </button>
                  <button 
                    onClick={() => handleDeleteOtherItem(item)}
                    disabled={!canManageInventory}
                    className="flex-1 px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                    title={t('inventory.delete_item')}
                  >
                    <Trash2 className="w-4 h-4 mx-auto" />
                  </button>
                  {(currentRole === 'owner' || currentRole === 'manager') && (
                    <button
                      onClick={() => loadRelatedExpenses(item.id, item.item_name)}
                      className="flex-1 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                      title={t('inventory.view_related_expenses')}
                    >
                      <Receipt className="w-4 h-4 mx-auto" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supplies Section */}
      <div className="bg-white rounded-3xl shadow-soft p-6 animate-fade-in-up">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl">
              📦
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{t('inventory.supplies')}</h2>
              <span className="text-sm text-gray-500">{t('inventory.supplies_consumable')}</span>
              <Info className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500 font-normal">({suppliesItems.length})</span>
            </div>
          </div>
          {canEditInventory && (
            <button
              onClick={() => openOtherModal('Supplies')}
              className="px-4 py-2 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2F4A34] transition-colors text-sm font-medium inline-flex items-center gap-2"
              title={t('inventory.add_new_supplies_item')}
            >
              <Plus className="w-4 h-4" />
              {t('inventory.add')}
            </button>
          )}
        </div>

        {suppliesItems.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-6xl mx-auto mb-4 text-center">📦</div>
            <p className="text-gray-500">{t('inventory.no_supplies_items')}</p>
            <p className="text-sm text-gray-400 mt-1">{t('inventory.click_add_supplies')}</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliesItems.map((item) => (
              <div key={item.id} className="border-2 border-gray-200 rounded-2xl p-4">
                <h3 className="font-bold text-gray-900 mb-2">{item.item_name}</h3>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm text-gray-600">{t('inventory.stock')}:</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-green-600">{item.quantity.toFixed(1)}</span>
                    <span className="text-sm text-gray-500 ml-1">{item.unit}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-3">{t('inventory.last_updated')}: {formatDate(item.last_updated)}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleItemVisibility(getItemKey('other', item.item_name))}
                    className={`flex-1 px-3 py-2 rounded-lg transition-colors ${
                      hiddenItems.has(getItemKey('other', item.item_name))
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={hiddenItems.has(getItemKey('other', item.item_name)) ? t('inventory.show_in_dashboard') : t('inventory.hide_from_dashboard')}
                  >
                    {hiddenItems.has(getItemKey('other', item.item_name)) ? (
                      <EyeOff className="w-4 h-4 mx-auto" />
                    ) : (
                      <Eye className="w-4 h-4 mx-auto" />
                    )}
                  </button>
                  <button 
                    onClick={() => openOtherModal('Supplies', item)}
                    disabled={!canManageInventory}
                    className="flex-1 px-3 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
                    title={t('inventory.edit_item')}
                  >
                    <Pencil className="w-4 h-4 mx-auto" />
                  </button>
                  <button 
                    onClick={() => handleDeleteOtherItem(item)}
                    disabled={!canManageInventory}
                    className="flex-1 px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                    title={t('inventory.delete_item')}
                  >
                    <Trash2 className="w-4 h-4 mx-auto" />
                  </button>
                  {(currentRole === 'owner' || currentRole === 'manager') && (
                    <button
                      onClick={() => loadRelatedExpenses(item.id, item.item_name)}
                      className="flex-1 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                      title={t('inventory.view_related_expenses')}
                    >
                      <Receipt className="w-4 h-4 mx-auto" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Eggs: Inventory + Records (merged) */}
      {hasLayerFlocks && (
        <div className="bg-white rounded-3xl shadow-soft p-6 animate-fade-in-up">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Egg className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                {t('inventory.egg_overview', { defaultValue: 'Eggs (Inventory & Records)' })}
                <span className="text-gray-500 font-normal">
                  ({eggCollections.length} {t('inventory.collections') || 'collections'}, {eggSales.length} {t('inventory.sales') || 'sales'})
                </span>
              </h2>
            </div>
            {canEditEggs && (
              <button
                onClick={() => setShowEggAdjustModal(true)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors text-sm font-medium inline-flex items-center gap-2"
                title={t('inventory.adjust_egg_records') || 'Select a record to edit'}
              >
                <Pencil className="w-4 h-4" />
                {t('inventory.adjust_eggs', { defaultValue: t('inventory.adjust') || 'Adjust' })}
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[
              { key: 'small', label: 'Small', value: eggInventory?.small_eggs ?? 0, field: 'small_eggs' as const },
              { key: 'medium', label: 'Medium', value: eggInventory?.medium_eggs ?? 0, field: 'medium_eggs' as const },
              { key: 'large', label: 'Large', value: eggInventory?.large_eggs ?? 0, field: 'large_eggs' as const },
              { key: 'jumbo', label: 'Jumbo', value: eggInventory?.jumbo_eggs ?? 0, field: 'jumbo_eggs' as const },
              { key: 'damaged', label: 'Damaged', value: damagedEggsTotal, field: null },
            ].map((c) => (
              <div key={c.key} className="border-2 border-gray-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-gray-900 mb-2">{c.label} eggs</h3>
                  {canEditEggs && c.field ? (
                    <button
                      type="button"
                      onClick={() => openEggStockModal(c.field)}
                      className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
                      title={t('inventory.edit_egg_stock') || 'Edit egg stock'}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm text-gray-600">{t('inventory.stock')}:</span>
                  <div className="text-right">
                    {c.key === 'damaged' ? (
                      <>
                        <span className="text-2xl font-bold text-red-600">{Number(c.value || 0)}</span>
                        <span className="text-sm text-gray-500 ml-1">eggs</span>
                      </>
                    ) : (
                      <>
                        <span className="text-2xl font-bold text-green-600">
                          {Math.floor(Number(c.value || 0) / eggsPerTray)}
                        </span>
                        <span className="text-sm text-gray-500 ml-1">trays</span>
                      </>
                    )}
                  </div>
                </div>
                {c.key !== 'damaged' && (
                  <p className="text-xs text-gray-500">
                    {Number(c.value || 0) % eggsPerTray} eggs
                  </p>
                )}
                {c.key === 'damaged' && (
                  <button
                    type="button"
                    onClick={() => setShowDamagedEggsModal(true)}
                    className="mt-2 text-xs font-medium text-gray-600 hover:text-gray-900 underline"
                  >
                    View entries
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm text-gray-700 mb-6">
            <span className="font-semibold">Total eggs</span>
            <span className="font-bold text-gray-900">
              {Number(eggInventory?.small_eggs ?? 0) +
                Number(eggInventory?.medium_eggs ?? 0) +
                Number(eggInventory?.large_eggs ?? 0) +
                Number(eggInventory?.jumbo_eggs ?? 0)}
            </span>
          </div>

          {eggCollections.length === 0 && eggSales.length === 0 ? (
            <div className="text-center py-8 border-2 border-gray-200 rounded-2xl">
              <Egg className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">{t('inventory.no_egg_records_yet') || 'No egg collections or sales yet.'}</p>
              <p className="text-sm text-gray-400">{t('inventory.egg_records_desc') || 'Record collections and sales from the dashboard or sales.'}</p>
            </div>
          ) : (
            <div className="border-2 border-gray-200 rounded-2xl p-4">
              <p className="text-sm text-gray-600 mb-2">
                {t('inventory.egg_records_summary') || 'Recent egg collections and sales. Use Adjust to correct a record.'}
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-gray-700">
                  <strong>{eggCollections.length}</strong> {t('inventory.collections') || 'collections'}
                </span>
                <span className="text-gray-700">
                  <strong>{eggSales.length}</strong> {t('inventory.sales') || 'sales'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Egg Stock Adjustment Modal */}
      {showEggStockModal && eggStockField && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {t('inventory.edit_egg_stock') || 'Edit egg stock'}
            </h2>
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                {t('inventory.current_stock_label')}: <strong>{Number(eggInventory?.[eggStockField] ?? 0)}</strong> eggs
              </div>
              <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setEggStockMode('eggs')}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    eggStockMode === 'eggs' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  By eggs
                </button>
                <button
                  type="button"
                  onClick={() => setEggStockMode('trays')}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    eggStockMode === 'trays' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  By trays
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('inventory.adjustment_instruction') || 'Adjustment (use + to add, - to subtract)'}
                </label>
                {eggStockMode === 'eggs' ? (
                  <input
                    type="text"
                    value={eggStockAdjustment}
                    onChange={(e) => setEggStockAdjustment(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
                    placeholder="Type 120 to set, or -10 / +30 to adjust"
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        Trays ({eggsPerTray} / tray)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={eggStockTrays}
                        onChange={(e) => setEggStockTrays(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Loose eggs</label>
                      <input
                        type="number"
                        min={0}
                        max={eggsPerTray - 1}
                        value={eggStockLoose}
                        onChange={(e) => setEggStockLoose(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
                        placeholder="0"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowEggStockModal(false);
                    setEggStockField(null);
                    setEggStockAdjustment('');
                    setEggStockTrays('');
                    setEggStockLoose('');
                  }}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleEggStockAdjustment}
                  disabled={eggStockSaving}
                  className="flex-1 px-6 py-3 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4632] transition-colors font-medium disabled:opacity-50"
                >
                  {eggStockSaving ? (t('inventory.saving') || 'Saving...') : (t('common.update') || 'Update')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Damaged Eggs Entries (read-only) */}
      {showDamagedEggsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Damaged eggs entries</h2>
              <button
                type="button"
                onClick={() => setShowDamagedEggsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                title={t('common.close') || 'Close'}
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {damagedEggEntries.length === 0 ? (
                <p className="text-sm text-gray-500">No damaged eggs recorded.</p>
              ) : (
                (() => {
                  const byDate = new Map<string, Array<{ id: string; damaged: number; flock_id: string | null }>>();
                  damagedEggEntries.forEach((e) => {
                    if (!byDate.has(e.date)) byDate.set(e.date, []);
                    byDate.get(e.date)!.push({ id: e.id, damaged: e.damaged, flock_id: e.flock_id });
                  });
                  const days = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
                  const selected = selectedDamagedDate || days[0];
                  const entries = byDate.get(selected) || [];
                  const dayTotal = entries.reduce((s, x) => s + x.damaged, 0);

                  return (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Day</label>
                        <select
                          value={selected}
                          onChange={(e) => setSelectedDamagedDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm"
                        >
                          {days.map((d) => {
                            const label = new Date(d + 'T12:00:00').toLocaleDateString(undefined, { dateStyle: 'medium' });
                            return (
                              <option key={d} value={d}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                        <div className="text-xs text-red-600 font-semibold mt-1">Total damaged: {dayTotal}</div>
                      </div>

                      {entries.length === 0 ? (
                        <p className="text-sm text-gray-500">No entries for this day.</p>
                      ) : (
                        <div className="space-y-1">
                          {entries.map((x, idx) => (
                            <div
                              key={x.id}
                              className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-xl"
                            >
                              <span>
                                {(x.flock_id && flocks.find((f) => f.id === x.flock_id)?.name) || 'All flocks'} • Entry {idx + 1}
                              </span>
                              <span className="font-semibold text-red-600">{x.damaged}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-xs text-gray-400 pt-2">To edit damaged eggs, use “Adjust eggs” above.</p>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Related Expenses Modal */}
      {showExpensesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {relatedFeedUsage.length > 0 ? t('inventory.item_details') : t('inventory.related_expenses')}
                </h2>
                <p className="text-sm text-gray-600 mt-1">{selectedItemName}</p>
              </div>
              <button
                onClick={() => {
                  setShowExpensesModal(false);
                  setRelatedExpenses([]);
                  setRelatedFeedUsage([]);
                  setSelectedItemName('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Plus className="w-6 h-6 text-gray-500 rotate-45" />
              </button>
            </div>

            {/* Feed Usage section - for feed items, show daily usage records */}
            {relatedFeedUsage.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Package className="w-5 h-5 text-green-600" />
                  {t('inventory.feed_usage_history')}
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {relatedFeedUsage.map((u, i) => (
                    <div key={i} className="flex justify-between items-center py-2 px-3 bg-green-50 rounded-lg border border-green-100">
                      <span className="text-sm text-gray-700">{new Date(u.usage_date).toLocaleDateString()}</span>
                      <span className="font-semibold text-green-700">{u.quantity_used.toFixed(1)} {u.unit || selectedItemUnit}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">{t('inventory.feed_usage_from_diu')}</p>
              </div>
            )}

            {relatedExpenses.length === 0 && relatedFeedUsage.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">{t('inventory.no_expenses_found')}</p>
                <p className="text-sm text-gray-400 mt-1">
                  {t('inventory.expenses_linking_info')}
                </p>
              </div>
            ) : relatedExpenses.length > 0 ? (
              <>
                {relatedFeedUsage.length > 0 && (
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-amber-600" />
                    {t('inventory.related_expenses')}
                  </h3>
                )}
                <div className="space-y-3">
                  {relatedExpenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-gray-900">{expense.category}</span>
                            <span className="text-xs bg-gray-100 px-2 py-1 rounded-lg text-gray-600">
                              {new Date(expense.incurred_on || expense.date || '').toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{expense.description}</p>
                          {expense.inventory_quantity != null ? (
                            <div className="text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded-lg inline-flex items-center gap-2">
                              <Package className="w-4 h-4" />
                              {t('inventory.added_to_inventory')}:{' '}
                              <span className="font-semibold">
                                {Number(expense.inventory_quantity).toFixed(1)} {expense.inventory_unit || selectedItemUnit}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-lg font-bold text-gray-900">
                            {expense.amount.toLocaleString()} {expense.currency}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {relatedExpenses.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-4 mt-4">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900">{t('inventory.total_spent')}:</span>
                        <span className="text-xl font-bold text-[#3D5F42]">
                          {relatedExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}{' '}
                          {relatedExpenses[0]?.currency || 'XAF'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Feed Adjustment Modal */}
      {showFeedModal && selectedFeed && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {t('inventory.adjust_stock', { feed: selectedFeed.feed_type })}
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  {t('inventory.current_stock_label')}: <strong>{selectedFeed.current_stock_bags?.toFixed(1) || 0}</strong> {selectedFeed.unit || t('dashboard.bags')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('inventory.adjustment_instruction') || 'Set or adjust stock'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
                  placeholder="Type 28 to set, or -5 / +10 to adjust"
                />
              </div>
              {adjustment && (
                <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-xl text-sm">
                  {t('inventory.new_stock_will_be')}{' '}
                  <strong>
                    {(() => {
                      const raw = adjustment.trim();
                      const parsed = parseFloat(raw);
                      if (Number.isNaN(parsed)) return (selectedFeed.current_stock_bags || 0).toFixed(1);
                      const current = Number(selectedFeed.current_stock_bags) || 0;
                      const isDelta = raw.startsWith('+') || raw.startsWith('-');
                      return Math.max(0, isDelta ? current + parsed : parsed).toFixed(1);
                    })()}
                  </strong>{' '}
                  {selectedFeed.unit || 'bags'}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowFeedModal(false);
                    setSelectedFeed(null);
                    setAdjustment('');
                  }}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                  title={t('inventory.cancel_stock_adjustment')}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleFeedAdjustment}
                  className="flex-1 px-6 py-3 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4632] transition-colors font-medium"
                  title={t('inventory.save_stock_adjustment')}
                >
                  {t('common.update')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Feed Modal */}
      {showAddFeedModal && (
        <AddFeedTypeModal
          onClose={() => setShowAddFeedModal(false)}
          onSuccess={() => {
            setShowAddFeedModal(false);
            loadInventory();
          }}
        />
      )}

      {/* Edit Egg Collection Modal */}
      {editingCollection && (
        <EditEggCollectionModal
          record={editingCollection}
          flocks={flocks}
          onBack={() => {
            setEditingCollection(null);
            setShowEggAdjustModal(true);
          }}
          onClose={() => setEditingCollection(null)}
          onSuccess={() => {
            loadEggRecords();
            loadEggInventory();
            setEditingCollection(null);
          }}
        />
      )}

      {/* Edit Egg Sale Modal */}
      {editingSale && (
        <EditEggSaleModal
          record={editingSale}
          currencyCode={farm?.currency_code || currentFarm?.currency_code || 'XAF'}
          onClose={() => setEditingSale(null)}
          onSuccess={() => {
            loadEggRecords();
            loadEggInventory();
            setEditingSale(null);
          }}
        />
      )}

      {/* Egg Adjust – pick which record to edit */}
      {showEggAdjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Egg className="w-6 h-6 text-amber-600" />
                <h2 className="text-xl font-bold text-gray-900">{t('inventory.select_record_to_edit') || 'Select record to edit'}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEggAdjustModal(false);
                  setExpandedCollectionDates(new Set());
                  setExpandedSaleDates(new Set());
                }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('inventory.collections') || 'Collections'}</h3>
                {collectionsByDate.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2">{t('inventory.no_egg_collections') || 'No egg collections yet.'}</p>
                ) : (
                  <ul className="space-y-1">
                    {collectionsByDate.map(([dateStr, records]) => {
                      const isExpanded = expandedCollectionDates.has(dateStr);
                      const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
                        ? new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { dateStyle: 'medium' })
                        : new Date(dateStr).toLocaleDateString(undefined, { dateStyle: 'medium' });
                      const totalEggs = records.reduce((sum, c) => sum + Number(c.total_eggs ?? (c.trays ?? 0) * 30 - (c.broken ?? 0)), 0);
                      return (
                        <li key={dateStr} className="rounded-xl border border-gray-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedCollectionDates((prev) => {
                              const next = new Set(prev);
                              if (next.has(dateStr)) next.delete(dateStr);
                              else next.add(dateStr);
                              return next;
                            })}
                            className="w-full flex items-center justify-between py-2.5 px-3 bg-gray-50 hover:bg-amber-50/50 text-left text-sm text-gray-900 transition-colors"
                          >
                            <span className="font-medium">{dateLabel}</span>
                            <span className="text-gray-500 text-xs">
                              {records.length} {records.length === 1 ? (t('inventory.entry') || 'entry') : (t('inventory.entries') || 'entries')} · {totalEggs} eggs
                            </span>
                            <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          {isExpanded && (
                            <div className="border-t border-gray-200 bg-white">
                              {records.map((c) => {
                                const total = Number(c.total_eggs ?? (c.trays ?? 0) * 30 - (c.broken ?? 0));
                                const intervalTime = (() => {
                                  if (c.interval_start_at) {
                                    const d = new Date(c.interval_start_at);
                                    if (!Number.isNaN(d.getTime())) {
                                      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                                    }
                                  }
                                  if (c.source_interval_key) {
                                    const m = String(c.source_interval_key).match(/(\d{2}:\d{2})/);
                                    if (m?.[1]) return m[1];
                                  }
                                  return null;
                                })();
                                const editedTime = c.updated_at
                                  ? new Date(c.updated_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                                  : null;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      setShowEggAdjustModal(false);
                                      setExpandedCollectionDates(new Set());
                                      setEditingCollection(c);
                                    }}
                                    className="w-full flex items-center justify-between py-2 px-4 pl-6 hover:bg-amber-50 text-left text-sm text-gray-700 border-b border-gray-100 last:border-b-0"
                                  >
                                    <span>
                                      Collection · {total} eggs
                                      {intervalTime ? ` · ${intervalTime}` : ''}
                                      {editedTime ? ` · edited ${editedTime}` : ''}
                                    </span>
                                    <Pencil className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('inventory.sales') || 'Sales'}</h3>
                {salesByDate.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2">{t('inventory.no_egg_sales') || 'No egg sales yet.'}</p>
                ) : (
                  <ul className="space-y-1">
                    {salesByDate.map(([dateStr, records]) => {
                      const isExpanded = expandedSaleDates.has(dateStr);
                      const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
                        ? new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { dateStyle: 'medium' })
                        : new Date(dateStr).toLocaleDateString(undefined, { dateStyle: 'medium' });
                      const totalEggs = records.reduce((sum, s) => sum + Number(s.total_eggs ?? (s.trays ?? 0) * 30), 0);
                      const totalAmount = records.reduce((sum, s) => sum + Number(s.total_amount ?? 0), 0);
                      return (
                        <li key={dateStr} className="rounded-xl border border-gray-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedSaleDates((prev) => {
                              const next = new Set(prev);
                              if (next.has(dateStr)) next.delete(dateStr);
                              else next.add(dateStr);
                              return next;
                            })}
                            className="w-full flex items-center justify-between py-2.5 px-3 bg-gray-50 hover:bg-green-50/50 text-left text-sm text-gray-900 transition-colors"
                          >
                            <span className="font-medium">{dateLabel}</span>
                            <span className="text-gray-500 text-xs">
                              {records.length} {records.length === 1 ? (t('inventory.entry') || 'entry') : (t('inventory.entries') || 'entries')} · {totalEggs} eggs
                              {totalAmount > 0 ? ` · ${totalAmount.toLocaleString()}` : ''}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          {isExpanded && (
                            <div className="border-t border-gray-200 bg-white">
                              {records.map((s) => {
                                const total = Number(s.total_eggs ?? (s.trays ?? 0) * 30);
                                const amount = Number(s.total_amount ?? 0);
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                      setShowEggAdjustModal(false);
                                      setExpandedSaleDates(new Set());
                                      setEditingSale(s);
                                    }}
                                    className="w-full flex items-center justify-between py-2 px-4 pl-6 hover:bg-green-50 text-left text-sm text-gray-700 border-b border-gray-100 last:border-b-0"
                                  >
                                    <span>Sale · {total} eggs{amount > 0 ? ` · ${amount.toLocaleString()}` : ''}</span>
                                    <Pencil className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Other Inventory Modal */}
      {showOtherModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {editingOtherItem
                  ? (otherCategory === 'Medication' ? t('inventory.edit_medication') : otherCategory === 'Equipment' ? t('inventory.edit_equipment') : t('inventory.edit_supplies'))
                  : (otherCategory === 'Medication' ? t('inventory.add_medication') : otherCategory === 'Equipment' ? t('inventory.add_equipment') : t('inventory.add_supplies'))}
              </h2>
              <button
                onClick={() => { setShowOtherModal(false); setEditingOtherItem(null); }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                title={t('inventory.close_modal')}
              >
                <Plus className="w-5 h-5 text-gray-500 rotate-45" />
              </button>
            </div>

            {otherError && (
              <div className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm mb-4">
                {otherError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('inventory.item_name')}
                </label>
                <input
                  type="text"
                  value={otherName}
                  onChange={(e) => setOtherName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
                  placeholder={otherCategory === 'Medication' ? t('inventory.medication_placeholder') : otherCategory === 'Equipment' ? t('inventory.equipment_placeholder') : t('inventory.supplies_placeholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('inventory.quantity')}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={otherQuantity}
                    onChange={(e) => setOtherQuantity(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('inventory.unit')}
                  </label>
                  <input
                    type="text"
                    value={otherUnit}
                    onChange={(e) => setOtherUnit(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
                    placeholder="units"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowOtherModal(false); setEditingOtherItem(null); }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                  title={t('inventory.cancel_adding_item')}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleOtherSubmit}
                  disabled={otherSaving}
                  className="flex-1 px-4 py-2.5 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2F4A34] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  title={editingOtherItem ? t('inventory.save_changes') : t('inventory.add_new_item_category', { category: otherCategory.toLowerCase() })}
                >
                  {otherSaving ? t('inventory.saving') : editingOtherItem ? t('common.save') : t('inventory.add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
      )}
    </>
  );
}
