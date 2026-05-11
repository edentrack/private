import { useState } from 'react';
import { X, Check, EyeOff, Star } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logNote, type NoteType, type AuthorRole } from '../../lib/journalLogger';

interface Props {
  farmId: string;
  flockId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Manual journal note composer.
 *
 * Phase 1: text-only. Type, title, body, private, important.
 * Phase 2: photo upload (via Capacitor camera on native, file picker
 * on web). The schema already supports photo_urls[].
 * Phase 3: @mentions of team members trigger push notifications.
 *
 * Keeps the form lean — the most common case is "owner jots a quick
 * note", not a structured entry. Title is optional, body is required,
 * type defaults to Observation.
 */
export function AddJournalEntryModal({ farmId, flockId, onClose, onSaved }: Props) {
  const { currentRole } = useAuth();
  const toast = useToast();
  const [entryType, setEntryType] = useState<NoteType>('observation');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isImportant, setIsImportant] = useState(false);
  const [saving, setSaving] = useState(false);

  const actorRole: AuthorRole =
    (currentRole === 'owner' || currentRole === 'manager' || currentRole === 'worker')
      ? currentRole
      : 'worker';

  const handleSave = async () => {
    if (!body.trim()) {
      toast.error('Write a note before saving');
      return;
    }
    setSaving(true);
    try {
      const id = await logNote({
        farmId,
        flockId,
        entryType,
        title: title.trim() || undefined,
        body: body.trim(),
        isPrivate,
        isImportant,
        actorRole,
      });
      if (!id) {
        toast.error('Could not save the note. Try again.');
        return;
      }
      toast.success('Note saved');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">Write a note</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Type selector — defaults to Observation. The full list lets
              owners separate financial notes from personal reminders so
              the journal stays useful when it grows past 100 entries. */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
            <select
              value={entryType}
              onChange={e => setEntryType(e.target.value as NoteType)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
            >
              <option value="observation">👀 Observation (what you noticed)</option>
              <option value="health">🩺 Health (vet / disease / vaccine)</option>
              <option value="financial">💰 Financial (P&L / cash flow)</option>
              <option value="milestone">🏆 Milestone (cycle close-out, target hit)</option>
              <option value="personal">📝 Personal (reminder / TODO)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Title <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="One-line summary..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Note *</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              placeholder="What did you see? What needs to happen?"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42] resize-none"
            />
          </div>

          {/* Flags — keep these out of the way for fast entry */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={e => setIsPrivate(e.target.checked)}
                className="w-4 h-4"
              />
              <EyeOff className="w-4 h-4 text-gray-500" />
              <div>
                <div className="text-xs font-semibold text-gray-900">Private</div>
                <div className="text-[10px] text-gray-500">Only you and the farm owner can see this note.</div>
              </div>
            </label>

            {actorRole === 'owner' && (
              <label className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={isImportant}
                  onChange={e => setIsImportant(e.target.checked)}
                  className="w-4 h-4"
                />
                <Star className="w-4 h-4 text-amber-600" />
                <div>
                  <div className="text-xs font-semibold text-gray-900">Important</div>
                  <div className="text-[10px] text-gray-500">Highlights the note with an amber border for review.</div>
                </div>
              </label>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !body.trim()}
            className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#2F4A34] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
            ) : (
              <><Check className="w-4 h-4" /> Save note</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
