import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';

interface ImpersonationState {
  active: boolean;
  targetUserId: string | null;
  targetFarmId: string | null;
  logId: string | null;
  startedAt: string | null;
  reason: string | null;
  targetUserName: string | null;
  targetFarmName: string | null;
}

interface ImpersonationContextType {
  impersonation: ImpersonationState;
  startImpersonation: (
    targetUserId: string,
    targetFarmId: string,
    targetUserName: string,
    targetFarmName: string,
    reason?: string
  ) => Promise<void>;
  endImpersonation: () => Promise<void>;
  isImpersonating: boolean;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

const STORAGE_KEY = 'impersonation_state';

const defaultState: ImpersonationState = {
  active: false,
  targetUserId: null,
  targetFarmId: null,
  logId: null,
  startedAt: null,
  reason: null,
  targetUserName: null,
  targetFarmName: null,
};

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  // Always start from defaultState — never trust localStorage until DB-verified
  const [impersonation, setImpersonation] = useState<ImpersonationState>(defaultState);
  const [verified, setVerified] = useState(false);

  // On mount: verify any stored impersonation session against the DB
  useEffect(() => {
    async function verifyStoredSession() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) { setVerified(true); return; }

        const parsed: ImpersonationState = JSON.parse(stored);
        if (!parsed.logId || !parsed.active) {
          localStorage.removeItem(STORAGE_KEY);
          setVerified(true);
          return;
        }

        // Verify the log record exists, belongs to the current admin, and is still open
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          localStorage.removeItem(STORAGE_KEY);
          setVerified(true);
          return;
        }

        const { data, error } = await supabase
          .from('super_admin_impersonation_logs')
          .select('id, admin_id, target_user_id, target_farm_id, reason, started_at, ended_at')
          .eq('id', parsed.logId)
          .eq('admin_id', user.id)
          .is('ended_at', null)
          .maybeSingle();

        if (error || !data) {
          // Log not found, already ended, or belongs to different admin — reject
          localStorage.removeItem(STORAGE_KEY);
          setVerified(true);
          return;
        }

        // Verified: restore state from DB record (not from localStorage content)
        setImpersonation({
          active: true,
          targetUserId: data.target_user_id,
          targetFarmId: data.target_farm_id,
          logId: data.id,
          startedAt: data.started_at,
          reason: data.reason,
          // Display names not in DB — keep from localStorage if IDs match, else null
          targetUserName: parsed.targetUserId === data.target_user_id ? parsed.targetUserName : null,
          targetFarmName: parsed.targetFarmId === data.target_farm_id ? parsed.targetFarmName : null,
        });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setVerified(true);
      }
    }

    verifyStoredSession();
  }, []);

  // Persist verified state changes to localStorage
  useEffect(() => {
    if (!verified) return;
    if (impersonation.active) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(impersonation));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [impersonation, verified]);

  // Clear impersonation on sign-out
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setImpersonation(defaultState);
        localStorage.removeItem(STORAGE_KEY);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const startImpersonation = async (
    targetUserId: string,
    targetFarmId: string,
    targetUserName: string,
    targetFarmName: string,
    reason?: string
  ) => {
    try {
      const { data, error } = await supabase.rpc('admin_start_impersonation', {
        p_target_user_id: targetUserId,
        p_target_farm_id: targetFarmId,
        p_reason: reason || null,
      });

      if (error) throw error;

      const newState: ImpersonationState = {
        active: true,
        targetUserId,
        targetFarmId,
        logId: data,
        startedAt: new Date().toISOString(),
        reason: reason || null,
        targetUserName,
        targetFarmName,
      };

      // Write synchronously so AuthContext reads the correct state on the
      // immediately following refreshSession() call (React effects run async)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      setImpersonation(newState);
    } catch (error) {
      console.error('Failed to start impersonation:', error);
      throw error;
    }
  };

  const endImpersonation = async () => {
    if (!impersonation.logId) return;

    try {
      const { error } = await supabase.rpc('admin_end_impersonation', {
        p_log_id: impersonation.logId,
      });

      if (error) throw error;

      setImpersonation(defaultState);
    } catch (error) {
      console.error('Failed to end impersonation:', error);
      throw error;
    }
  };

  return (
    <ImpersonationContext.Provider
      value={{
        impersonation,
        startImpersonation,
        endImpersonation,
        isImpersonating: impersonation.active,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (context === undefined) {
    throw new Error('useImpersonation must be used within ImpersonationProvider');
  }
  return context;
}
