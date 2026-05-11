import { useEffect, useRef, useState } from 'react';
import { X, Check, EyeOff, Star, ImagePlus, Loader2, AtSign } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logNote, type NoteType, type AuthorRole } from '../../lib/journalLogger';

interface MentionablePerson {
  id: string;
  name: string;
  role: string;
}

/**
 * Note templates — quick-start scaffolds for the most common journal
 * notes. Each template fills in the type, title, and a body skeleton
 * the farmer just completes. We keep this list short on purpose:
 * five templates that cover ~80% of what farmers actually write.
 * Adding more would defeat the "one-stop quick capture" goal.
 */
const NOTE_TEMPLATES: ReadonlyArray<{
  id: string;
  emoji: string;
  label: string;
  type: NoteType;
  title: string;
  bodyScaffold: string;
}> = [
  {
    id: 'daily-check',
    emoji: '✅',
    label: 'Daily check',
    type: 'observation',
    title: 'Daily morning check',
    bodyScaffold: 'Birds:\nFeed:\nWater:\nMortality:\nNotes:',
  },
  {
    id: 'vaccine-round',
    emoji: '💉',
    label: 'Vaccine round',
    type: 'health',
    title: 'Vaccination',
    bodyScaffold: 'Vaccine:\nDosage:\nBatch / lot:\nWithdrawal:\nNotes:',
  },
  {
    id: 'weekly-recap',
    emoji: '📊',
    label: 'Weekly recap',
    type: 'milestone',
    title: 'Week recap',
    bodyScaffold: 'Wins:\nIssues:\nNext week focus:',
  },
  {
    id: 'feed-issue',
    emoji: '🌾',
    label: 'Feed issue',
    type: 'observation',
    title: 'Feed quality issue',
    bodyScaffold: 'Supplier:\nWhat I noticed:\nAction taken:',
  },
  {
    id: 'reminder',
    emoji: '📝',
    label: 'Reminder',
    type: 'personal',
    title: '',
    bodyScaffold: 'Remember to ',
  },
];

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
  // Photo upload state. We stage files locally, upload on Save, and
  // attach the resulting public URLs to the journal_entries.photo_urls
  // array. Reusing the existing `inventory-photos` bucket so we don't
  // need a new storage policy.
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // @mentions state. Load teammates on mount; surface a typeahead
  // when the user types '@' followed by some letters. On insert we
  // replace "@<query>" with "@Name" and stash the mentioned user's
  // id into mentioned set so the journal_mentions rows can be
  // written alongside the entry. Server-side push fires from a DB
  // trigger we'll wire next pass — for now the mention persists in
  // the entry's body + a journal_mentions row.
  const [teammates, setTeammates] = useState<MentionablePerson[]>([]);
  const [mentioned, setMentioned] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [caretPos, setCaretPos] = useState<number>(0);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('farm_members')
        .select('user_id, role, profiles!inner (full_name, email)')
        .eq('farm_id', farmId);
      const list: MentionablePerson[] = ((data ?? []) as unknown as Array<{
        user_id: string;
        role: string;
        profiles: { full_name: string | null; email: string | null };
      }>).map(r => ({
        id: r.user_id,
        name: r.profiles.full_name || r.profiles.email?.split('@')[0] || 'Someone',
        role: r.role || 'worker',
      }));
      setTeammates(list);
    })();
  }, [farmId]);

  const filteredMentions = mentionQuery === null
    ? []
    : teammates.filter(t => t.name.toLowerCase().includes((mentionQuery || '').toLowerCase())).slice(0, 5);

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const pos = e.target.selectionStart ?? value.length;
    setBody(value);
    setCaretPos(pos);
    // Look back from the caret for an unmatched '@'.
    const slice = value.slice(0, pos);
    const m = slice.match(/(^|\s)@(\w*)$/);
    setMentionQuery(m ? m[2] : null);
  };

  const insertMention = (person: MentionablePerson) => {
    const before = body.slice(0, caretPos).replace(/@\w*$/, `@${person.name} `);
    const after = body.slice(caretPos);
    setBody(before + after);
    setMentioned(prev => new Set(prev).add(person.id));
    setMentionQuery(null);
    // Restore focus and put caret after the inserted mention.
    setTimeout(() => {
      const ref = bodyRef.current;
      if (!ref) return;
      const newCaret = before.length;
      ref.focus();
      ref.setSelectionRange(newCaret, newCaret);
      setCaretPos(newCaret);
    }, 0);
  };

  const actorRole: AuthorRole =
    (currentRole === 'owner' || currentRole === 'manager' || currentRole === 'worker')
      ? currentRole
      : 'worker';

  const handlePickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const safe = files.filter(f => acceptedTypes.includes(f.type) && f.size < 8 * 1024 * 1024);
    if (safe.length !== files.length) {
      toast.error('Some files were skipped (JPEG/PNG/WebP under 8MB only).');
    }
    setPhotoFiles(prev => [...prev, ...safe].slice(0, 6));
    setPhotoPreviews(prev => [...prev, ...safe.map(f => URL.createObjectURL(f))].slice(0, 6));
    // Reset so picking the same file again still triggers onChange
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadPhotos = async (): Promise<string[]> => {
    if (!photoFiles.length) return [];
    setUploadingPhotos(true);
    const urls: string[] = [];
    try {
      for (const file of photoFiles) {
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${farmId}/journal/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('inventory-photos')
          .upload(path, file, { contentType: file.type });
        if (uploadErr) {
          console.warn('[journal] photo upload failed:', uploadErr);
          continue;
        }
        const { data: urlData } = supabase.storage
          .from('inventory-photos')
          .getPublicUrl(path);
        if (urlData?.publicUrl) urls.push(urlData.publicUrl);
      }
    } finally {
      setUploadingPhotos(false);
    }
    return urls;
  };

  const handleSave = async () => {
    if (!body.trim()) {
      toast.error('Write a note before saving');
      return;
    }
    setSaving(true);
    try {
      // Upload any staged photos first. If upload fails for a file
      // we skip it but keep going — the user can still save the note.
      const photoUrls = await uploadPhotos();

      const id = await logNote({
        farmId,
        flockId,
        entryType,
        title: title.trim() || undefined,
        body: body.trim(),
        photoUrls,
        isPrivate,
        isImportant,
        actorRole,
      });
      if (!id) {
        toast.error('Could not save the note. Try again.');
        return;
      }

      // Persist @mentions. Each mention becomes a journal_mentions
      // row that a future push trigger reads to notify the tagged
      // teammate. Failure here is non-fatal — the note saves
      // regardless. We only insert mentions for users whose names
      // still appear in the saved body (avoids stale rows when the
      // owner inserted then deleted a mention).
      const stillInBody = Array.from(mentioned).filter(uid => {
        const t = teammates.find(p => p.id === uid);
        return t && body.includes(`@${t.name}`);
      });
      if (stillInBody.length > 0) {
        const mentionRows = stillInBody.map(uid => ({
          entry_id: id,
          mentioned_user_id: uid,
        }));
        const { error: mErr } = await supabase.from('journal_mentions').insert(mentionRows);
        if (mErr) console.warn('[journal] Mentions not written:', mErr);

        // Fire push notifications to the mentioned teammates. The
        // send-push-notification edge function filters by each
        // subscription's `journal_mention` category preference
        // (default true; users can opt out in Settings →
        // Notifications). Best-effort: a push failure never affects
        // the saved entry.
        try {
          const me = (await supabase.auth.getUser()).data.user;
          const authorName =
            teammates.find(t => t.id === me?.id)?.name
            || me?.email?.split('@')[0]
            || 'Someone';
          const previewBody = body.trim().length > 80
            ? body.trim().slice(0, 77) + '…'
            : body.trim();
          await supabase.functions.invoke('send-push-notification', {
            body: {
              user_ids: stillInBody,
              title: `${authorName} mentioned you`,
              body: previewBody,
              url: '/#/journal',
              tag: `journal-mention-${id}`,
              category: 'journal_mention',
            },
          });
        } catch (pushErr) {
          console.warn('[journal] Mention push failed (non-fatal):', pushErr);
        }
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
          {/* Templates — one-tap fills the form with a starter
              scaffold for common note types. The farmer can still
              edit before saving. Sets type + title + body skeleton.
              Designed so a 5-second "daily check" can be jotted
              without thinking about structure. */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Start from a template <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setEntryType(t.type);
                    setTitle(t.title);
                    setBody(t.bodyScaffold);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 hover:border-[#3D5F42] hover:bg-[#3D5F42]/5 transition-colors flex items-center gap-1 text-gray-700"
                >
                  <span>{t.emoji}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

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

          <div className="relative">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Note *
              <span className="text-gray-400 font-normal ml-1">
                <AtSign className="w-3 h-3 inline align-text-bottom" />
                mention a teammate to tag them
              </span>
            </label>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={handleBodyChange}
              onKeyUp={e => setCaretPos((e.target as HTMLTextAreaElement).selectionStart ?? body.length)}
              onClick={e => setCaretPos((e.target as HTMLTextAreaElement).selectionStart ?? body.length)}
              rows={6}
              placeholder="What did you see? What needs to happen? Type @ to mention a teammate."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42] resize-none"
            />
            {/* Mention typeahead — anchored just below the textarea
                when an active @query is being typed. Tap or click a
                row to insert the mention. */}
            {filteredMentions.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {filteredMentions.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => insertMention(p)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                  >
                    <span className="w-6 h-6 rounded-full bg-[#3D5F42] text-white flex items-center justify-center text-xs font-bold">
                      {p.name[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span className="font-medium text-gray-900">{p.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">{p.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Photos — up to 6, JPEG/PNG/WebP under 8MB each. Stored
              under inventory-photos/{farmId}/journal/. */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Photos <span className="text-gray-400 font-normal">(optional, up to 6)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {photoPreviews.map((url, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {photoFiles.length < 6 && (
                <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 cursor-pointer transition-colors">
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[10px] mt-0.5">Add</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handlePickPhotos}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
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
            disabled={saving || uploadingPhotos || !body.trim()}
            className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#2F4A34] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving || uploadingPhotos ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {uploadingPhotos ? 'Uploading photos…' : 'Saving…'}</>
            ) : (
              <><Check className="w-4 h-4" /> Save note</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
