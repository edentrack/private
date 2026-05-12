/**
 * Farm Journal logger.
 *
 * Two surfaces:
 *
 *   1. logActivity() — auto-generated when an app action mutates data.
 *      Every place we insert into sales / expenses / mortality / feed
 *      etc. fires this immediately after the mutation succeeds. The
 *      resulting journal row carries linked_table + linked_id in
 *      metadata so the Journal page can deep-link back to the record.
 *
 *   2. logNote() — manual notes from the journal composer. Manager /
 *      owner / worker / Eden write here. Photos + reactions live on
 *      these rows.
 *
 * The logger never throws — a failed journal write should never break
 * the underlying action (sale, mortality log, etc.). Errors are
 * surfaced to console for diagnostics.
 *
 * RLS: the inserts run under the user's auth context; the journal_
 * entries table requires author_id = auth.uid() + farm membership.
 * If the user lacks membership somehow (race condition during invite
 * acceptance), the insert silently fails and we don't fight the user.
 */

import { supabase } from './supabaseClient';

// Activity types map 1:1 with the entry_type enum in the migration.
// Use these constants — don't pass raw strings — so a typo gets caught
// at type-check time instead of silently miscategorising rows.
export type ActivityType =
  | 'sale_logged'
  | 'expense_logged'
  | 'feed_logged'
  | 'mortality_logged'
  | 'vaccine_logged'
  | 'flock_created'
  | 'flock_archived'
  | 'task_completed'
  | 'egg_collected'
  | 'payment_received'
  | 'team_member_added'
  | 'inventory_added'
  | 'withdrawal_cleared'
  | 'weight_logged'
  | 'other';

export type NoteType =
  | 'observation'
  | 'financial'
  | 'milestone'
  | 'personal'
  | 'health'
  | 'auto_summary';

export type AuthorRole = 'owner' | 'manager' | 'worker' | 'viewer';

interface LogActivityArgs {
  farmId: string;
  flockId?: string | null;
  entryType: ActivityType;
  /** Human-readable summary. Format: "Three Samples (manager) sold 10
   * broilers at 5,000 XAF each — total 50,000 XAF". Subject + verb +
   * object so the timeline reads like a news feed. */
  body: string;
  /** Optional title shown above the body — usually skipped for
   * activity rows; the body itself is short enough. */
  title?: string;
  /** Carries enough info to deep-link back to the underlying record.
   * Convention: { linked_table, linked_id, ...whatever else useful }. */
  metadata?: Record<string, unknown>;
  /** Snapshot the actor's role at log time so a later role change
   * doesn't rewrite history. */
  actorRole: AuthorRole;
}

/**
 * Format an actor's display name with their role chip baked in.
 * Result: "Three Samples (manager)". If full_name is missing, falls
 * back to the email's local part.
 */
export function formatActorName(args: {
  fullName?: string | null;
  email?: string | null;
  role: AuthorRole;
}): string {
  const display =
    args.fullName?.trim() ||
    (args.email ? args.email.split('@')[0] : 'Someone');
  return `${display} (${args.role})`;
}

export async function logActivity(args: LogActivityArgs): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // No session = no activity log. Don't break the calling action.
      return;
    }
    const { error } = await supabase.from('journal_entries').insert({
      farm_id: args.farmId,
      flock_id: args.flockId ?? null,
      author_id: user.id,
      author_role: args.actorRole,
      author_kind: 'system',
      channel: 'activity',
      entry_type: args.entryType,
      title: args.title ?? null,
      body: args.body,
      metadata: args.metadata ?? {},
    });
    if (error) console.warn('[journalLogger] logActivity failed:', error);
  } catch (err) {
    console.warn('[journalLogger] logActivity threw:', err);
  }
}

interface LogNoteArgs {
  farmId: string;
  flockId?: string | null;
  entryType: NoteType;
  title?: string;
  body: string;
  photoUrls?: string[];
  isPrivate?: boolean;
  isImportant?: boolean;
  actorRole: AuthorRole;
  /**
   * The date/time the event actually happened. Lets the composer
   * backdate notes ("I'm logging Tuesday's mortality on Wednesday").
   * Defaults server-side to now() when omitted, so existing callers
   * keep working without change.
   */
  occurredAt?: string;
}

export async function logNote(args: LogNoteArgs): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const insertRow: Record<string, unknown> = {
      farm_id: args.farmId,
      flock_id: args.flockId ?? null,
      author_id: user.id,
      author_role: args.actorRole,
      author_kind: 'user',
      channel: 'notes',
      entry_type: args.entryType,
      title: args.title ?? null,
      body: args.body,
      photo_urls: args.photoUrls ?? [],
      is_private: args.isPrivate ?? false,
      is_important: args.isImportant ?? false,
      metadata: {},
    };
    // Only include occurred_at when the caller explicitly set it.
    // Otherwise let the DB default (now()) apply — keeps backwards
    // compat with old clients that don't know about the field yet.
    if (args.occurredAt) insertRow.occurred_at = args.occurredAt;

    const { data, error } = await supabase
      .from('journal_entries')
      .insert(insertRow)
      .select('id')
      .single();
    if (error) {
      console.warn('[journalLogger] logNote failed:', error);
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    console.warn('[journalLogger] logNote threw:', err);
    return null;
  }
}

/**
 * Render a number with thousands separators and the currency code so
 * activity body lines read consistently:
 *   formatMoney(50000, 'XAF') => "50,000 XAF"
 *   formatMoney(7.5, 'USD')   => "7.50 USD"
 */
export function formatMoney(amount: number, currency: string): string {
  // Match the same decimal convention as utils/regionalPayment.ts.
  const noDecimals = ['XAF', 'XOF', 'NGN', 'GHS', 'KES', 'UGX', 'TZS', 'RWF', 'EGP', 'MAD', 'ZMW', 'ZAR'];
  const decimals = noDecimals.includes(currency.toUpperCase()) ? 0 : 2;
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${currency}`;
}
