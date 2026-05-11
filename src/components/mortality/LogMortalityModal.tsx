import { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { logActivity, formatActorName, type AuthorRole } from '../../lib/journalLogger';
import { useLanguage } from '../../contexts/LanguageContext';
import { Flock } from '../../types/database';
import { useOfflineWrite } from '../../hooks/useOfflineWrite';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { todayLocal } from '../../utils/dateUtils';

interface LogMortalityModalProps {
  flock?: Flock | null;
  flockId?: string;
  onClose: () => void;
  onLogged?: () => void;
  onSuccess?: () => void;
  createTaskRecord?: boolean;
}

export function LogMortalityModal({ flock, flockId, onClose, onLogged, onSuccess, createTaskRecord = false }: LogMortalityModalProps) {
  const { user, currentFarm, profile, currentRole } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const species = useFarmSpecies();
  const animalTerm = species.animalTermPlural.toLowerCase();
  const groupTerm = species.groupTerm.toLowerCase();
  const { tryWrite, isNetworkError } = useOfflineWrite();
  const [currentFlock, setCurrentFlock] = useState<Flock | null>(flock || null);
  const [date, setDate] = useState(todayLocal());
  const [count, setCount] = useState('');
  const [reason, setReason] = useState(species.lossReasons[0] ?? 'Disease');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (flockId && !flock) {
      loadFlock();
    } else if (flock) {
      setCurrentFlock(flock);
    }
  }, [flockId, flock]);

  const loadFlock = async () => {
    if (!flockId || !currentFarm?.id) return;

    // Defense-in-depth: scope by farm_id alongside id.
    const { data } = await supabase
      .from('flocks')
      .select('*')
      .eq('id', flockId)
      .eq('farm_id', currentFarm.id)
      .single();

    if (data) {
      setCurrentFlock(data);
    }
  };

  useEffect(() => {
    if (currentFlock) {
      setDate(todayLocal());
      setCount('');
      setReason('Disease');
      setNotes('');
      setError('');
    }
  }, [currentFlock]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentFlock || !user || !currentFarm?.id) return;

    const mortalityCount = parseInt(count);

    if (mortalityCount <= 0) {
      setError(isFr ? `Le nombre de ${animalTerm} morts doit être supérieur à 0` : `Number of dead ${animalTerm} must be greater than 0`);
      return;
    }

    if (mortalityCount > currentFlock.current_count) {
      setError(isFr ? `Ne peut pas dépasser l'effectif actuel de ${currentFlock.current_count} ${animalTerm}` : `Cannot exceed current ${groupTerm} count of ${currentFlock.current_count} ${animalTerm}`);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const mortalityPayload = {
        flock_id: currentFlock.id,
        farm_id: currentFlock.farm_id,
        event_date: date,
        count: mortalityCount,
        cause: reason,
        notes,
        created_by: user.id,
      };

      const { error: insertError } = await supabase.from('mortality_logs').insert(mortalityPayload);

      if (insertError) {
        // Check if it's a network error
        if (isNetworkError(insertError)) {
          // Queue for offline sync and show optimistic success
          await tryWrite('mortality_logs', 'insert', mortalityPayload);
        } else {
          throw insertError;
        }
      }

      const newCount = Math.max(0, currentFlock.current_count - mortalityCount);
      const { error: updateError } = await supabase
        .from('flocks')
        .update({
          current_count: newCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentFlock.id)
        .eq('farm_id', currentFlock.farm_id);

      if (updateError) throw updateError;

      // Farm Journal: log the mortality as an Activity entry. Body
      // reads like "Three Samples (worker) logged 5 mortalities in
      // Flock 1 (Newcastle suspected)".
      {
        const role: AuthorRole = (currentRole === 'owner' || currentRole === 'manager' || currentRole === 'worker') ? currentRole : 'worker';
        const actor = formatActorName({
          fullName: profile?.full_name,
          email: profile?.email ?? user?.email,
          role,
        });
        const causePart = reason ? ` (${reason})` : '';
        const flockName = currentFlock.name || 'flock';
        void logActivity({
          farmId: currentFarm.id,
          flockId: currentFlock.id,
          entryType: 'mortality_logged',
          actorRole: role,
          body: `${actor} logged ${mortalityCount} ${animalTerm} mortalit${mortalityCount === 1 ? 'y' : 'ies'} in ${flockName}${causePart}`,
          metadata: {
            linked_table: 'mortality_logs',
            count: mortalityCount,
            cause: reason,
            event_date: date,
            flock_name: flockName,
          },
        });
      }

      const { error: activityError } = await supabase.from('activity_logs').insert({
        user_id: user.id,
        farm_id: currentFarm.id,
        action: `Logged ${mortalityCount} mortality event${mortalityCount > 1 ? 's' : ''}`,
        entity_type: 'mortality',
        entity_id: currentFlock.id,
        details: {
          flock_name: currentFlock.name,
          count: mortalityCount,
          reason,
          date
        }
      });

      if (activityError && import.meta.env.DEV) console.warn('Activity log error:', activityError);

      if (createTaskRecord) {
        const now = new Date();
        await supabase.from('tasks').insert({
          user_id: user.id,
          farm_id: currentFarm.id,
          flock_id: currentFlock.id,
          title: 'Record mortality for today',
          description: `Recorded ${mortalityCount} mortality event${mortalityCount > 1 ? 's' : ''} - ${reason}. ${notes ? `Notes: ${notes}` : ''}`,
          due_date: now.toISOString().split('T')[0],
          due_at: now.toISOString(),
          status: 'completed',
          completed: true,
          completed_at: now.toISOString(),
          created_by: user.id,
        });
      }

      if (onLogged) onLogged();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isFr ? `Échec de l'enregistrement de la ${species.lossNoun.toLowerCase()}` : 'Failed to log mortality'));
    } finally {
      setLoading(false);
    }
  };

  if (!currentFlock) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-lg w-full p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{isFr ? `Enregistrer une ${species.lossNoun.toLowerCase()}` : `Record ${species.lossNoun}`}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {groupTerm.charAt(0).toUpperCase() + groupTerm.slice(1)}
            </label>
            <div className="px-4 py-3 bg-gray-50 rounded-xl text-gray-900 font-medium">
              {currentFlock.name}
              <span className="text-sm text-gray-500 ml-2">
                ({isFr ? 'Actuel' : 'Current'}: {currentFlock.current_count} {animalTerm})
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              {isFr ? 'Date' : 'Date'}
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayLocal()}
              required
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm"
            />
          </div>

          <div>
            <label htmlFor="count" className="block text-sm font-medium text-gray-700 mb-2">
              {isFr ? `Nombre de ${species.animalTermPlural.toLowerCase()} perdus` : `Number of ${species.animalTermPlural} Lost`}
            </label>
            <input
              id="count"
              type="number"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              required
              min="1"
              max={currentFlock.current_count}
              placeholder="0"
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm"
            />
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
              {isFr ? `Cause de ${species.lossNoun.toLowerCase()}` : 'Cause of Mortality'}
            </label>
            <select
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm"
            >
              {species.lossReasons.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              {isFr ? 'Notes supplémentaires (Optionnel)' : 'Additional Notes (Optional)'}
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={isFr ? 'Tout détail supplémentaire...' : 'Any additional details...'}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all resize-none text-sm"
            />
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-red-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (isFr ? 'Enregistrement…' : 'Saving…') : (isFr ? `Enregistrer ${species.lossNoun.toLowerCase()}` : `Record ${species.lossNoun}`)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
