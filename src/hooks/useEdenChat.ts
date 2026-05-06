/**
 * useEdenChat — per-farm Eden chat history hook.
 *
 * Source of truth: Supabase (eden_chat_messages).
 * Cache: localStorage per scope, 50 most recent messages.
 *
 * Scopes:
 *   - Per-farm: { mode: 'farm', farmId: <uuid> } — visible to all farm members
 *   - Cross-farm: { mode: 'all' } — private to user (farm_id NULL in DB)
 *
 * On mount we render the cache instantly (sub-50ms paint), then hit Supabase
 * for the latest 50 and replace if newer rows exist. localStorage wipe never
 * loses data because Supabase is authoritative.
 *
 * See docs/EDEN_PER_FARM_CHAT.md for the full design.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type EdenChatScope =
  | { mode: 'farm'; farmId: string }
  | { mode: 'all' };

export interface EdenChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Array<{ url: string; mediaType?: string }> | null;
  log_action?: unknown;
  log_confirmed?: boolean | null;
  log_target_farm_id?: string | null;
  created_at: string;
}

const PAGE_SIZE = 50;

function cacheKey(userId: string, scope: EdenChatScope): string {
  return scope.mode === 'farm'
    ? `eden_chat:user_${userId}:farm_${scope.farmId}`
    : `eden_chat:user_${userId}:all`;
}

function readCache(userId: string, scope: EdenChatScope): EdenChatMessage[] {
  try {
    const raw = localStorage.getItem(cacheKey(userId, scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EdenChatMessage[]) : [];
  } catch {
    return [];
  }
}

function writeCache(userId: string, scope: EdenChatScope, msgs: EdenChatMessage[]): void {
  try {
    // Keep only the most recent PAGE_SIZE messages in cache.
    const trimmed = msgs.slice(-PAGE_SIZE);
    localStorage.setItem(cacheKey(userId, scope), JSON.stringify(trimmed));
  } catch {
    // localStorage quota — non-fatal.
  }
}

export interface UseEdenChatResult {
  messages: EdenChatMessage[];
  /** True while the initial fetch from Supabase is in flight. */
  loading: boolean;
  /** Last fetch error, if any. */
  error: string | null;
  /** Append a user-authored message to Supabase + cache. Returns the persisted row. */
  appendUserMessage: (
    content: string,
    opts?: {
      attachments?: Array<{ url: string; mediaType?: string }>;
    }
  ) => Promise<EdenChatMessage>;
  /** Append an Eden-authored message to Supabase + cache. Returns the persisted row. */
  appendAssistantMessage: (
    content: string,
    opts?: {
      logAction?: unknown;
      logTargetFarmId?: string | null;
    }
  ) => Promise<EdenChatMessage>;
  /** Mark a previously persisted assistant message's log_confirmed flag. */
  setLogConfirmed: (messageId: string, confirmed: boolean) => Promise<void>;
  /** Clear all messages in this scope. Hits Supabase + cache. */
  clear: () => Promise<void>;
  /** Refetch from Supabase (e.g. after retry). */
  refresh: () => Promise<void>;
}

export function useEdenChat(
  userId: string | null | undefined,
  scope: EdenChatScope
): UseEdenChatResult {
  // Render cache instantly. Use a stable cache-key dep to avoid flicker on
  // referentially-different scope objects with the same identity.
  const stableScopeKey = useMemo(
    () => (scope.mode === 'farm' ? `farm:${scope.farmId}` : 'all'),
    [scope.mode, scope.mode === 'farm' ? scope.farmId : null]
  );

  const [messages, setMessages] = useState<EdenChatMessage[]>(() => {
    if (!userId) return [];
    return readCache(userId, scope);
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    if (!userId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setError(null);
    let q = supabase
      .from('eden_chat_messages')
      .select('id, role, content, attachments, log_action, log_confirmed, log_target_farm_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (scope.mode === 'farm') q = q.eq('farm_id', scope.farmId);
    else q = q.is('farm_id', null);

    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []).slice().reverse() as EdenChatMessage[];
    setMessages(rows);
    writeCache(userId, scope, rows);
    setLoading(false);
  }, [userId, stableScopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch whenever userId or scope changes. Reset to cache for the new
  // scope first to avoid showing stale messages from the previous scope.
  useEffect(() => {
    if (!userId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setMessages(readCache(userId, scope));
    setLoading(true);
    fetchFromSupabase();
  }, [userId, stableScopeKey, fetchFromSupabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const appendUserMessage = useCallback<UseEdenChatResult['appendUserMessage']>(
    async (content, opts) => {
      if (!userId) throw new Error('Not signed in');
      const insert = {
        user_id: userId,
        farm_id: scope.mode === 'farm' ? scope.farmId : null,
        role: 'user' as const,
        content,
        attachments: opts?.attachments ?? null,
      };
      const { data, error: err } = await supabase
        .from('eden_chat_messages')
        .insert(insert)
        .select('id, role, content, attachments, log_action, log_confirmed, log_target_farm_id, created_at')
        .single();
      if (err || !data) throw err ?? new Error('Insert failed');
      const row = data as EdenChatMessage;
      setMessages((prev) => {
        const next = [...prev, row];
        writeCache(userId, scope, next);
        return next;
      });
      return row;
    },
    [userId, stableScopeKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const appendAssistantMessage = useCallback<UseEdenChatResult['appendAssistantMessage']>(
    async (content, opts) => {
      if (!userId) throw new Error('Not signed in');
      const insert = {
        user_id: userId,
        farm_id: scope.mode === 'farm' ? scope.farmId : null,
        role: 'assistant' as const,
        content,
        log_action: opts?.logAction ?? null,
        log_target_farm_id: opts?.logTargetFarmId ?? null,
      };
      const { data, error: err } = await supabase
        .from('eden_chat_messages')
        .insert(insert)
        .select('id, role, content, attachments, log_action, log_confirmed, log_target_farm_id, created_at')
        .single();
      if (err || !data) throw err ?? new Error('Insert failed');
      const row = data as EdenChatMessage;
      setMessages((prev) => {
        const next = [...prev, row];
        writeCache(userId, scope, next);
        return next;
      });
      return row;
    },
    [userId, stableScopeKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const setLogConfirmed = useCallback<UseEdenChatResult['setLogConfirmed']>(
    async (messageId, confirmed) => {
      if (!userId) return;
      const { error: err } = await supabase
        .from('eden_chat_messages')
        .update({ log_confirmed: confirmed })
        .eq('id', messageId);
      if (err) {
        // Surface but don't throw — confirmation tracking is best-effort.
        console.warn('setLogConfirmed:', err);
        return;
      }
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === messageId ? { ...m, log_confirmed: confirmed } : m));
        writeCache(userId, scope, next);
        return next;
      });
    },
    [userId, stableScopeKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const clear = useCallback<UseEdenChatResult['clear']>(async () => {
    if (!userId) return;
    let q = supabase.from('eden_chat_messages').delete().eq('user_id', userId);
    if (scope.mode === 'farm') q = q.eq('farm_id', scope.farmId);
    else q = q.is('farm_id', null);
    const { error: err } = await q;
    if (err) {
      setError(err.message);
      return;
    }
    setMessages([]);
    try {
      localStorage.removeItem(cacheKey(userId, scope));
    } catch {
      /* noop */
    }
  }, [userId, stableScopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchFromSupabase();
  }, [fetchFromSupabase]);

  return { messages, loading, error, appendUserMessage, appendAssistantMessage, setLogConfirmed, clear, refresh };
}
