import { AlertTriangle, X } from 'lucide-react';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { useState } from 'react';

const IMPERSONATION_STORAGE_KEY = 'impersonation_state';

export function ImpersonationBanner() {
  const { impersonation, endImpersonation, isImpersonating } = useImpersonation();
  const [isEnding, setIsEnding] = useState(false);

  if (!isImpersonating) return null;

  const handleExit = async () => {
    if (isEnding) return;

    setIsEnding(true);
    try {
      // Clear impersonation from storage first so you always get your account back
      // even if the server call fails (e.g. network or permission error)
      localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
      try {
        await endImpersonation();
      } catch (e) {
        console.warn('Exit support mode RPC failed (you are still exited):', e);
      }
      // Reload the page so auth loads your real profile, farm, and data
      window.location.reload();
    } catch (error) {
      console.error('Failed to exit support mode:', error);
      alert('Failed to exit. Try: clear site data for this app or open in a new tab and sign in again.');
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-bold">Support Mode Active</span>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-sm">
            <span className="opacity-90">
              Viewing as: <strong>{impersonation.targetUserName || 'User'}</strong>
            </span>
            <span className="opacity-75">|</span>
            <span className="opacity-90">
              Farm: <strong>{impersonation.targetFarmName || 'Unknown'}</strong>
            </span>
            {impersonation.reason && (
              <>
                <span className="opacity-75">|</span>
                <span className="opacity-90 italic">
                  {impersonation.reason}
                </span>
              </>
            )}
          </div>

          <div className="flex sm:hidden text-xs opacity-90">
            {impersonation.targetUserName} / {impersonation.targetFarmName}
          </div>
        </div>

        <button
          onClick={handleExit}
          disabled={isEnding}
          className="flex items-center gap-2 px-4 py-1.5 bg-white text-orange-600 font-medium rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Exit Support Mode</span>
          <span className="sm:hidden">Exit</span>
        </button>
      </div>

      <div className="bg-orange-600 bg-opacity-30 text-center py-1 text-xs">
        Support mode: You can edit data to help resolve user issues
      </div>
    </div>
  );
}
