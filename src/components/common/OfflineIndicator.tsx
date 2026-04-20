/**
 * Offline Status Indicator Component
 * Shows connection status and pending sync operations
 */

import { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, CheckCircle, AlertCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isOnline, getPendingOperationsCount } from '../../lib/offlineDB';
import { syncPendingOperations } from '../../lib/offlineSync';

export function OfflineIndicator() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: number; failed: number } | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const updateStatus = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        getPendingOperationsCount().then(setPendingCount);
      }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    // Check pending count periodically
    const interval = setInterval(() => {
      getPendingOperationsCount().then(setPendingCount);
    }, 5000);

    // Listen for sync complete events
    const handleSyncComplete = ((e: CustomEvent) => {
      const result = e.detail;
      setSyncResult(result);
      getPendingOperationsCount().then(setPendingCount);
      setTimeout(() => setSyncResult(null), 5000);
    }) as EventListener;

    window.addEventListener('offline-sync-complete', handleSyncComplete);

    updateStatus();

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      window.removeEventListener('offline-sync-complete', handleSyncComplete);
      clearInterval(interval);
    };
  }, []);

  const handleManualSync = async () => {
    if (!online || syncing) return;
    
    setSyncing(true);
    setSyncResult(null);
    
    try {
      const result = await syncPendingOperations();
      setSyncResult(result);
      await getPendingOperationsCount().then(setPendingCount);
      
      if (result.success > 0) {
        setTimeout(() => setSyncResult(null), 5000);
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  // Always show when offline
  if (!online) {
    return (
      <>
        {/* Top bar indicator - always visible */}
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white px-4 py-2.5 z-[100] shadow-lg flex items-center justify-center gap-2 animate-fade-in">
          <WifiOff className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse flex-shrink-0" />
          <p className="font-semibold text-xs sm:text-sm text-center">
            <span className="hidden sm:inline">Offline Mode - Data will sync when connection is restored</span>
            <span className="sm:hidden">Offline Mode</span>
          </p>
        </div>
        {/* Bottom right detailed indicator - hidden on mobile to avoid clutter */}
        <div className="hidden sm:block fixed bottom-4 right-4 z-50">
          <div className="bg-amber-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-fade-in">
            <WifiOff className="w-5 h-5" />
            <div>
              <p className="font-semibold text-sm">Offline Mode</p>
              <p className="text-xs opacity-90">Data will sync when connection is restored</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (pendingCount === 0 && !syncResult) {
    return null; // Don't show anything when everything is synced
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {pendingCount > 0 ? (
        <div className="bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg min-w-[280px] animate-fade-in">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
              <div>
                <p className="font-semibold text-sm">
                  {syncing ? 'Syncing...' : `${pendingCount} pending item${pendingCount > 1 ? 's' : ''}`}
                </p>
                <p className="text-xs opacity-90">Click to sync now</p>
              </div>
            </div>
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
          
          {syncResult && (
            <div className={`mt-2 pt-2 border-t border-white/20 flex items-center gap-2 text-xs ${
              syncResult.failed > 0 ? 'text-amber-200' : 'text-green-200'
            }`}>
              {syncResult.failed > 0 ? (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>{syncResult.success} synced, {syncResult.failed} failed</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>{syncResult.success} item{syncResult.success !== 1 ? 's' : ''} synced successfully</span>
                </>
              )}
            </div>
          )}
        </div>
      ) : syncResult && syncResult.success > 0 ? (
        <div className="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-fade-in">
          <CheckCircle className="w-5 h-5" />
          <div>
            <p className="font-semibold text-sm">Sync Complete</p>
            <p className="text-xs opacity-90">{syncResult.success} item{syncResult.success !== 1 ? 's' : ''} synced</p>
          </div>
          <button
            onClick={() => setSyncResult(null)}
            className="ml-2 hover:bg-white/20 rounded p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
