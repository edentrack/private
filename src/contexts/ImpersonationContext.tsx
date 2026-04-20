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
  const [impersonation, setImpersonation] = useState<ImpersonationState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : defaultState;
    } catch {
      return defaultState;
    }
  });

  useEffect(() => {
    if (impersonation.active) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(impersonation));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [impersonation]);

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
