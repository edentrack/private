import { useState, useEffect } from 'react';
import { Egg } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { FlockSwitcher } from '../common/FlockSwitcher';
import { EggIntervalTaskTracker } from '../tasks/egg/EggIntervalTaskTracker';
import { EggInventory } from './EggInventory';
import { EggProductionReports } from './EggProductionReports';
import { Flock } from '../../types/database';

export default function EggCollectionsPage() {
  const { currentFarm } = useAuth();
  const [selectedFlockId, setSelectedFlockId] = useState<string | null>(null);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [eggsPerTray, setEggsPerTray] = useState(30);

  useEffect(() => {
    if (!currentFarm) return;
    setEggsPerTray(currentFarm.eggs_per_tray || 30);
    supabase
      .from('flocks')
      .select('id, name, type, status, current_count, initial_count, start_date')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        const layers = (data || []).filter((f: any) => f.type === 'Layer' || f.type === 'Mixed');
        setFlocks(layers);
        if (layers.length === 1) setSelectedFlockId(layers[0].id);
      });
  }, [currentFarm?.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-yellow-50 text-yellow-600">
          <Egg className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Egg Collections</h1>
          <p className="text-sm text-gray-500">Record intervals, track inventory and view production trends.</p>
        </div>
      </div>

      {flocks.length > 1 && (
        <FlockSwitcher
          selectedFlockId={selectedFlockId}
          onFlockChange={setSelectedFlockId}
          showAllOption={true}
          label="Select flock"
        />
      )}

      <EggIntervalTaskTracker />

      {selectedFlockId && (
        <EggInventory
          flockId={selectedFlockId}
          eggsPerTray={eggsPerTray}
        />
      )}

      <EggProductionReports flockId={selectedFlockId} />
    </div>
  );
}
