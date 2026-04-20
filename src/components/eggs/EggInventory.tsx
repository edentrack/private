import { useState, useEffect } from 'react';
import { Egg, Plus, TrendingUp, TrendingDown, Package } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LogCollectionModal } from './LogCollectionModal';
import { LogSaleModal } from './LogSaleModal';
import { calculateEggInventory, EggInventoryData } from '../../utils/eggInventory';
import { formatCurrency } from '../../utils/currency';
import { formatEggsCompact } from '../../utils/eggFormatting';

interface EggInventoryProps {
  flockId: string | null;
  eggsPerTray: number;
}

export function EggInventory({ flockId, eggsPerTray }: EggInventoryProps) {
  const { currentFarm, currentRole } = useAuth();
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [inventory, setInventory] = useState<EggInventoryData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadInventory = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const data = await calculateEggInventory(currentFarm.id, flockId, eggsPerTray);
      setInventory(data);
    } catch (error) {
      console.error('Error loading egg inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [currentFarm?.id, flockId, eggsPerTray]);

  const handleCollectionSuccess = () => {
    setShowCollectionModal(false);
    loadInventory();
  };

  const handleSaleSuccess = () => {
    setShowSaleModal(false);
    loadInventory();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!inventory) return null;

  return (
    <>
      <div className="bg-white rounded-3xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 rounded-xl">
              <Egg className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Egg Inventory</h3>
          </div>
          {currentRole && currentRole !== 'viewer' && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowCollectionModal(true)}
                disabled={!flockId}
                className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4632] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Log Collection
              </button>
              <button
                onClick={() => setShowSaleModal(true)}
                disabled={!flockId}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Log Sale
              </button>
            </div>
          )}
        </div>

        {!flockId && (
          <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-xl text-sm mb-6">
            Select a flock to {currentRole === 'viewer' ? 'view' : 'log'} egg collections and sales
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-5 h-5 text-amber-600" />
              <p className="text-sm font-medium text-amber-900">Current Stock</p>
            </div>
            <p className="text-2xl font-bold text-amber-900">
              {formatEggsCompact(inventory.eggsInStock, eggsPerTray)}
            </p>
            <p className="text-sm text-amber-700 mt-1">
              {inventory.eggsInStock.toLocaleString()} total eggs
            </p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <p className="text-sm font-medium text-green-900">Total Collected</p>
            </div>
            <p className="text-2xl font-bold text-green-900">
              {formatEggsCompact(inventory.totalEggsCollected, eggsPerTray)}
            </p>
            <p className="text-sm text-green-700 mt-1">
              {inventory.totalEggsCollected.toLocaleString()} total eggs
            </p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-5 h-5 text-blue-600" />
              <p className="text-sm font-medium text-blue-900">Total Sold</p>
            </div>
            <p className="text-2xl font-bold text-blue-900">
              {formatEggsCompact(inventory.totalEggsSold, eggsPerTray)}
            </p>
            <p className="text-sm text-blue-700 mt-1">
              {inventory.totalEggsSold.toLocaleString()} total eggs
            </p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Egg className="w-5 h-5 text-purple-600" />
              <p className="text-sm font-medium text-purple-900">Available</p>
            </div>
            <p className="text-2xl font-bold text-purple-900">
              {formatEggsCompact(inventory.eggsInStock, eggsPerTray)}
            </p>
            <p className="text-sm text-purple-700 mt-1">{inventory.eggsInStock.toLocaleString()} total eggs</p>
          </div>
        </div>

        {inventory.lastCollectionDate && (
          <div className="text-sm text-gray-600">
            Last collection: {new Date(inventory.lastCollectionDate).toLocaleDateString()}
            {inventory.lastSaleDate && (
              <span className="ml-4">
                Last sale: {new Date(inventory.lastSaleDate).toLocaleDateString()}
              </span>
            )}
          </div>
        )}
      </div>

      {showCollectionModal && flockId && (
        <LogCollectionModal
          flockId={flockId}
          onClose={() => setShowCollectionModal(false)}
          onSuccess={handleCollectionSuccess}
        />
      )}

      {showSaleModal && flockId && (
        <LogSaleModal
          flockId={flockId}
          eggsPerTray={eggsPerTray}
          onClose={() => setShowSaleModal(false)}
          onSuccess={handleSaleSuccess}
        />
      )}
    </>
  );
}
