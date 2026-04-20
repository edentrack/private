import { useState, useEffect } from 'react';
import { X, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface Farm {
  id: string;
  name: string;
}

interface ImpersonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail: string;
}

export function ImpersonationModal({
  isOpen,
  onClose,
  targetUserId,
  targetUserName,
  targetUserEmail,
}: ImpersonationModalProps) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingFarms, setLoadingFarms] = useState(true);
  const { startImpersonation } = useImpersonation();
  const { refreshSession } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadUserFarms();
    }
  }, [isOpen, targetUserId]);

  const loadUserFarms = async () => {
    setLoadingFarms(true);
    try {
      const { data, error } = await supabase
        .from('farm_members')
        .select('farm_id, farms!inner(id, name)')
        .eq('user_id', targetUserId)
        .eq('is_active', true);

      if (error) throw error;

      const farmsList = (data || []).map((member: any) => ({
        id: member.farms.id,
        name: member.farms.name,
      }));

      setFarms(farmsList);
      if (farmsList.length === 1) {
        setSelectedFarmId(farmsList[0].id);
      }
    } catch (error) {
      console.error('Failed to load farms:', error);
      showToast('Failed to load user farms', 'error');
    } finally {
      setLoadingFarms(false);
    }
  };

  const handleStart = async () => {
    if (!selectedFarmId) {
      showToast('Please select a farm', 'error');
      return;
    }

    setLoading(true);
    try {
      const selectedFarm = farms.find(f => f.id === selectedFarmId);
      if (!selectedFarm) throw new Error('Farm not found');

      await startImpersonation(
        targetUserId,
        selectedFarmId,
        targetUserName || targetUserEmail,
        selectedFarm.name,
        reason
      );

      showToast('Support mode activated', 'success');
      onClose();

      // Reload auth context so dashboard uses target user/farm (and RLS allows super admin to read that farm's data)
      if (refreshSession) await refreshSession();
      window.location.hash = '#/dashboard';
    } catch (error) {
      console.error('Failed to start impersonation:', error);
      showToast('Failed to start support mode', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-orange-600" />
            <h2 className="text-xl font-bold text-gray-900">View As User</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-1">User:</p>
            <p className="font-semibold text-gray-900">{targetUserName || 'Unknown'}</p>
            <p className="text-sm text-gray-600">{targetUserEmail}</p>
          </div>

          {loadingFarms ? (
            <div className="py-4 text-center text-gray-600">
              Loading farms...
            </div>
          ) : farms.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-gray-600 mb-2">This user has no active farms.</p>
              <p className="text-sm text-gray-500">Cannot start support mode.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Farm
                </label>
                <select
                  value={selectedFarmId}
                  onChange={(e) => setSelectedFarmId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  required
                >
                  <option value="">Choose a farm...</option>
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Support ticket #1234"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-xs text-orange-800">
                  You will enter read-only support mode. This session will be logged for audit purposes.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStart}
                  disabled={loading || !selectedFarmId}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Starting...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      Start Support Mode
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
