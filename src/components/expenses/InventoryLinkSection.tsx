import { useState, useEffect } from 'react';
import { Package, Plus, Search } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { FeedStock, OtherInventory, InventoryLinkType } from '../../types/database';

interface InventoryLinkSectionProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  inventoryType: InventoryLinkType;
  onInventoryTypeChange: (type: InventoryLinkType) => void;
  selectedItemId: string;
  onSelectedItemIdChange: (id: string) => void;
  quantity: string;
  onQuantityChange: (quantity: string) => void;
  unit: string;
  onUnitChange: (unit: string) => void;
  newItemName: string;
  onNewItemNameChange: (name: string) => void;
  newItemCategory: string;
  onNewItemCategoryChange: (category: string) => void;
}

export function InventoryLinkSection({
  enabled,
  onEnabledChange,
  inventoryType,
  onInventoryTypeChange,
  selectedItemId,
  onSelectedItemIdChange,
  quantity,
  onQuantityChange,
  unit,
  onUnitChange,
  newItemName,
  onNewItemNameChange,
  newItemCategory,
  onNewItemCategoryChange,
}: InventoryLinkSectionProps) {
  const { currentFarm } = useAuth();
  const [feedItems, setFeedItems] = useState<FeedStock[]>([]);
  const [otherItems, setOtherItems] = useState<OtherInventory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewItemForm, setShowNewItemForm] = useState(false);

  useEffect(() => {
    if (enabled && currentFarm) {
      loadInventoryItems();
    }
  }, [enabled, inventoryType, currentFarm]);

  const loadInventoryItems = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      if (inventoryType === 'feed') {
        const { data } = await supabase
          .from('feed_types')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .order('name');

        if (data) {
          setFeedItems(data);
        }
      } else if (inventoryType === 'other') {
        const { data } = await supabase
          .from('other_inventory_items')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .order('name');

        if (data) {
          setOtherItems(data);
        }
      }
    } catch (error) {
      console.error('Error loading inventory items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInventoryTypeChange = (type: 'feed' | 'other') => {
    onInventoryTypeChange(type);
    onSelectedItemIdChange('');
    setShowNewItemForm(false);
    setSearchTerm('');

    if (type === 'feed') {
      onUnitChange('bags');
    } else {
      onUnitChange('units');
    }
  };

  const getCurrentItems = () => {
    if (inventoryType === 'feed') return feedItems;
    if (inventoryType === 'other') return otherItems;
    return [];
  };

  const getFilteredItems = () => {
    const items = getCurrentItems();
    if (!searchTerm) return items;

    return items.filter(item => {
      const name = inventoryType === 'feed'
        ? (item as FeedStock).name || (item as any).feed_type
        : (item as OtherInventory).name || (item as any).item_name;
      return name.toLowerCase().includes(searchTerm.toLowerCase());
    });
  };

  const getItemName = (item: FeedStock | OtherInventory) => {
    return inventoryType === 'feed'
      ? (item as FeedStock).name || (item as any).feed_type
      : (item as OtherInventory).name || (item as any).item_name;
  };

  return (
    <div className="space-y-2 border-t pt-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enableInventory"
          checked={enabled}
          onChange={(e) => {
            onEnabledChange(e.target.checked);
            if (!e.target.checked) {
              setShowNewItemForm(false);
              onInventoryTypeChange('none');
              onSelectedItemIdChange('');
              onQuantityChange('');
            } else {
              onInventoryTypeChange('feed');
              onUnitChange('bags');
            }
          }}
          className="w-4 h-4 text-[#3D5F42] border-gray-300 rounded focus:ring-[#3D5F42]"
        />
        <label htmlFor="enableInventory" className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 cursor-pointer">
          <Package className="w-3.5 h-3.5 text-[#3D5F42]" />
          Add to inventory
        </label>
      </div>

      {enabled && (
        <div className="pl-6 space-y-2 bg-gray-50 rounded-lg p-2.5">
          <div>
            <div className="flex gap-3 mb-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  value="feed"
                  checked={inventoryType === 'feed'}
                  onChange={() => handleInventoryTypeChange('feed')}
                  className="w-3.5 h-3.5 text-[#3D5F42] border-gray-300 focus:ring-[#3D5F42]"
                />
                <span className="text-xs text-gray-700">Feed</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  value="other"
                  checked={inventoryType === 'other'}
                  onChange={() => handleInventoryTypeChange('other')}
                  className="w-3.5 h-3.5 text-[#3D5F42] border-gray-300 focus:ring-[#3D5F42]"
                />
                <span className="text-xs text-gray-700">Other</span>
              </label>
            </div>
          </div>

          {!showNewItemForm ? (
            <div>
              <div className="relative mb-1.5">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3D5F42] focus:border-transparent transition-all text-xs"
                />
              </div>
              {loading ? (
                <div className="text-xs text-gray-500 py-1">Loading...</div>
              ) : (
                <>
                  <select
                    id="inventoryItem"
                    value={selectedItemId}
                    onChange={(e) => onSelectedItemIdChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3D5F42] focus:border-transparent transition-all text-xs"
                    required={enabled}
                  >
                    <option value="">Select item...</option>
                    {getFilteredItems().map((item) => (
                      <option key={item.id} value={item.id}>
                        {getItemName(item)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewItemForm(true);
                      onSelectedItemIdChange('new');
                    }}
                    className="mt-1.5 flex items-center gap-1 text-xs text-[#3D5F42] hover:text-[#2d4632] font-medium"
                  >
                    <Plus className="w-3 h-3" />
                    New item
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <input
                  id="newItemName"
                  type="text"
                  value={newItemName}
                  onChange={(e) => onNewItemNameChange(e.target.value)}
                  placeholder={inventoryType === 'feed' ? 'Item name' : 'Item name'}
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3D5F42] focus:border-transparent transition-all text-xs"
                  required={enabled && showNewItemForm}
                />
              </div>

              {inventoryType === 'other' && (
                <select
                  id="newItemCategory"
                  value={newItemCategory}
                  onChange={(e) => onNewItemCategoryChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3D5F42] focus:border-transparent transition-all text-xs"
                  required={enabled && showNewItemForm && inventoryType === 'other'}
                >
                  <option value="">Category...</option>
                  <option value="Medication">Medication</option>
                  <option value="Equipment">Equipment</option>
                  <option value="Supplies">Supplies</option>
                  <option value="Other">Other</option>
                </select>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowNewItemForm(false);
                  onSelectedItemIdChange('');
                  onNewItemNameChange('');
                  onNewItemCategoryChange('');
                }}
                className="text-xs text-gray-600 hover:text-gray-900"
              >
                ← Use existing
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <input
                id="inventoryQuantity"
                type="number"
                step="0.5"
                min="0"
                value={quantity}
                onChange={(e) => onQuantityChange(e.target.value)}
                placeholder="Qty"
                className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3D5F42] focus:border-transparent transition-all text-xs"
                required={enabled}
              />
            </div>

            <div>
              <input
                id="inventoryUnit"
                type="text"
                value={unit}
                onChange={(e) => onUnitChange(e.target.value)}
                placeholder={inventoryType === 'feed' ? 'bags' : 'units'}
                className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#3D5F42] focus:border-transparent transition-all text-xs"
                required={enabled}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
