import { useState, useEffect } from 'react';
import { Calendar, TrendingUp, DollarSign, Loader2, Play, Package, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { FlockSwitcher } from '../common/FlockSwitcher';
import { useEnsureFlockForecastWeeks, useDeleteFlockForecastWeeks, useFlockForecastRollup, useFarmForecastRollup } from '../../hooks/useForecast';
import { supabase } from '../../lib/supabaseClient';
import type { Flock, FlockCycleStatus } from '../../types/database';

export function ForecastPage() {
  const { currentFarm, profile, currentRole } = useAuth();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [selectedFlockId, setSelectedFlockId] = useState<string | null>(null);
  const [startWeek, setStartWeek] = useState(1);
  const [endWeek, setEndWeek] = useState(8);
  const [currentWeek, setCurrentWeek] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const ensureWeeks = useEnsureFlockForecastWeeks();
  const deleteWeeks = useDeleteFlockForecastWeeks();
  const { data: flockRollup, loading: loadingFlockRollup, refetch: refetchFlockRollup } = useFlockForecastRollup(
    selectedFlockId,
    startWeek,
    endWeek
  );
  const { data: farmRollup, loading: loadingFarmRollup, refetch: refetchFarmRollup } = useFarmForecastRollup(
    currentFarm?.id || null,
    startWeek,
    endWeek
  );

  useEffect(() => {
    if (currentFarm?.id) {
      loadFlocks();
    }
  }, [currentFarm?.id]);

  useEffect(() => {
    if (selectedFlockId) {
      loadFlockCycleInfo();
    }
  }, [selectedFlockId]);

  const loadFlocks = async () => {
    if (!currentFarm?.id) return;

    try {
      setLoading(true);
      const { data } = await supabase
        .from('flocks')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        setFlocks(data);
        if (!selectedFlockId) {
          setSelectedFlockId(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading flocks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFlockCycleInfo = async () => {
    if (!selectedFlockId) return;

    try {
      const { data } = await supabase.rpc('get_flock_cycle_status', {
        p_flock_id: selectedFlockId
      });

      if (data) {
        const cycleStatus = data as FlockCycleStatus;
        setCurrentWeek(cycleStatus.current_week || 1);
        setStartWeek(cycleStatus.current_week || 1);
        setEndWeek((cycleStatus.current_week || 1) + 8);
      }
    } catch (error) {
      console.error('Error loading cycle info:', error);
    }
  };

  const handleGenerateWeeks = async () => {
    if (!selectedFlockId) return;

    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const result = await ensureWeeks.execute({
        flockId: selectedFlockId,
        startWeek,
        endWeek
      });

      setSuccessMessage(`Created ${result} forecast week(s)`);

      setTimeout(() => {
        refetchFlockRollup();
        refetchFarmRollup();
      }, 500);

      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (error: any) {
      console.error('Error generating weeks:', error);
      setErrorMessage(error.message || 'Failed to generate weeks');

      setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
    }
  };

  const handleDeleteWeeks = async () => {
    if (!selectedFlockId) return;

    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const result = await deleteWeeks.execute({
        flockId: selectedFlockId,
        startWeek,
        endWeek
      });

      setSuccessMessage(`Deleted ${result} forecast week(s)`);

      setTimeout(() => {
        refetchFlockRollup();
        refetchFarmRollup();
      }, 500);

      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (error: any) {
      console.error('Error deleting weeks:', error);
      setErrorMessage(error.message || 'Failed to delete weeks');

      setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
    }
  };

  const selectedFlock = flocks.find((f) => f.id === selectedFlockId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-neon-600" />
      </div>
    );
  }

  if (flocks.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-gray-900 mb-3">No Active Flocks</h3>
          <p className="text-gray-500">Create a flock to start forecasting expenses</p>
        </div>
      </div>
    );
  }

  const canGenerate = currentRole === 'owner' || currentRole === 'manager';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Expense Forecast</h2>
          <p className="text-gray-500 mt-1">Project and plan upcoming flock expenses</p>
        </div>
      </div>

      <div className="section-card">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Flock</label>
            <FlockSwitcher
              selectedFlockId={selectedFlockId}
              onFlockChange={setSelectedFlockId}
              showAllOption={false}
            />
          </div>

          <div className="w-32">
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Week</label>
            <input
              type="number"
              min="1"
              value={startWeek}
              onChange={(e) => setStartWeek(parseInt(e.target.value) || 1)}
              className="input-light"
            />
          </div>

          <div className="w-32">
            <label className="block text-sm font-medium text-gray-700 mb-2">End Week</label>
            <input
              type="number"
              min={startWeek}
              value={endWeek}
              onChange={(e) => setEndWeek(parseInt(e.target.value) || startWeek + 1)}
              className="input-light"
            />
          </div>

          {canGenerate && (
            <div className="pt-7 flex gap-2">
              <button
                onClick={handleGenerateWeeks}
                disabled={ensureWeeks.loading || !selectedFlockId}
                className="btn-primary inline-flex items-center gap-2"
              >
                {ensureWeeks.loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Generate
                  </>
                )}
              </button>
              <button
                onClick={handleDeleteWeeks}
                disabled={deleteWeeks.loading || !selectedFlockId}
                className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 font-medium transition-colors"
              >
                {deleteWeeks.loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    Delete
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center gap-3 animate-fade-in">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium text-green-800">{successMessage}</p>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center gap-3 animate-fade-in">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm font-medium text-red-800">{errorMessage}</p>
          </div>
        )}

        {selectedFlock && (
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-gray-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">{selectedFlock.name}</p>
                <p className="text-xs text-gray-600">
                  Current Week: {currentWeek} • Type: {selectedFlock.type}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="section-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="icon-circle-yellow">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Flock Forecast Breakdown</h3>
        </div>

        {loadingFlockRollup ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : !flockRollup || flockRollup.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No forecast data yet. Click "Generate Weeks" to create forecast weeks.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {flockRollup.map((week) => (
              <div
                key={week.week_number}
                className="p-4 border border-gray-200 rounded-xl hover:border-neon-400 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-bold text-gray-900">Week {week.week_number}</h4>
                    <p className="text-sm text-gray-600">
                      {new Date(week.week_start_date).toLocaleDateString()} -{' '}
                      {new Date(week.week_end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-neon-700">
                      {profile?.currency_preference || 'XAF'} {week.total_cost.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Total Cost</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 text-sm">
                  {week.feed_cost > 0 && (
                    <div className="bg-orange-50 rounded-lg p-2">
                      <p className="text-xs text-orange-700">Feed</p>
                      <p className="font-semibold text-orange-900">{week.feed_cost.toLocaleString()}</p>
                    </div>
                  )}
                  {week.vaccines_cost > 0 && (
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="text-xs text-blue-700">Vaccines</p>
                      <p className="font-semibold text-blue-900">{week.vaccines_cost.toLocaleString()}</p>
                    </div>
                  )}
                  {week.medication_cost > 0 && (
                    <div className="bg-purple-50 rounded-lg p-2">
                      <p className="text-xs text-purple-700">Medication</p>
                      <p className="font-semibold text-purple-900">{week.medication_cost.toLocaleString()}</p>
                    </div>
                  )}
                  {week.labor_cost > 0 && (
                    <div className="bg-gray-100 rounded-lg p-2">
                      <p className="text-xs text-gray-700">Labor</p>
                      <p className="font-semibold text-gray-900">{week.labor_cost.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="icon-circle-yellow">
            <DollarSign className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Farm Totals (All Flocks)</h3>
        </div>

        {loadingFarmRollup ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : !farmRollup || farmRollup.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No farm forecast data available</p>
          </div>
        ) : (
          <div className="space-y-3">
            {farmRollup.map((item) => (
              <div
                key={item.flock_id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-xl"
              >
                <div>
                  <h4 className="font-semibold text-gray-900">{item.flock_name}</h4>
                  <p className="text-sm text-gray-600">{item.flock_type}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-gray-900">
                    {profile?.currency_preference || 'XAF'} {item.total_cost.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">Weeks {startWeek}-{endWeek}</p>
                </div>
              </div>
            ))}

            <div className="pt-4 border-t-2 border-gray-300">
              <div className="flex items-center justify-between p-4 bg-neon-50 rounded-xl">
                <h4 className="text-lg font-bold text-gray-900">Grand Total</h4>
                <p className="text-2xl font-bold text-neon-700">
                  {profile?.currency_preference || 'XAF'}{' '}
                  {farmRollup.reduce((sum, item) => sum + item.total_cost, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
