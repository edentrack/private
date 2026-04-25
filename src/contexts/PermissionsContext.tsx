import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { FarmPermissions } from '../types/database';
import { useAuth } from './AuthContext';

interface PermissionsContextType {
  farmPermissions: FarmPermissions | null;
  loading: boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

interface PermissionsProviderProps {
  children: ReactNode;
}

export function PermissionsProvider({ children }: PermissionsProviderProps) {
  const { currentFarm, currentRole } = useAuth();
  const [farmPermissions, setFarmPermissions] = useState<FarmPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPermissions = async () => {
    if (!currentFarm?.id) {
      setFarmPermissions(null);
      setLoading(false);
      return;
    }

    const role = currentRole?.toLowerCase();
    // Workers and viewers cannot read or insert farm_permissions (RLS). Use null so nav uses defaults.
    if (role === 'worker' || role === 'viewer') {
      setFarmPermissions(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('farm_permissions')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading farm permissions:', error);
        setFarmPermissions(null);
      } else if (data) {
        setFarmPermissions(data);
      } else {
        // Only owners (and managers if allowed) can INSERT; avoid RLS violation for others.
        // Also skip INSERT when in support mode (super admin impersonating) — their JWT
        // doesn't have write access to a farm they aren't a member of.
        const isImpersonating = (() => {
          try { const s = localStorage.getItem('impersonation_state'); return s ? JSON.parse(s)?.active === true : false; } catch { return false; }
        })();
        const canInsert = (role === 'owner' || role === 'manager') && !isImpersonating;
        if (!canInsert) {
          setFarmPermissions(null);
          setLoading(false);
          return;
        }
        const { data: newPermissions, error: createError } = await supabase
          .from('farm_permissions')
          .insert({ farm_id: currentFarm.id })
          .select()
          .single();

        if (createError) {
          console.error('Error creating default permissions:', createError);
          setFarmPermissions(null);
        } else {
          setFarmPermissions(newPermissions);
        }
      }
    } catch (err) {
      console.error('Unexpected error loading permissions:', err);
      setFarmPermissions(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPermissions();
  }, [currentFarm?.id, currentRole]);

  const refreshPermissions = async () => {
    await loadPermissions();
  };

  return (
    <PermissionsContext.Provider
      value={{
        farmPermissions,
        loading,
        refreshPermissions,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}
