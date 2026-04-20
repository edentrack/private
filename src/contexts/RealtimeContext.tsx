import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface RealtimeUpdate {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: any;
  old: any;
}

interface RealtimeSubscriptionContextType {
  isConnected: boolean;
  subscribeToTable: (table: string, callback: (update: RealtimeUpdate) => void) => () => void;
}

const RealtimeSubscriptionContext = createContext<RealtimeSubscriptionContextType | undefined>(undefined);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { currentFarm } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!currentFarm?.id) return;
    if (!isOnline) {
      setIsConnected(false);
      return;
    }

    const farmChannel = supabase.channel(`farm_${currentFarm.id}`)
      .on('presence', { event: 'sync' }, () => {
        setIsConnected(true);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false);
        }
      });

    return () => {
      farmChannel.unsubscribe();
      setIsConnected(false);
    };
  }, [currentFarm?.id, isOnline]);

  // When going offline, close all active channels to stop websocket spam.
  useEffect(() => {
    if (isOnline) return;
    try {
      channelsRef.current.forEach((ch) => ch.unsubscribe());
    } catch {
      // ignore
    }
    channelsRef.current = new Map();
  }, [isOnline]);

  const subscribeToTable = useCallback((table: string, callback: (update: RealtimeUpdate) => void) => {
    if (!currentFarm?.id) return () => {};
    if (!isOnline) return () => {};

    const channelKey = `${currentFarm.id}_${table}_${Math.random().toString(36).slice(2)}`;

    const channel = supabase.channel(channelKey)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: `farm_id=eq.${currentFarm.id}`
        },
        (payload: any) => {
          const update: RealtimeUpdate = {
            table,
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old
          };
          callback(update);
          // Use custom event instead of setState to avoid "Maximum update depth exceeded"
          // - setState here caused cascade re-renders when many realtime events fire
          window.dispatchEvent(new CustomEvent('realtime-update', { detail: update }));
        }
      )
      .subscribe();

    channelsRef.current = new Map(channelsRef.current).set(channelKey, channel);

    return () => {
      channel.unsubscribe();
      const next = new Map(channelsRef.current);
      next.delete(channelKey);
      channelsRef.current = next;
    };
  }, [currentFarm?.id, isOnline]);

  const subscriptionValue = useMemo(
    () => ({ isConnected, subscribeToTable }),
    [isConnected, subscribeToTable]
  );

  return (
    <RealtimeSubscriptionContext.Provider value={subscriptionValue}>
      {children}
    </RealtimeSubscriptionContext.Provider>
  );
}

export function useRealtime() {
  const subscriptionContext = useContext(RealtimeSubscriptionContext);
  const [lastUpdate, setLastUpdate] = useState<RealtimeUpdate | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handler = (e: Event) => {
      const update = (e as CustomEvent<RealtimeUpdate>).detail;
      setLastUpdate(update);
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setLastUpdate(null), 3000);
    };
    window.addEventListener('realtime-update', handler);
    return () => {
      window.removeEventListener('realtime-update', handler);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  if (!subscriptionContext) {
    throw new Error('useRealtime must be used within RealtimeProvider');
  }
  return {
    ...subscriptionContext,
    lastUpdate
  };
}

export function useRealtimeSubscription() {
  const context = useContext(RealtimeSubscriptionContext);
  if (!context) {
    throw new Error('useRealtimeSubscription must be used within RealtimeProvider');
  }
  return context;
}
