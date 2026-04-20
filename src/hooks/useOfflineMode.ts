/**
 * React Hook for Offline Mode
 * Provides utilities for offline data operations
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { queueCreate, queueUpdate, queueDelete } from '../lib/offlineSync';
import { isOnline } from '../lib/offlineDB';

interface UseOfflineModeResult {
  isOnline: boolean;
  createRecord: <T>(table: string, data: T) => Promise<any>;
  updateRecord: <T>(table: string, id: string, data: Partial<T>) => Promise<any>;
  deleteRecord: (table: string, id: string) => Promise<void>;
}

export function useOfflineMode(): UseOfflineModeResult {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const createRecord = useCallback(async <T,>(table: string, data: T): Promise<any> => {
    if (online && navigator.onLine) {
      // Try online first
      try {
        const { data: result, error } = await supabase
          .from(table)
          .insert(data)
          .select()
          .single();

        if (error) throw error;
        return result;
      } catch (error: any) {
        // If online operation fails, queue it
        console.warn(`Online create failed for ${table}, queuing:`, error);
      }
    }

    // Queue for offline sync
    const pendingId = await queueCreate(table, data);
    
    // Return a temporary object with the pending ID
    return {
      id: pendingId,
      ...data,
      _pending: true,
      _offline: true,
    };
  }, [online]);

  const updateRecord = useCallback(async <T,>(table: string, id: string, data: Partial<T>): Promise<any> => {
    if (online && navigator.onLine) {
      try {
        const { data: result, error } = await supabase
          .from(table)
          .update(data)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return result;
      } catch (error: any) {
        console.warn(`Online update failed for ${table}, queuing:`, error);
      }
    }

    await queueUpdate(table, id, data);
    
    return {
      id,
      ...data,
      _pending: true,
      _offline: true,
    };
  }, [online]);

  const deleteRecord = useCallback(async (table: string, id: string): Promise<void> => {
    if (online && navigator.onLine) {
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('id', id);

        if (error) throw error;
        return;
      } catch (error: any) {
        console.warn(`Online delete failed for ${table}, queuing:`, error);
      }
    }

    await queueDelete(table, id);
  }, [online]);

  return {
    isOnline: online,
    createRecord,
    updateRecord,
    deleteRecord,
  };
}
